import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ActionRegistry } from '../../actions/registry';
import type { ActionDefinition, ActionCategory } from '../../actions/types';

export interface ActionPickerModalProps {
  registry: ActionRegistry;
  /** 展示用的步骤序号（从 1 开始） */
  stepNumber: number;
  onClose: () => void;
  onSelect: (action: ActionDefinition) => void;
}

/**
 * 业务动作选择弹窗：分类筛选 + 关键字搜索。
 * 筛选状态与过滤计算都放在弹窗内部：仅在弹窗打开时才会随输入重新计算，
 * 不再拖累编辑器每次渲染（动作库可能有成百上千项）。
 */
export const ActionPickerModal: React.FC<ActionPickerModalProps> = ({
  registry,
  stepNumber,
  onClose,
  onSelect,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<ActionCategory | 'all'>('all');
  const [actionSearch, setActionSearch] = useState('');

  const filteredActions = useMemo(() => {
    const keyword = actionSearch.trim().toLowerCase();
    return registry.getAllActions().filter((a) => {
      const matchesCat = selectedCategory === 'all' || a.category === selectedCategory;
      const matchesSearch =
        !keyword ||
        a.name.toLowerCase().includes(keyword) ||
        a.description.toLowerCase().includes(keyword);
      return matchesCat && matchesSearch;
    });
  }, [registry, selectedCategory, actionSearch]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.68)',
        backdropFilter: 'blur(5px)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: 'inherit',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 680,
          maxWidth: 'calc(100vw - 48px)',
          maxHeight: '82vh',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-secondary)',
          borderRadius: 14,
          boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--border-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-primary)',
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>
            选择要插入的业务动作 (第 {stepNumber} 步)
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 16,
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        {/* Filter Tabs & Search */}
        <div
          style={{
            padding: '10px 18px',
            borderBottom: '1px solid var(--border-primary)',
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            background: 'var(--bg-tertiary)',
          }}
        >
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
            {(
              [
                { id: 'all', label: '全部动作' },
                { id: 'compute', label: '🖥️ 计算与主机' },
                { id: 'storage', label: '💾 存储快照' },
                { id: 'monitor', label: '📊 监控指标' },
                { id: 'notify', label: '📢 通知消息' },
                { id: 'human', label: '👤 人工审批' },
                { id: 'logic', label: '⏳ 流程控制' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedCategory(tab.id)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  background: selectedCategory === tab.id ? 'var(--color-accent, #3b82f6)' : 'transparent',
                  color: selectedCategory === tab.id ? '#fff' : 'var(--text-secondary)',
                  border: 'none',
                  fontSize: 12,
                  cursor: 'pointer',
                  fontWeight: selectedCategory === tab.id ? 600 : 400,
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <input
            type="text"
            placeholder="搜索动作..."
            value={actionSearch}
            onChange={(e) => setActionSearch(e.target.value)}
            style={{
              width: 150,
              padding: '5px 10px',
              borderRadius: 6,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-secondary)',
              color: 'var(--text-primary)',
              fontSize: 12,
              outline: 'none',
            }}
          />
        </div>

        {/* Actions Grid */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '14px 18px',
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 12,
          }}
        >
          {filteredActions.map((action) => (
            <div
              key={action.id}
              onClick={() => onSelect(action)}
              style={{
                padding: '12px 14px',
                borderRadius: 8,
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-primary)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-accent, #3b82f6)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-primary)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 20 }}>{action.icon}</span>
                  <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
                    {action.name}
                  </span>
                </div>
                {action.riskLevel === 'sensitive' && (
                  <span
                    style={{
                      fontSize: 10,
                      padding: '1px 5px',
                      borderRadius: 4,
                      background: 'color-mix(in srgb, var(--status-failed, #ef4444) 15%, transparent)',
                      color: 'var(--status-failed, #ef4444)',
                      fontWeight: 600,
                    }}
                  >
                    ⚠️ 敏感
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  lineHeight: 1.4,
                }}
              >
                {action.description}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
};
