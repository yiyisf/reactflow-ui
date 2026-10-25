import React, { useState, useEffect, useRef } from 'react';
import useWorkflowStore from '../../store/workflowStore';
import { useShallow } from 'zustand/react/shallow';
import useAiStoreSingleton from '../../store/aiStore';
import useLibraryStoreSingleton from '../../store/libraryStore';
import { useIdeStoresOptional } from '../../store/ideStoresContext';
import { AgentRunner } from '../../services/ai/agentRunner';
import { toolRegistry as toolRegistrySingleton } from '../../services/ai/toolRegistry';
import { AI_NOT_CONFIGURED_MESSAGE, isAiConfigured, type AIServiceConfig } from '../../services/aiService';
import { getUpstreamAncestors } from '../../services/wlsp/workflowLsp';
import { TASK_TYPES } from '../../config/taskTypes';
import { CircleCheck, CircleX, CornerDownLeft, GitBranch, Globe, Loader, Settings, ShieldCheck, TriangleAlert, Braces, X, type LucideIcon } from 'lucide-react';

interface InlineCanvasCopilotProps {
  /** Overrides the AI config read from the active aiStore (optional; normally not needed). */
  aiConfig?: Partial<AIServiceConfig>;
}

/**
 * Builds the instruction sent through the normal AI pipeline: the anchor task and its
 * upstream scope travel with the user's words, so the model edits the right place.
 */
function buildInlineInstruction(prompt: string, anchor: { ref: string; name?: string; type?: string } | null, upstreamRefs: string[]): string {
  if (!anchor) return `【⌘K 画布指令】${prompt}`;
  const scope = upstreamRefs.length > 0 ? `；可引用的上游任务：${upstreamRefs.join(', ')}` : '';
  return `【⌘K 画布指令 · 锚点任务 ${anchor.ref}${anchor.type ? `（${anchor.type}）` : ''}${scope}】${prompt}\n请在锚点任务附近修改，并生成变更方案供我确认。`;
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
  const activeAiStore = ideStores?.aiStore ?? useAiStoreSingleton;
  const storeConfig = activeAiStore((s) => s.config);
  const isStreaming = activeAiStore((s) => s.isStreaming);
  const mode = useWorkflowStore((s) => s.mode);
  const runnerRef = useRef<AgentRunner | null>(null);
  useEffect(() => () => { runnerRef.current?.abort(); }, []);
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

  // Quick actions are ordinary (undoable) canvas edits through the store's own actions — not AI.
  const handleQuickAction = (item: (typeof QUICK_ACTIONS)[number]) => {
    if (!targetRef || targetRef === '__canvas_root__') return;
    if (mode === 'run') {
      setStatusMsg({ tone: 'warning', text: '运行视图下不能修改流程。请切换到编辑模式后再试。' });
      return;
    }
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

    // Same AI config as the chat panel — never a demo-only localStorage key, never a
    // "prompt as node name" fallback when nothing is configured.
    const config = { ...storeConfig, ...(aiConfig ?? {}) };
    if (!isAiConfigured(config)) {
      setStatusMsg({ tone: 'warning', text: ideStores ? '未配置 AI 服务。请点击 AI 对话面板右上角的设置按钮填写 API Key 后重试。' : AI_NOT_CONFIGURED_MESSAGE });
      return;
    }
    if (isStreaming) {
      setStatusMsg({ tone: 'warning', text: 'AI 正在处理上一条指令，请等它完成后再发送。' });
      return;
    }

    const anchorRef = targetRef && targetRef !== '__canvas_root__' ? targetRef : null;
    const instruction = buildInlineInstruction(
      q,
      anchorRef ? { ref: anchorRef, name: targetTask?.name, type: targetTask?.type } : null,
      upstreamTasks.map((u) => u.taskReferenceName),
    );

    if (ideStores) {
      // Inside <AiWorkflowIDE>: hand the instruction to the chat's AgentRunner, which applies the
      // host's aiPermissions, system prompt and proposal pipeline (normalize / verify / pin,
      // builds on a pending proposal instead of replacing it).
      ideStores.aiStore.getState().setPendingAutoSend(instruction);
      setPrompt('');
      setStatusMsg({ tone: 'success', text: '已发送给 AI 助手。方案生成后会在画布上等待你确认，可在对话面板查看进度。' });
      setTimeout(() => setInlineCopilotTaskRef(null), 1200);
      return;
    }

    // Standalone canvas (WorkflowIDE): run the same AgentRunner against the shared stores.
    if (aiConfig) activeAiStore.getState().setConfig({ ...aiConfig });
    const runner = runnerRef.current ?? new AgentRunner(
      () => ({ aiPermissions: { canEdit: useWorkflowStore.getState().mode !== 'run' } }),
      { aiStore: useAiStoreSingleton, libraryStore: useLibraryStoreSingleton, toolRegistry: toolRegistrySingleton },
    );
    runnerRef.current = runner;
    setLoading(true);
    setStatusMsg({ tone: 'working', text: '正在基于当前节点上下文生成变更方案…' });
    try {
      const before = useAiStoreSingleton.getState().pendingProposal?.id;
      await runner.send(instruction);
      const st = useAiStoreSingleton.getState();
      if (st.pendingProposal && st.pendingProposal.id !== before) {
        setPrompt('');
        setStatusMsg({ tone: 'success', text: '已生成变更方案，请在画布上方确认应用或放弃。' });
        setTimeout(() => setInlineCopilotTaskRef(null), 1200);
      } else {
        const last = [...st.messages].reverse().find((m) => m.role === 'assistant');
        const text = (last?.content ?? '').replace(/\*\*/g, '').trim();
        const failed = text.includes('出错了');
        setStatusMsg({ tone: failed ? 'failed' : 'warning', text: text ? text.slice(0, 160) : 'AI 没有生成变更方案。请换个说法重试。' });
      }
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
