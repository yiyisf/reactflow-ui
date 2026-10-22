import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ActionRegistry } from '../../actions/registry';
import type { ActionDefinition, ActionCategory } from '../../actions/types';
import type { WorkflowLevel } from '../../types/workflowLibrary';
import type { LibraryCatalog } from '../../library/catalog';
import { collectLibraryDomains, filterPickableActions, libraryDomainOf } from '../../library/projections';
import { useLibraryCatalogSnapshot } from '../../library/useLibraryCatalog';
import { useShallow } from 'zustand/react/shallow';
import useWorkflowStore from '../../store/workflowStore';

/** 单次最多渲染的动作数（流程库可能有上千项）；超出请用搜索缩小范围 */
const RENDER_LIMIT = 200;

export interface ActionPickerModalProps {
  registry: ActionRegistry;
  /** 展示用的步骤序号（从 1 开始） */
  stepNumber: number;
  onClose: () => void;
  onSelect: (action: ActionDefinition) => void;
  /**
   * 当前正在编辑的工作流层级。提供时隐藏违反分层调用规则的流程库动作
   * （L1 不显示 L2/L3，L2 不显示 L3）；未提供则不按层级过滤。
   */
  currentWorkflowLevel?: WorkflowLevel;
  /** 流程库目录：用于显示「加载中 / 加载失败，点击重试」状态 */
  libraryCatalog?: LibraryCatalog;
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
  currentWorkflowLevel,
  libraryCatalog,
}) => {
  const catalogState = useLibraryCatalogSnapshot(libraryCatalog);
  const { theme, themeColor } = useWorkflowStore(useShallow((s) => ({ theme: s.theme, themeColor: s.themeColor })));
  const [selectedCategory, setSelectedCategory] = useState<ActionCategory | 'all'>('all');
  /** 选中的业务域；非 null 时只显示该业务域下的流程库动作（与分类选中互斥） */
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [actionSearch, setActionSearch] = useState('');

  // 已下线动作与违反层级规则的流程库动作不出现在选择器中（已引用的步骤不受影响）
  const pickableActions = useMemo(
    () => filterPickableActions(registry.getAllActions(), { currentLevel: currentWorkflowLevel }),
    [registry, currentWorkflowLevel],
  );

  // 业务域分组：任一动作带 domain 时启用，按目录中首次出现的顺序排列，无业务域的流程库动作归入「其他」（固定最后）
  const domains = useMemo(() => collectLibraryDomains(pickableActions), [pickableActions]);
  const domainMode = domains.length > 0;

  const filteredActions = useMemo(() => {
    const keyword = actionSearch.trim().toLowerCase();
    return pickableActions.filter((a) => {
      const libDomain = domainMode ? libraryDomainOf(a) : null;
      let matchesCat: boolean;
      if (selectedDomain !== null) {
        matchesCat = libDomain === selectedDomain;
      } else if (selectedCategory === 'all') {
        matchesCat = true;
      } else {
        // 业务域模式下，流程库动作按业务域分组，不再出现在分类标签里
        matchesCat = libDomain === null && a.category === selectedCategory;
      }
      const matchesSearch =
        !keyword ||
        a.name.toLowerCase().includes(keyword) ||
        a.description.toLowerCase().includes(keyword);
      return matchesCat && matchesSearch;
    });
  }, [pickableActions, domainMode, selectedCategory, selectedDomain, actionSearch]);

  const visibleActions = useMemo(() => filteredActions.slice(0, RENDER_LIMIT), [filteredActions]);

  if (typeof document === 'undefined') return null;

  const categoryTabs = [
    { id: 'all', label: '全部' },
    { id: 'compute', label: '🖥️ 计算与主机' },
    { id: 'storage', label: '💾 存储快照' },
    { id: 'monitor', label: '📊 监控指标' },
    { id: 'notify', label: '📢 通知消息' },
    { id: 'human', label: '👤 人工审批' },
    { id: 'logic', label: '⏳ 流程控制' },
    { id: 'custom', label: domainMode ? '🧩 自定义' : '🧩 流程库 / 自定义' },
  ] as const;

  return createPortal(
    // 弹窗渲染在 document.body 下，需显式带上主题属性，否则主题变量全部失效（背景透明、配色错乱）
    <div
      data-mode={theme}
      data-brand={themeColor}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(2px)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: 'inherit',
        colorScheme: theme === 'light' ? 'light' : 'dark',
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`选择要插入的业务动作（第 ${stepNumber} 步）`}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 760,
          maxWidth: 'calc(100vw - 48px)',
          height: 'min(640px, 84vh)',
          background: 'var(--bg-primary)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 12,
          boxShadow: '0 20px 48px rgba(0, 0, 0, 0.35)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* 标题 + 搜索 */}
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--border-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 15, flex: 1, whiteSpace: 'nowrap' }}>
            选择业务动作
            <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: 'var(--text-muted)' }}>
              第 {stepNumber} 步
            </span>
          </div>
          <input
            type="text"
            autoFocus
            placeholder="搜索动作名称或描述…"
            value={actionSearch}
            onChange={(e) => setActionSearch(e.target.value)}
            style={{
              width: 240,
              padding: '6px 10px',
              borderRadius: 6,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-secondary)',
              color: 'var(--text-primary)',
              fontSize: 12,
              outline: 'none',
            }}
          />
          <button
            onClick={onClose}
            aria-label="关闭"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 16,
              padding: 4,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* 筛选：分类一行，业务域一行（有流程库业务域时） */}
        <div
          style={{
            padding: '10px 18px',
            borderBottom: '1px solid var(--border-primary)',
            background: 'var(--bg-secondary)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <FilterRow label="分类">
            {categoryTabs.map((tab) => (
              <FilterChip
                key={tab.id}
                active={selectedDomain === null && selectedCategory === tab.id}
                onClick={() => {
                  setSelectedCategory(tab.id);
                  setSelectedDomain(null);
                }}
              >
                {tab.label}
              </FilterChip>
            ))}
          </FilterRow>
          {domainMode && (
            <FilterRow label="业务域">
              {domains.map((d) => (
                <FilterChip key={`domain:${d}`} active={selectedDomain === d} onClick={() => setSelectedDomain(d)}>
                  {d}
                </FilterChip>
              ))}
            </FilterRow>
          )}
        </div>

        {/* 流程库加载状态：失败不阻塞使用其它动作 */}
        {catalogState.status === 'loading' && (
          <div style={{ padding: '6px 18px', fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-secondary)' }}>
            正在加载流程库…
          </div>
        )}
        {catalogState.status === 'error' && (
          <div
            style={{
              padding: '6px 18px',
              fontSize: 12,
              color: 'var(--color-error)',
              background: 'var(--bg-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span title={catalogState.error?.message}>流程库加载失败，其它动作仍可使用</span>
            <button
              onClick={() => {
                void libraryCatalog?.reload();
              }}
              style={{
                background: 'none',
                border: '1px solid currentColor',
                borderRadius: 4,
                color: 'inherit',
                cursor: 'pointer',
                fontSize: 11,
                padding: '1px 8px',
              }}
            >
              点击重试
            </button>
          </div>
        )}

        {/* 动作列表 */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 16,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 10,
            alignContent: 'start',
          }}
        >
          {visibleActions.map((action) => {
            const meta = [action.level, libraryDomainOf(action) ?? undefined].filter(Boolean).join(' · ');
            return (
              <button
                key={action.id}
                type="button"
                                onClick={() => onSelect(action)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-accent)';
                  e.currentTarget.style.background = 'var(--bg-tertiary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-primary)';
                  e.currentTarget.style.background = 'var(--bg-secondary)';
                }}
                style={{
                  textAlign: 'left',
                  font: 'inherit',
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-primary)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  transition: 'border-color 0.15s ease, background 0.15s ease',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                  <span style={{ fontSize: 18, lineHeight: 1 }}>{action.icon}</span>
                  <span style={{ fontWeight: 600, fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {action.name}
                  </span>
                  {action.riskLevel === 'sensitive' && (
                    <span
                      style={{
                        fontSize: 10,
                        padding: '1px 6px',
                        borderRadius: 4,
                        background: 'color-mix(in srgb, var(--color-warning) 16%, transparent)',
                        color: 'var(--color-warning)',
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      敏感
                    </span>
                  )}
                </span>
                {meta && <span style={{ fontSize: 10, color: 'var(--color-accent-text)' }}>{meta}</span>}
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45 }}>{action.description}</span>
              </button>
            );
          })}
          {visibleActions.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '32px 0', fontSize: 12, color: 'var(--text-muted)' }}>
              没有符合条件的动作{actionSearch ? '，换个关键词试试' : ''}
            </div>
          )}
          {filteredActions.length > visibleActions.length && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
              共 {filteredActions.length} 项，仅显示前 {visibleActions.length} 项，请用搜索缩小范围
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

/** 一行筛选：左侧标签 + 可换行的选项 */
const FilterRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
    <span style={{ flexShrink: 0, width: 40, paddingTop: 4, fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1 }}>{children}</div>
  </div>
);

/** 筛选选项：未选中为描边，选中为强调色浅底 */
const FilterChip: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({
  active,
  onClick,
  children,
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    style={{
      padding: '3px 10px',
      borderRadius: 999,
      fontSize: 12,
      lineHeight: '18px',
      cursor: 'pointer',
      fontWeight: active ? 600 : 400,
      background: active ? 'var(--color-accent-bg)' : 'transparent',
      color: active ? 'var(--color-accent-text)' : 'var(--text-secondary)',
      border: `1px solid ${active ? 'var(--color-accent)' : 'var(--border-secondary)'}`,
    }}
  >
    {children}
  </button>
);
