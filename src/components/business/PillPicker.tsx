import React, { useState, useMemo } from 'react';
import type { BusinessStep, PillToken } from '../../stepmodel/types';
import { ActionRegistry, defaultActionRegistry } from '../../actions/registry';

export interface PillPickerProps {
  upstreamSteps: BusinessStep[];
  onSelect: (pill: PillToken) => void;
  onClose: () => void;
  registry?: ActionRegistry;
  workflowInputParams?: any[];
}

export const PillPicker: React.FC<PillPickerProps> = ({
  upstreamSteps,
  onSelect,
  onClose,
  registry = defaultActionRegistry,
  workflowInputParams,
}) => {
  const [search, setSearch] = useState('');

  // Build grouped options by upstream step
  const groups = useMemo(() => {
    const list: {
      stepTitle: string;
      stepIcon: string;
      stepRef: string;
      items: {
        rawRef: string;
        label: string;
        type: string;
        example?: any;
        stepLabel: string;
      }[];
    }[] = [];

    // 1. Workflow input parameters group
    if (workflowInputParams && workflowInputParams.length > 0) {
      list.push({
        stepTitle: '工作流全局入参',
        stepIcon: '🌐',
        stepRef: 'workflow.input',
        items: workflowInputParams.map((param) => {
          const name = typeof param === 'string' ? param : param.name;
          return {
            rawRef: `workflow.input.${name}`,
            label: typeof param === 'object' && param.description ? param.description : name,
            type: typeof param === 'object' && param.type ? param.type : 'string',
            example: typeof param === 'object' ? param.example ?? param.defaultValue : undefined,
            stepLabel: '全局入参',
          };
        }),
      });
    }

    // 2. Upstream steps
    for (let i = 0; i < upstreamSteps.length; i++) {
      const step = upstreamSteps[i];
      const action = registry.getAction(step.actionId);
      const stepTitle = `#${i + 1} ${step.name || action?.name || step.taskReferenceName}`;
      const stepIcon = action?.icon || '⚙️';
      const items: {
        rawRef: string;
        label: string;
        type: string;
        example?: any;
        stepLabel: string;
      }[] = [];

      if (action && action.outputs.length > 0) {
        for (const out of action.outputs) {
          items.push({
            rawRef: `${step.taskReferenceName}.output.${out.key}`,
            label: out.label,
            type: out.type,
            example: out.example,
            stepLabel: step.name || action.name,
          });
        }
      } else {
        // Fallback generic outputs for pro fallback or custom steps
        items.push({
          rawRef: `${step.taskReferenceName}.output`,
          label: '完整输出对象',
          type: 'object',
          example: '{ ... }',
          stepLabel: step.name,
        });
      }

      list.push({
        stepTitle,
        stepIcon,
        stepRef: step.taskReferenceName,
        items,
      });
    }

    return list;
  }, [upstreamSteps, registry, workflowInputParams]);

  // Filter by search query
  const filteredGroups = useMemo(() => {
    if (!search.trim()) return groups;
    const query = search.toLowerCase();
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (item) =>
            item.label.toLowerCase().includes(query) ||
            item.rawRef.toLowerCase().includes(query)
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, search]);

  return (
    <div
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        zIndex: 1100,
        width: 340,
        maxHeight: 380,
        background: 'var(--bg-secondary, #1e293b)',
        border: '1px solid var(--border-secondary, rgba(255,255,255,0.2))',
        borderRadius: 8,
        boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        marginTop: 4,
        fontFamily: 'inherit',
      }}
    >
      {/* Header & Search */}
      <div
        style={{
          padding: '8px 10px',
          borderBottom: '1px solid var(--border-primary, rgba(255,255,255,0.1))',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'var(--bg-primary, #0f172a)',
        }}
      >
        <span style={{ fontSize: 13 }}>🏷️</span>
        <input
          autoFocus
          type="text"
          placeholder="搜索上游输出字段..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-primary, #f8fafc)',
            fontSize: 12,
          }}
        />
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted, #94a3b8)',
            cursor: 'pointer',
            fontSize: 14,
            padding: '2px 4px',
          }}
          title="关闭"
        >
          ✕
        </button>
      </div>

      {/* List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '6px 4px',
        }}
      >
        {filteredGroups.length === 0 ? (
          <div
            style={{
              padding: '24px 12px',
              textAlign: 'center',
              color: 'var(--text-muted, #94a3b8)',
              fontSize: 12,
            }}
          >
            {upstreamSteps.length === 0
              ? '当前步骤是第 1 步，前面暂无可引用的上游步骤输出'
              : '未找到匹配的字段'}
          </div>
        ) : (
          filteredGroups.map((group) => (
            <div key={group.stepRef} style={{ marginBottom: 8 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--text-muted, #94a3b8)',
                  padding: '4px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span>{group.stepIcon}</span>
                <span>{group.stepTitle}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {group.items.map((item) => (
                  <div
                    key={item.rawRef}
                    onClick={() => {
                      onSelect({
                        rawRef: item.rawRef,
                        label: item.label,
                        stepLabel: item.stepLabel,
                      });
                      onClose();
                    }}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'background 0.15s ease',
                      fontSize: 12,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--bg-highlight, rgba(255,255,255,0.08))';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                      <span
                        style={{
                          fontWeight: 500,
                          color: 'var(--text-primary, #f8fafc)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.label}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          color: 'var(--text-muted, #94a3b8)',
                          fontFamily: 'monospace',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.rawRef}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {item.example !== undefined && (
                        <span
                          style={{
                            fontSize: 10,
                            padding: '1px 5px',
                            borderRadius: 4,
                            background: 'rgba(59, 130, 246, 0.15)',
                            color: '#60a5fa',
                            fontFamily: 'monospace',
                            maxWidth: 90,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={`样例值: ${String(item.example)}`}
                        >
                          {String(item.example)}
                        </span>
                      )}
                      <span
                        style={{
                          fontSize: 10,
                          padding: '1px 4px',
                          borderRadius: 3,
                          background: 'rgba(255,255,255,0.1)',
                          color: 'var(--text-muted, #94a3b8)',
                        }}
                      >
                        {item.type}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <div
        style={{
          padding: '4px 8px',
          background: 'var(--bg-primary, #0f172a)',
          borderTop: '1px solid var(--border-primary, rgba(255,255,255,0.08))',
          fontSize: 10,
          color: 'var(--text-muted, #94a3b8)',
          textAlign: 'right',
        }}
      >
        点击将变量以数据胶囊形式插入
      </div>
    </div>
  );
};
