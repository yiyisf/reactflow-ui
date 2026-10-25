import React, { useState, useEffect, useRef } from 'react';
import useWorkflowStore from '../../store/workflowStore';
import { useShallow } from 'zustand/react/shallow';
import useAiStoreSingleton from '../../store/aiStore';
import { useIdeStoresOptional } from '../../store/ideStoresContext';
import { computeDiff } from '../../services/ai/toolExecutor';
import { callAICopilot, AIServiceConfig } from '../../services/aiService';
import { getUpstreamAncestors } from '../../services/wlsp/workflowLsp';
import { TASK_TYPES } from '../../config/taskTypes';
import { CircleCheck, CircleX, CornerDownLeft, GitBranch, Globe, Loader, Settings, ShieldCheck, TriangleAlert, Braces, X, type LucideIcon } from 'lucide-react';

interface InlineCanvasCopilotProps {
  aiConfig?: Partial<AIServiceConfig>;
}

const QUICK_ACTIONS: { label: string; icon: LucideIcon; type?: string; name?: string; action?: string }[] = [
  { label: '在下方插入 HTTP 请求', icon: Globe, type: 'HTTP', name: 'http_call_task' },
  { label: '在下方插入条件分支 (SWITCH)', icon: GitBranch, type: 'SWITCH', name: 'switch_router' },
  { label: '在下方插入 JQ 转换节点', icon: Braces, type: 'JSON_JQ_TRANSFORM', name: 'jq_transform_task' },
  { label: '为当前节点开启自动重试与容错', icon: ShieldCheck, action: 'retry_hardening' },
];

type StatusTone = 'success' | 'warning' | 'failed' | 'working';
const STATUS_META: Record<StatusTone, { icon: LucideIcon; color: string }> = {
  success: { icon: CircleCheck, color: 'var(--cm-status-success)' },
  warning: { icon: TriangleAlert, color: 'var(--cm-status-warning)' },
  failed: { icon: CircleX, color: 'var(--cm-status-failed)' },
  working: { icon: Loader, color: 'var(--cm-ai)' },
};
const ICON_14 = { size: 14, strokeWidth: 1.75, 'aria-hidden': true } as const;
/* Text on a filled --cm-ai surface: the lightest surface in dark mode reads on light indigo, and vice versa. */
const ON_AI = 'var(--cm-surface-0)';

