import React, { useState, useMemo, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import useWorkflowStore from '../../store/workflowStore';
import { useShallow } from 'zustand/react/shallow';
import type { WorkflowDef } from '../../types/conductor';
import type { WorkflowTemplate, TemplateCategory } from '../../template/types';
import { TemplateStore, defaultTemplateStore } from '../../template/templateStore';
import { TemplateSetupWizard } from './TemplateSetupWizard';
import { executeLocalSandboxDryRunAsync } from '../../utils/localSandboxEngine';
import { X } from 'lucide-react';
import { CmIcon } from '../icons/CmIcon';
import { getStatusMeta } from '../../utils/statusMeta';
import { describeQuickRun, describeQuickRunError, type QuickRunNotice } from './quickRunNotice';

export interface TemplateGalleryProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (configuredDef: WorkflowDef) => void;
  templateStore?: TemplateStore;
  /** 试跑结束（快捷试跑或向导内试跑）：参数为最终状态或 'error'，用于接入埋点，不含数据 */
  onSandboxRun?: (result: string) => void;
}

const noSubscribe = () => () => {};
const zeroVersion = () => 0;

export const TemplateGallery: React.FC<TemplateGalleryProps> = ({
  isOpen,
  onClose,
  onSelectTemplate,
  templateStore = defaultTemplateStore,
  onSandboxRun,
}) => {
  const { theme, themeColor } = useWorkflowStore(useShallow((s) => ({ theme: s.theme, themeColor: s.themeColor })));
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeWizardTemplate, setActiveWizardTemplate] = useState<WorkflowTemplate | null>(null);

  // 快捷试跑提示弹窗
  const [quickTestNotice, setQuickTestNotice] = useState<QuickRunNotice | null>(null);

  // R17: re-run the search when templates are registered (e.g. one just published from a run)
  // Hosts may pass an older store object without subscribe/getVersion: fall back to a static snapshot.
  const subscribe = templateStore.subscribe ?? noSubscribe;
  const getVersion = templateStore.getVersion ?? zeroVersion;
  const storeVersion = useSyncExternalStore(subscribe, getVersion, getVersion);
  const templates = useMemo(() => {
    void storeVersion; // change signal for the mutable store
    return templateStore.search(searchQuery, selectedCategory);
  }, [templateStore, searchQuery, selectedCategory, storeVersion]);
  // U2：「全部场景」显示实际模板数（含宿主注册与新发布的模板），不再写死
  const totalCount = useMemo(() => {
    void storeVersion;
    return templateStore.search('', 'all').length;
  }, [templateStore, storeVersion]);

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  // 点击【试跑演示】直接在本地沙盒执行并展示结果
  const handleQuickPreviewRun = async (template: WorkflowTemplate) => {
    try {
      const scenario = template.mockDataset.scenarios[0];
      const instance = await executeLocalSandboxDryRunAsync(template.definition, {
        workflowInput: scenario?.workflowInput || {},
        taskMocks: scenario?.taskOutputs || {},
      });

      onSandboxRun?.(String(instance.status));
      setQuickTestNotice(describeQuickRun(template.title, instance));
    } catch (err: unknown) {
      onSandboxRun?.('error');
      setQuickTestNotice(describeQuickRunError(template.title, err));
    }
  };

  return createPortal(
    <div
      data-mode={theme}
      data-brand={themeColor}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'var(--cm-overlay)',
        backdropFilter: 'blur(5px)',
        zIndex: 1250,
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
          width: 980,
          maxWidth: '92vw',
          height: '84vh',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-secondary)',
          borderRadius: 16,
          boxShadow: 'var(--cm-shadow-float)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* 顶部标题栏 */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid var(--border-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-primary)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ display: 'inline-flex' }}><CmIcon name="folder" size={22} /></span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>
                场景化工作流模板中心
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                源于真实云平台高价值运维实战萃取 · 拒绝空白画布 · 开箱即用
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="关闭"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 18,
              padding: '4px',
            }}
          >
            <X size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        {/* 筛选栏 & 搜索框 */}
        <div
          style={{
            padding: '10px 24px',
            borderBottom: '1px solid var(--border-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            background: 'var(--cm-surface-0)',
          }}
        >
          {/* 分类 Tabs */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: `全部场景 (${totalCount})` },
              { id: 'compute', label: '交付与计算' },
              { id: 'security', label: '安全与容灾' },
              { id: 'ops', label: '运维与自愈' },
              { id: 'cost', label: '节能与降本' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedCategory(tab.id as any)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 6,
                  background: selectedCategory === tab.id ? 'var(--color-accent)' : 'transparent',
                  color: selectedCategory === tab.id ? 'var(--color-on-accent)' : 'var(--text-secondary)',
                  border: 'none',
                  fontSize: 12,
                  cursor: 'pointer',
                  fontWeight: selectedCategory === tab.id ? 600 : 400,
                  transition: 'all 0.15s ease',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* 搜索框 */}
          <input
            type="text"
            placeholder="搜索模板名称、痛点或场景..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: 220,
              padding: '6px 12px',
              borderRadius: 6,
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-secondary)',
              color: 'var(--text-primary)',
              fontSize: 12,
              outline: 'none',
            }}
          />
        </div>

        {/* 快速试跑成功浮层 */}
        {quickTestNotice && (() => {
          // U1：图标 + 中文状态 + 对应颜色（规则 5），不再一律成功色
          const meta = getStatusMeta(quickTestNotice.status);
          const Icon = meta.icon;
          return (
            <div
              role="status"
              data-testid="template-quick-run-notice"
              style={{
                margin: '12px 24px 0 24px',
                padding: '10px 14px',
                borderRadius: 8,
                background: `color-mix(in srgb, ${meta.color} 12%, transparent)`,
                border: `1px solid color-mix(in srgb, ${meta.color} 35%, transparent)`,
                color: meta.color,
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                <Icon size={14} strokeWidth={1.75} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{quickTestNotice.text}</span>
              </div>
              <button
                onClick={() => setQuickTestNotice(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: meta.color,
                  cursor: 'pointer',
                  fontSize: 12,
                  flexShrink: 0,
                }}
              >
                关闭
              </button>
            </div>
          );
        })()}

        {/* 模板卡片网格列表 */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px 24px',
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 16,
          }}
        >
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              style={{
                borderRadius: 12,
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-primary)',
                padding: '16px 18px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 12,
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-accent)';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = 'var(--cm-shadow-float)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-primary)';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              {/* 卡片头部 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <CmIcon name={tpl.icon} size={24} />
                    <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>
                      {tpl.title}
                    </span>
                  </div>

                  <span
                    style={{
                      fontSize: 10,
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: 'var(--bg-highlight)',
                      color: 'var(--text-muted)',
                      fontWeight: 500,
                    }}
                  >
                    {tpl.difficulty === 'starter' ? '入门' : tpl.difficulty === 'intermediate' ? '进阶' : '专业'}
                  </span>
                </div>

                {/* 核心业务价值 */}
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    lineHeight: 1.5,
                  }}
                >
                  {tpl.valueProposition}
                </div>
              </div>

              {/* 卡片底部指标与操作 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* 收益标签 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontSize: 11,
                      padding: '2px 7px',
                      borderRadius: 4,
                      background: 'color-mix(in srgb, var(--cm-status-success) 15%, transparent)',
                      color: 'var(--cm-status-success)',
                      fontWeight: 600,
                    }}
                  >
                    <CmIcon name="zap" size={14} style={{ verticalAlign: -2, marginRight: 4 }} />单次约省 {tpl.roi.minutesSavedPerRun} 分钟
                  </span>
                  {/* 只显示模板数据真实提供的使用次数，不编造 */}
                  {tpl.roi.popularityCount !== undefined && (
                    <span
                      style={{
                        fontSize: 11,
                        padding: '2px 7px',
                        borderRadius: 4,
                        background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)',
                        color: 'var(--color-accent)',
                      }}
                    >
                      <CmIcon name="flame" size={14} style={{ verticalAlign: -2, marginRight: 4 }} />已使用 {tpl.roi.popularityCount} 次
                    </span>
                  )}
                </div>

                {/* 操作按钮组 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <button
                    onClick={() => { void handleQuickPreviewRun(tpl); }}
                    style={{
                      flex: 1,
                      padding: '6px 10px',
                      borderRadius: 6,
                      background: 'var(--bg-highlight)',
                      border: '1px solid var(--border-secondary)',
                      color: 'var(--text-secondary)',
                      fontSize: 12,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                    }}
                  >
                    <span><CmIcon name="play" size={16} /></span>
                    <span>试跑演示</span>
                  </button>

                  <button
                    onClick={() => setActiveWizardTemplate(tpl)}
                    style={{
                      flex: 1.2,
                      padding: '6px 12px',
                      borderRadius: 6,
                      background: 'var(--color-accent)',
                      color: 'var(--color-on-accent)',
                      border: 'none',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                    }}
                  >
                    <span><CmIcon name="zap" size={16} /></span>
                    <span>使用此模板</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3 步填空向导弹窗 */}
      {activeWizardTemplate && (
        <TemplateSetupWizard
          template={activeWizardTemplate}
          onSandboxRun={onSandboxRun}
          onClose={() => setActiveWizardTemplate(null)}
          onApply={(configuredDef) => {
            setActiveWizardTemplate(null);
            onSelectTemplate(configuredDef);
            onClose();
          }}
        />
      )}
    </div>,
    document.body
  );
};
