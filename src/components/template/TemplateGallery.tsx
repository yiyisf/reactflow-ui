import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import useWorkflowStore from '../../store/workflowStore';
import { useShallow } from 'zustand/react/shallow';
import type { WorkflowDef } from '../../types/conductor';
import type { WorkflowTemplate, TemplateCategory } from '../../template/types';
import { TemplateStore, defaultTemplateStore } from '../../template/templateStore';
import { TemplateSetupWizard } from './TemplateSetupWizard';
import { executeLocalSandboxDryRun } from '../../utils/localSandboxEngine';
import { X } from 'lucide-react';
import { CmIcon } from '../icons/CmIcon';

export interface TemplateGalleryProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (configuredDef: WorkflowDef) => void;
  templateStore?: TemplateStore;
  /** 试跑结束（快捷试跑或向导内试跑）：参数为最终状态或 'error'，用于接入埋点，不含数据 */
  onSandboxRun?: (result: string) => void;
}

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
  const [quickTestNotice, setQuickTestNotice] = useState<string | null>(null);

  const templates = useMemo(() => {
    return templateStore.search(searchQuery, selectedCategory);
  }, [templateStore, searchQuery, selectedCategory]);

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  // 点击【试跑演示】直接在本地沙盒执行并展示结果
  const handleQuickPreviewRun = (template: WorkflowTemplate) => {
    try {
      const scenario = template.mockDataset.scenarios[0];
      const instance = executeLocalSandboxDryRun(template.definition, {
        workflowInput: scenario?.workflowInput || {},
        taskMocks: scenario?.taskOutputs || {},
      });

      onSandboxRun?.(String(instance.status));
      setQuickTestNotice(
        `《${template.title}》在本地沙盒试跑通过！共执行 ${instance.tasks.length} 个任务节点，状态: ${instance.status}。点击「使用模板」即可完成填空并上屏编辑。`
      );
    } catch (err: any) {
      onSandboxRun?.('error');
      setQuickTestNotice(`试跑出错: ${err.message}`);
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
        background: 'rgba(0, 0, 0, 0.72)',
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
          background: 'var(--bg-secondary, #1e293b)',
          border: '1px solid var(--border-secondary, rgba(255, 255, 255, 0.2))',
          borderRadius: 16,
          boxShadow: '0 28px 72px rgba(0, 0, 0, 0.65)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* 顶部标题栏 */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid var(--border-primary, rgba(255, 255, 255, 0.1))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-primary, #0f172a)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ display: 'inline-flex' }}><CmIcon name="folder" size={22} /></span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary, #f8fafc)' }}>
                场景化工作流模板中心
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted, #94a3b8)' }}>
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
              color: 'var(--text-muted, #94a3b8)',
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
            borderBottom: '1px solid var(--border-primary, rgba(255, 255, 255, 0.08))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            background: 'rgba(0, 0, 0, 0.15)',
          }}
        >
          {/* 分类 Tabs */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: '全部场景 (8)' },
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
                  background: selectedCategory === tab.id ? 'var(--color-accent, #3b82f6)' : 'transparent',
                  color: selectedCategory === tab.id ? 'var(--color-on-accent, #fff)' : 'var(--text-secondary, #b0bec5)',
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
              background: 'var(--bg-primary, #0f172a)',
              border: '1px solid var(--border-secondary, rgba(255, 255, 255, 0.2))',
              color: 'var(--text-primary, #f8fafc)',
              fontSize: 12,
              outline: 'none',
            }}
          />
        </div>

        {/* 快速试跑成功浮层 */}
        {quickTestNotice && (
          <div
            style={{
              margin: '12px 24px 0 24px',
              padding: '10px 14px',
              borderRadius: 8,
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              color: '#34d399',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div><CmIcon name="sparkles" size={14} style={{ verticalAlign: -2, marginRight: 4 }} />{quickTestNotice}</div>
            <button
              onClick={() => setQuickTestNotice(null)}
              style={{
                background: 'none',
                border: 'none',
                color: '#34d399',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              关闭
            </button>
          </div>
        )}

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
                background: 'var(--bg-primary, #0f172a)',
                border: '1px solid var(--border-primary, rgba(255, 255, 255, 0.12))',
                padding: '16px 18px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 12,
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-accent, #3b82f6)';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              {/* 卡片头部 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <CmIcon name={tpl.icon} size={24} />
                    <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary, #f8fafc)' }}>
                      {tpl.title}
                    </span>
                  </div>

                  <span
                    style={{
                      fontSize: 10,
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: 'rgba(255, 255, 255, 0.08)',
                      color: 'var(--text-muted, #94a3b8)',
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
                    color: 'var(--text-secondary, #b0bec5)',
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
                      background: 'rgba(16, 185, 129, 0.15)',
                      color: '#34d399',
                      fontWeight: 600,
                    }}
                  >
                    <CmIcon name="zap" size={14} style={{ verticalAlign: -2, marginRight: 4 }} />单次约省 {tpl.roi.minutesSavedPerRun} 分钟
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      padding: '2px 7px',
                      borderRadius: 4,
                      background: 'rgba(59, 130, 246, 0.15)',
                      color: '#60a5fa',
                    }}
                  >
                    <CmIcon name="flame" size={14} style={{ verticalAlign: -2, marginRight: 4 }} />已使用 {tpl.roi.popularityCount ?? 1000} 次
                  </span>
                </div>

                {/* 操作按钮组 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <button
                    onClick={() => handleQuickPreviewRun(tpl)}
                    style={{
                      flex: 1,
                      padding: '6px 10px',
                      borderRadius: 6,
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--border-secondary, rgba(255, 255, 255, 0.15))',
                      color: 'var(--text-secondary, #b0bec5)',
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
                      background: 'var(--color-accent, #3b82f6)',
                      color: 'var(--color-on-accent, #fff)',
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
