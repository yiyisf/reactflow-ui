import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import useWorkflowStore from '../../store/workflowStore';
import type { WorkflowInstance } from '../../types/conductor';
import type { WorkflowTemplate, TemplateCategory } from '../../template/types';
import { extractTemplateFromInstance } from '../../template/sanitizer/anonymize';
import { defaultTemplateStore } from '../../template/templateStore';

export interface TemplateExtractorProps {
  isOpen: boolean;
  instance: WorkflowInstance;
  onClose: () => void;
  onPublished?: (template: WorkflowTemplate) => void;
}

export const TemplateExtractor: React.FC<TemplateExtractorProps> = ({
  isOpen,
  instance,
  onClose,
  onPublished,
}) => {
  const { theme, themeColor } = useWorkflowStore();
  // 提取初始结果
  const initialResult = useMemo(() => {
    return extractTemplateFromInstance({
      instance,
      title: `${instance.workflowName || '云平台工作流'} (实战提炼)`,
      category: 'ops',
      valueProposition: `基于实例 ${instance.workflowId} 的成功运行萃取，已通过自动化脱敏与参数提取。`,
      author: '系统管理员',
    });
  }, [instance]);

  const [title, setTitle] = useState(initialResult.template.title);
  const [category, setCategory] = useState<TemplateCategory>(initialResult.template.category);
  const [valProp, setValProp] = useState(initialResult.template.valueProposition);
  const [savedMinutes, setSavedMinutes] = useState(initialResult.template.roi.minutesSavedPerRun);

  // 剪枝勾选状态 (taskRef -> boolean: true=剔除)
  const [prunedMap, setPrunedMap] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    for (const r of initialResult.prunedTasks) {
      map[r.taskReferenceName] = r.selected;
    }
    return map;
  });

  // 发布中状态
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishedSuccess, setPublishedSuccess] = useState(false);

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  const handleTogglePrune = (taskRef: string) => {
    setPrunedMap((prev) => ({
      ...prev,
      [taskRef]: !prev[taskRef],
    }));
  };

  const handlePublish = () => {
    setIsPublishing(true);

    try {
      // 组装最终模板
      const finalTemplate: WorkflowTemplate = {
        ...initialResult.template,
        title,
        category,
        valueProposition: valProp,
        roi: {
          ...initialResult.template.roi,
          minutesSavedPerRun: savedMinutes,
        },
      };

      // 注册至全局模板中心
      defaultTemplateStore.register(finalTemplate);

      if (onPublished) {
        onPublished(finalTemplate);
      }

      setPublishedSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      alert(`发布模板出错: ${err.message}`);
    } finally {
      setIsPublishing(false);
    }
  };

  const findings = initialResult.findings;

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
        backdropFilter: 'blur(6px)',
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
          width: 980,
          maxWidth: 'calc(100vw - 48px)',
          height: 720,
          maxHeight: 'calc(100vh - 48px)',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-secondary)',
          borderRadius: 14,
          boxShadow: '0 28px 72px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* 顶部标题栏 */}
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--border-primary, rgba(255, 255, 255, 0.1))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-primary, #0f172a)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>🛠️</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary, #f8fafc)' }}>
                生产工作流一键提炼与脱敏工作台 (管理员)
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted, #94a3b8)' }}>
                基于执行实例 #{instance.workflowId} 自动识别敏感信息并生成高保真模板
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted, #94a3b8)',
              cursor: 'pointer',
              fontSize: 16,
            }}
          >
            ✕
          </button>
        </div>

        {/* 主体三列工作区 */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '18px 20px',
            display: 'grid',
            gridTemplateColumns: '1fr 1.2fr 1fr',
            gap: 16,
          }}
        >
          {/* 列 1: 拓扑骨架与智能剪枝 */}
          <div
            style={{
              background: 'var(--bg-primary, #0f172a)',
              borderRadius: 10,
              border: '1px solid var(--border-primary, rgba(255,255,255,0.1))',
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary, #f8fafc)' }}>
              1. 骨架拓扑剪枝建议
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted, #94a3b8)' }}>
              自动识别并建议剔除特定的临时调试、重试与低频孤立分支：
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              {initialResult.template.definition.tasks?.map((t, idx) => {
                const isPruned = Boolean(prunedMap[t.taskReferenceName]);
                return (
                  <div
                    key={t.taskReferenceName}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 6,
                      background: isPruned ? 'rgba(239, 68, 68, 0.08)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${isPruned ? 'rgba(239, 68, 68, 0.25)' : 'rgba(255,255,255,0.08)'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: 12,
                      opacity: isPruned ? 0.6 : 1,
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: 'var(--color-accent, #3b82f6)', fontWeight: 600 }}>#{idx + 1}</span>
                        <span style={{ color: isPruned ? '#fca5a5' : 'var(--text-primary, #f8fafc)' }}>
                          {t.description || t.name}
                        </span>
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted, #94a3b8)', fontFamily: 'monospace' }}>
                        {t.taskReferenceName}
                      </div>
                    </div>

                    <button
                      onClick={() => handleTogglePrune(t.taskReferenceName)}
                      style={{
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: isPruned ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.08)',
                        border: 'none',
                        color: isPruned ? '#f87171' : 'var(--text-muted, #94a3b8)',
                        fontSize: 11,
                        cursor: 'pointer',
                      }}
                    >
                      {isPruned ? '已剪枝剔除' : '保留'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 列 2: 敏感扫描与变量化 */}
          <div
            style={{
              background: 'var(--bg-primary, #0f172a)',
              borderRadius: 10,
              border: '1px solid var(--border-primary, rgba(255,255,255,0.1))',
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary, #f8fafc)' }}>
                2. 敏感项扫描与变量提取
              </div>
              <span
                style={{
                  fontSize: 10,
                  padding: '1px 6px',
                  borderRadius: 4,
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#34d399',
                  fontWeight: 600,
                }}
              >
                已扫描 {findings.length} 项
              </span>
            </div>

            <div style={{ fontSize: 11, color: 'var(--text-muted, #94a3b8)' }}>
              命中规则的生产密钥已强制置空，真实 IP/ID 推荐转为填空变量：
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              {findings.length === 0 ? (
                <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted, #94a3b8)', fontSize: 12 }}>
                  ✓ 未发现任何硬编码的高危凭据或敏感信息
                </div>
              ) : (
                findings.map((f) => (
                  <div
                    key={f.id}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 6,
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid var(--border-primary, rgba(255,255,255,0.08))',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      fontSize: 11,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span
                        style={{
                          padding: '1px 5px',
                          borderRadius: 3,
                          fontSize: 10,
                          fontWeight: 600,
                          background:
                            f.kind === 'credential'
                              ? 'rgba(239, 68, 68, 0.2)'
                              : f.kind === 'network'
                              ? 'rgba(59, 130, 246, 0.2)'
                              : 'rgba(245, 158, 11, 0.2)',
                          color:
                            f.kind === 'credential'
                              ? '#f87171'
                              : f.kind === 'network'
                              ? '#60a5fa'
                              : '#fbbf24',
                        }}
                      >
                        {f.kind === 'credential'
                          ? '🔑 密钥凭据'
                          : f.kind === 'network'
                          ? '🌐 内网地址'
                          : f.kind === 'pii'
                          ? '📱 个人隐私'
                          : '🖥️ 云资源ID'}
                      </span>

                      <span style={{ color: 'var(--text-muted, #94a3b8)' }}>
                        建议处理: {f.action === 'variable' ? '提取为向导变量' : '自动掩码脱敏'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <span style={{ color: 'var(--text-secondary, #b0bec5)' }}>字段:</span>
                      <span style={{ color: 'var(--text-primary, #f8fafc)', fontFamily: 'monospace' }}>
                        {f.keyName}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ color: 'var(--text-secondary, #b0bec5)' }}>脱敏后:</span>
                      <span style={{ color: '#34d399', fontFamily: 'monospace' }}>
                        {f.maskedValue ? String(f.maskedValue) : '(强制置空并由用户填入)'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 列 3: 模板货架信息与发布 */}
          <div
            style={{
              background: 'var(--bg-primary, #0f172a)',
              borderRadius: 10,
              border: '1px solid var(--border-primary, rgba(255,255,255,0.1))',
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary, #f8fafc)' }}>
              3. 模板货架信息配置
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary, #b0bec5)' }}>模板中文标题</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  background: 'var(--bg-secondary, #1e293b)',
                  border: '1px solid var(--border-secondary, rgba(255,255,255,0.2))',
                  color: 'var(--text-primary, #f8fafc)',
                  fontSize: 12,
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary, #b0bec5)' }}>业务分类</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  background: 'var(--bg-secondary, #1e293b)',
                  border: '1px solid var(--border-secondary, rgba(255,255,255,0.2))',
                  color: 'var(--text-primary, #f8fafc)',
                  fontSize: 12,
                  outline: 'none',
                }}
              >
                <option value="compute">🖥️ 交付与计算</option>
                <option value="security">💾 安全与容灾</option>
                <option value="ops">⚡ 运维与自愈</option>
                <option value="cost">🌙 节能与降本</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary, #b0bec5)' }}>一句话业务价值</label>
              <textarea
                rows={2}
                value={valProp}
                onChange={(e) => setValProp(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  background: 'var(--bg-secondary, #1e293b)',
                  border: '1px solid var(--border-secondary, rgba(255,255,255,0.2))',
                  color: 'var(--text-primary, #f8fafc)',
                  fontSize: 12,
                  outline: 'none',
                  resize: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary, #b0bec5)' }}>单次预估节省 (分钟)</label>
              <input
                type="number"
                value={savedMinutes}
                onChange={(e) => setSavedMinutes(Number(e.target.value))}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  background: 'var(--bg-secondary, #1e293b)',
                  border: '1px solid var(--border-secondary, rgba(255,255,255,0.2))',
                  color: 'var(--text-primary, #f8fafc)',
                  fontSize: 12,
                  outline: 'none',
                }}
              />
            </div>

            <div
              style={{
                marginTop: 6,
                padding: '8px 10px',
                borderRadius: 6,
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.2)',
                fontSize: 11,
                color: '#34d399',
              }}
            >
              ✓ 已自动从该运行实例生成无害化保真沙盒数据集，上架后支持其他用户零授权一键试跑。
            </div>
          </div>
        </div>

        {/* 底部操作栏 */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border-primary, rgba(255, 255, 255, 0.1))',
            background: 'var(--bg-primary, #0f172a)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--text-muted, #94a3b8)' }}>
            审计报告: 扫描 {initialResult.report.totalTasksScanned} 个任务 · 脱敏凭证{' '}
            {initialResult.report.credentialsRedactedCount} 项 · 生成模板变量{' '}
            {initialResult.report.variablesCreatedCount} 项
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {publishedSuccess && (
              <span style={{ fontSize: 12, color: '#34d399', fontWeight: 600 }}>
                ✓ 已成功上架到模板中心！
              </span>
            )}

            <button
              onClick={onClose}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                background: 'transparent',
                border: '1px solid var(--border-secondary, rgba(255,255,255,0.2))',
                color: 'var(--text-secondary, #b0bec5)',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              取消
            </button>

            <button
              onClick={handlePublish}
              disabled={isPublishing || publishedSuccess}
              style={{
                padding: '6px 18px',
                borderRadius: 6,
                background: 'var(--color-accent, #3b82f6)',
                color: '#fff',
                border: 'none',
                fontSize: 12,
                fontWeight: 600,
                cursor: isPublishing || publishedSuccess ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>🚀</span>
              <span>{isPublishing ? '发布中...' : '注册并发布到模板中心'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
