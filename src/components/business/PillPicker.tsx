import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { BusinessStep, PillToken } from '../../stepmodel/types';
import { ActionRegistry, defaultActionRegistry } from '../../actions/registry';
import { buildPillGroups } from '../../stepmodel/pills';
import { Tag, X } from 'lucide-react';
import { CmIcon } from '../icons/CmIcon';

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

  const rootRef = useRef<HTMLDivElement>(null);

  // 可选项：全局入参 + 上游步骤输出（含控制流内部步骤，见 stepmodel/pills）
  const groups = useMemo(
    () => buildPillGroups(upstreamSteps, registry, workflowInputParams),
    [upstreamSteps, registry, workflowInputParams]
  );

  // Esc 关闭（在面板内任意位置）
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [onClose]);

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
      ref={rootRef}
      role="dialog"
      aria-label="插入数据"
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        zIndex: 1100,
        width: 340,
        maxHeight: 380,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-secondary)',
        borderRadius: 8,
        boxShadow: 'var(--cm-shadow-float)',
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
          borderBottom: '1px solid var(--border-primary)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'var(--bg-tertiary)',
        }}
      >
        <span style={{ fontSize: 13 }}><Tag size={13} strokeWidth={1.75} aria-hidden="true" /></span>
        <input
          autoFocus
          type="text"
          aria-label="搜索可插入的数据"
          placeholder="搜索上游输出或全局入参…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-primary)',
            fontSize: 12,
          }}
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: 14,
            padding: '2px 4px',
          }}
          title="关闭"
        >
          <X size={14} strokeWidth={1.75} aria-hidden="true" />
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
              color: 'var(--text-muted)',
              fontSize: 12,
            }}
          >
            {groups.length === 0
              ? '前面还没有可引用的步骤输出，也没有声明工作流全局入参'
              : '没有匹配的字段，换个关键字试试'}
          </div>
        ) : (
          filteredGroups.map((group) => (
            <div key={group.key} role="group" aria-label={group.title} style={{ marginBottom: 8 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  padding: '4px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span style={{ display: 'inline-flex' }}><CmIcon name={group.icon} size={13} /></span>
                <span>{group.title}</span>
              </div>
              {group.note && (
                <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '0 8px 2px 27px' }}>{group.note}</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {group.items.map((item) => (
                  <button
                    type="button"
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
                      width: '100%',
                      border: 'none',
                      background: 'transparent',
                      color: 'inherit',
                      fontFamily: 'inherit',
                      textAlign: 'left',
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
                      e.currentTarget.style.background = 'var(--bg-highlight)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.background = 'var(--bg-highlight)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                      <span
                        style={{
                          fontWeight: 500,
                          color: 'var(--text-primary)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.label}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          color: 'var(--text-muted)',
                          fontFamily: 'monospace',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.rawRef}
                      </span>
                    </span>

                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {item.example !== undefined && (
                        <span
                          style={{
                            fontSize: 10,
                            padding: '1px 5px',
                            borderRadius: 4,
                            background: 'var(--cm-data-tint)',
                            color: 'var(--cm-data)',
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
                          background: 'var(--bg-tertiary)',
                          color: 'var(--text-muted)',
                        }}
                      >
                        {item.type}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <div
        style={{
          padding: '4px 8px',
          background: 'var(--bg-tertiary)',
          borderTop: '1px solid var(--border-primary)',
          fontSize: 10,
          color: 'var(--text-muted)',
          textAlign: 'right',
        }}
      >
        选择一项，以数据胶囊插入到光标处；Esc 关闭
      </div>
    </div>
  );
};