export const InlineCanvasCopilot: React.FC<InlineCanvasCopilotProps> = ({ aiConfig }) => {
  const { inlineCopilotTaskRef, setInlineCopilotTaskRef, selectedTask, workflowDef, taskMap, addNode, updateTask, selectTaskAction } = useWorkflowStore(useShallow((s) => ({
          inlineCopilotTaskRef: s.inlineCopilotTaskRef,
          setInlineCopilotTaskRef: s.setInlineCopilotTaskRef,
          selectedTask: s.selectedTask,
          workflowDef: s.workflowDef,
          taskMap: s.taskMap,
          addNode: s.addNode,
          updateTask: s.updateTask,
          selectTaskAction: s.selectTaskAction,
      })));

  const ideStores = useIdeStoresOptional();
  const setProposal = (ideStores?.aiStore ?? useAiStoreSingleton)((s) => s.setProposal);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ tone: StatusTone; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const targetRef = inlineCopilotTaskRef || selectedTask?.taskReferenceName || null;
  const targetTask = targetRef ? taskMap[targetRef] : null;

  // Global keyboard shortcut: Cmd+K / Ctrl+K opens Inline Canvas Copilot
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const state = useWorkflowStore.getState();
        if (state.inlineCopilotTaskRef) {
          state.setInlineCopilotTaskRef(null);
        } else {
          const fallbackRef =
            state.selectedTask?.taskReferenceName ||
            state.workflowDef?.tasks?.[state.workflowDef.tasks.length - 1]?.taskReferenceName ||
            '__canvas_root__';
          state.setInlineCopilotTaskRef(fallbackRef);
        }
      } else if (e.key === 'Escape' && inlineCopilotTaskRef) {
        setInlineCopilotTaskRef(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inlineCopilotTaskRef, setInlineCopilotTaskRef]);

  useEffect(() => {
    if (inlineCopilotTaskRef) {
      setStatusMsg(null);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [inlineCopilotTaskRef]);

  if (!inlineCopilotTaskRef) return null;

  const upstreamTasks =
    workflowDef && targetRef && targetRef !== '__canvas_root__'
      ? getUpstreamAncestors(workflowDef as any, targetRef)
      : [];

  const handleQuickAction = (item: (typeof QUICK_ACTIONS)[number]) => {
    if (!targetRef || targetRef === '__canvas_root__') return;
    if (item.action === 'retry_hardening' && targetTask) {
      updateTask(targetRef, {
        retryCount: 3,
        retryLogic: 'EXPONENTIAL_BACKOFF',
        retryDelaySeconds: 2,
        timeoutSeconds: 60,
      });
      setStatusMsg({ tone: 'success', text: '已为当前节点开启指数退避重试（3 次）与 60s 超时保护' });
      setTimeout(() => setInlineCopilotTaskRef(null), 900);
      return;
    }

    if (item.type && item.name) {
      const cfg = TASK_TYPES.find((t) => t.type === item.type);
      const newRef = `${item.name}_${Date.now().toString(36).slice(-4)}`;
      addNode(
        {
          data: {
            label: cfg?.label || item.name,
            taskName: item.name,
            taskReferenceName: newRef,
            taskType: item.type,
          },
        },
        targetRef,
        '',
        `inline-cmdk-${newRef}`,
        {}
      );
      setStatusMsg({ tone: 'success', text: `已在 ${targetRef} 后插入 ${item.type} 节点` });
      setTimeout(() => setInlineCopilotTaskRef(null), 700);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = prompt.trim();
    if (!q || !workflowDef) return;

    // Deterministic fast-path for local commands when no API key is configured or user asks for direct node insertion
    const apiKey = aiConfig?.apiKey || localStorage.getItem('AI_API_KEY') || '';
    if (!apiKey) {
      const lower = q.toLowerCase();
      const anchor =
        targetRef && targetRef !== '__canvas_root__'
          ? targetRef
          : workflowDef.tasks[workflowDef.tasks.length - 1]?.taskReferenceName;

      if (anchor) {
        let inferredType = 'SIMPLE';
        if (lower.includes('http') || lower.includes('接口') || lower.includes('请求')) {
          inferredType = 'HTTP';
        } else if (lower.includes('switch') || lower.includes('分支') || lower.includes('判断')) {
          inferredType = 'SWITCH';
        } else if (lower.includes('loop') || lower.includes('循环')) {
          inferredType = 'DO_WHILE';
        } else if (lower.includes('jq') || lower.includes('转换')) {
          inferredType = 'JSON_JQ_TRANSFORM';
        } else if (lower.includes('wait') || lower.includes('等待')) {
          inferredType = 'WAIT';
        }
        const cfg = TASK_TYPES.find((t) => t.type === inferredType);
        const newRef = `${inferredType.toLowerCase()}_${Date.now().toString(36).slice(-4)}`;
        addNode(
          {
            data: {
              label: q.slice(0, 24) || cfg?.label || inferredType,
              taskName: newRef,
              taskReferenceName: newRef,
              taskType: inferredType,
            },
          },
          anchor,
          '',
          `inline-cmdk-${newRef}`,
          {}
        );
        setPrompt('');
        setInlineCopilotTaskRef(null);
        return;
      }
    }

    setLoading(true);
    setStatusMsg({ tone: 'working', text: '正在基于当前节点拓扑上下文生成 Shadow Graph 变更提案…' });
    try {
      const baseUrl = aiConfig?.baseUrl || localStorage.getItem('AI_BASE_URL') || '';
      const model = aiConfig?.model || localStorage.getItem('AI_MODEL') || '';
      const config: Partial<AIServiceConfig> = { apiKey };
      if (baseUrl) config.baseUrl = baseUrl;
      if (model) config.model = model;

      const sysPrompt = `You are a Conductor Workflow Architect. The user is invoking inline Cmd+K on task "${targetRef}" (type: ${targetTask?.type || 'ROOT'}).
Upstream tasks in scope: ${upstreamTasks.map((u) => u.taskReferenceName).join(', ') || 'none'}.
Current workflow JSON:
${JSON.stringify(workflowDef, null, 2)}

Return ONLY the updated full WorkflowDef JSON object (wrapped in \`\`\`json ... \`\`\`) that fulfills the user's instruction.`;

      const resp = await callAICopilot(
        [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: q },
        ],
        config
      );

      const match = resp.match(/```(?:json)?\s*([\s\S]*?)```/) || resp.match(/(\{[\s\S]*\})/);
      if (match) {
        const proposedDef = JSON.parse(match[1]);
        if (proposedDef && Array.isArray(proposedDef.tasks)) {
          const diff = computeDiff(workflowDef, proposedDef);
          setProposal({
            proposedDef,
            diff,
            messageId: `inline-cmdk-${Date.now()}`,
          });
          setPrompt('');
          setInlineCopilotTaskRef(null);
          return;
        }
      }
      setStatusMsg({ tone: 'warning', text: '未能解析 AI 返回的工作流 JSON，请换个说法重试' });
    } catch (err: any) {
      setStatusMsg({ tone: 'failed', text: `调用 AI 失败：${err?.message || '未知错误'}。请检查 AI 配置后重试` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: 68,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 540,
        maxWidth: 'calc(100vw - 40px)',
        zIndex: 2200,
        background: 'color-mix(in srgb, var(--cm-surface-1) 96%, transparent)',
        backdropFilter: 'blur(20px)',
        border: '1px solid color-mix(in srgb, var(--cm-ai) 45%, transparent)',
        borderRadius: 14,
        boxShadow: 'var(--cm-shadow-float), 0 0 0 1px color-mix(in srgb, var(--cm-ai) 15%, transparent)',
        overflow: 'hidden',
      }}
    >
      {/* Context Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 14px',
          background: 'linear-gradient(90deg, color-mix(in srgb, var(--cm-ai) 18%, transparent), transparent)',
          borderBottom: '1px solid var(--cm-border-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: '2px 7px',
              borderRadius: 5,
              background: 'var(--cm-ai)',
              color: ON_AI,
            }}
          >
            ⌘K 画布内联指令
          </span>
          <span style={{ fontSize: 11, color: 'var(--cm-text-secondary)', fontFamily: 'var(--cm-font-mono)' }}>
            锚点:{' '}
            <strong style={{ color: 'var(--cm-data)' }}>
              {targetTask ? `${targetTask.name} (${targetTask.taskReferenceName})` : '画布全局'}
            </strong>
          </span>
          {upstreamTasks.length > 0 && (
            <span style={{ fontSize: 10, color: 'var(--cm-text-muted)' }}>
              · 可见上游 {upstreamTasks.length} 个节点
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setInlineCopilotTaskRef(null)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--cm-text-muted)',
            cursor: 'pointer',
            fontSize: 12,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
          aria-label="关闭内联指令（Esc）"
        >
          Esc <X {...ICON_14} />
        </button>
      </div>

      {/* Command Input */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', padding: '10px 14px', gap: 8 }}>
        <input
          ref={inputRef}
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={loading}
          placeholder="输入自然语言指令，如：在此节点后加一个风控 HTTP 校验并判断状态码..."
          style={{
            flex: 1,
            padding: '9px 12px',
            borderRadius: 8,
            border: '1px solid var(--cm-border-default)',
            background: 'var(--cm-surface-0)',
            color: 'var(--cm-text-primary)',
            fontSize: 13,
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={loading || !prompt.trim()}
          style={{
            padding: '0 16px',
            borderRadius: 8,
            border: 'none',
            background: 'var(--cm-ai)',
            color: ON_AI,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 12,
            fontWeight: 700,
            cursor: loading || !prompt.trim() ? 'not-allowed' : 'pointer',
            opacity: loading || !prompt.trim() ? 0.6 : 1,
          }}
        >
          {loading ? '生成中…' : <>运行 <CornerDownLeft {...ICON_14} /></>}
        </button>
      </form>

      {/* Quick Spatial Actions */}
      {targetTask && (
        <div
          style={{
            padding: '6px 14px 12px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
          }}
        >
          {QUICK_ACTIONS.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => handleQuickAction(item)}
              style={{
                fontSize: 11,
                padding: '4px 10px',
                borderRadius: 999,
                border: '1px solid var(--cm-border-default)',
                background: 'var(--cm-surface-2)',
                color: 'var(--cm-text-secondary)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <item.icon size={12} strokeWidth={1.75} aria-hidden="true" />
              {item.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              selectTaskAction(targetTask, true);
              setInlineCopilotTaskRef(null);
            }}
            style={{
              fontSize: 11,
              padding: '4px 10px',
              borderRadius: 999,
              border: '1px solid var(--cm-border-default)',
              background: 'var(--cm-surface-2)',
              color: 'var(--cm-text-secondary)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Settings size={12} strokeWidth={1.75} aria-hidden="true" />
            打开属性抽屉
          </button>
        </div>
      )}

      {statusMsg && (
        <div
          style={{
            padding: '6px 14px 10px',
            fontSize: 11,
            color: STATUS_META[statusMsg.tone].color,
            borderTop: '1px solid var(--cm-border-subtle)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
          role="status"
        >
          {React.createElement(STATUS_META[statusMsg.tone].icon, { size: 12, strokeWidth: 1.75, 'aria-hidden': true })}
          {statusMsg.text}
        </div>
      )}
    </div>
  );
};

export default InlineCanvasCopilot;
