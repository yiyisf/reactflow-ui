import { useState, useCallback, useRef, useEffect } from 'react';
import { WorkflowIDE } from '../WorkflowIDE';
import { AiWorkflowIDE } from '../AiWorkflowIDE';

import type { ViewMode } from '../types/workflow';
import type { WorkflowDef } from '../types/conductor';
import { useTheme } from '../hooks/useTheme';
import { ThemeControls } from '../components/ThemeControls';
import { BrandLogo } from '../components/BrandLogo';
import '../styles/tokens.css';
import './DemoApp.css';
import '../styles/executionStyles.css';

function DemoApp() {
  const { mode: themeMode, color: themeColor } = useTheme();

  // Local state for the demo wrapper
  const [workflowJson, setWorkflowJson] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [useNewAiMode, setUseNewAiMode] = useState(false);
  const [uiMode, setUiMode] = useState<'pro' | 'business'>('business');
  const [allowOperations, setAllowOperations] = useState(true);

  // 视图模式（运行态由 WorkflowIDE 内部强制 developer，此处仅控制定义态）
  const [viewMode, setViewMode] = useState<ViewMode>('developer');

  // AI config from localStorage (editable in demo header)
  const [aiConfig, setAiConfig] = useState(() => ({
    apiKey: localStorage.getItem('AI_API_KEY') || '',
    baseUrl: localStorage.getItem('AI_BASE_URL') || '',
    model: localStorage.getItem('AI_MODEL') || '',
  }));
  const [showAiConfig, setShowAiConfig] = useState(false);
  const [aiDraft, setAiDraft] = useState(aiConfig);
  const aiConfigRef = useRef<HTMLDivElement>(null);

  // Handle Escape key to close modal
  useEffect(() => {
    if (!showAiConfig) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowAiConfig(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showAiConfig]);

  const saveAiConfig = () => {
    setAiConfig(aiDraft);
    localStorage.setItem('AI_API_KEY', aiDraft.apiKey);
    localStorage.setItem('AI_BASE_URL', aiDraft.baseUrl);
    localStorage.setItem('AI_MODEL', aiDraft.model);
    setShowAiConfig(false);
  };

  // Ref for imperative access to WorkflowIDE
  const ideRef = useRef<any>(null);

  // Track current workflow def from onWorkflowChange (replaces direct store access)
  const [currentDef, setCurrentDef] = useState<WorkflowDef | null>(null);

  const handleWorkflowChange = useCallback((def: WorkflowDef) => {
    setCurrentDef(def);
  }, []);

  const handleSave = useCallback((def: WorkflowDef) => {
    console.log('[DemoApp] onSave:', def.name, `(${def.tasks?.length ?? 0} tasks)`);
  }, []);

  const handleExport = useCallback(() => {
    const def = ideRef.current?.getWorkflowDef();
    if (!def) return;
    const blob = new Blob([JSON.stringify(def, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${def.name || 'workflow'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // 处理文件上传
  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);

    const reader = new FileReader();
    reader.onload = (e: ProgressEvent<FileReader>) => {
      try {
        const result = e.target?.result as string;
        if (!result) return;
        const json = JSON.parse(result);
        setWorkflowJson(json);
        // Clear history handled inside IDE or here? ideally handled by IDE on new props
      } catch (err: any) {
        setError(`解析 JSON 失败: ${err.message}`);
      }
    };
    reader.onerror = () => setError('读取文件失败');
    reader.readAsText(file);
  }, []);

  // 加载示例工作流
  const loadSampleWorkflow = useCallback(async (sampleName: string) => {
    if (!sampleName) return;
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}sample-workflows/${sampleName}.json`);
      if (!response.ok) throw new Error(`加载示例失败: ${response.statusText}`);
      const json = await response.json();
      setWorkflowJson(json);
      setWorkflowExecution(null);
      setError(null);
    } catch (err: any) {
      setError(`加载示例工作流失败: ${err.message}`);
    }
  }, []);

  // 运行态执行示例
  const [workflowExecution, setWorkflowExecution] = useState<any>(null);

  // 初始默认加载云主机全生命周期自动化示例
  useEffect(() => {
    loadSampleWorkflow('ecs-lifecycle-automation');
  }, [loadSampleWorkflow]);

  const loadExecutionExample = useCallback(async (exampleName: string) => {
    if (!exampleName) {
      setWorkflowExecution(null);
      return;
    }
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}sample-executions/${exampleName}.json`);
      if (!response.ok) throw new Error(`加载示例失败: ${response.statusText}`);
      const json = await response.json();
      setWorkflowExecution(json);
      setWorkflowJson(null);
      setError(null);
    } catch (err: any) {
      setError(`加载执行示例失败: ${err.message}`);
    }
  }, []);

  return (
    <div
      className={`app ${themeMode === 'light' ? 'light-theme' : ''}`}
      data-mode={themeMode}
      data-brand={themeColor}
      style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}
    >
      <header className="app-header">
        <div className="header-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
            <h1 className="app-title" style={{ display: 'inline-flex', alignItems: 'center', gap: '9px' }}>
              <BrandLogo size={26} />
              Conductor IDE <span style={{ fontSize: '11px', opacity: 0.6, fontWeight: 500 }}>v1.1</span>
            </h1>

            {/* 搜索框 */}
            {(currentDef || workflowJson) && (
              <div className="search-container">
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  placeholder="搜索任务..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="search-input"
                />
                {searchQuery && (
                  <button className="search-clear" onClick={() => setSearchQuery('')}>✕</button>
                )}
              </div>
            )}
          </div>

          <div className="header-actions">


            {workflowExecution && !useNewAiMode && (
              <>
                <button
                  className={`mode-btn ${!allowOperations ? 'active' : ''}`}
                  onClick={() => setAllowOperations(prev => !prev)}
                  title={allowOperations ? "切换至操作受限状态" : "切换至允许操作状态"}
                  style={{
                    background: !allowOperations ? 'rgba(239, 68, 68, 0.15)' : undefined,
                    borderColor: !allowOperations ? 'rgba(239, 68, 68, 0.4)' : undefined,
                    color: !allowOperations ? 'var(--status-failed)' : undefined,
                  }}
                >
                  {allowOperations ? '🔓 操作授权' : '🔒 受限'}
                </button>
                <div className="divider"></div>
              </>
            )}

            <button
              className={`mode-btn ${isReadOnly ? 'active' : ''}`}
              onClick={() => setIsReadOnly(!isReadOnly)}
              title={isReadOnly ? "切换到编辑模式" : "切换到只读模式"}
            >
              {isReadOnly ? '👁️ 只读' : '✏️ 编辑'}
            </button>

            <button
              className={`mode-btn ${useNewAiMode ? 'active' : ''}`}
              onClick={() => setUseNewAiMode(!useNewAiMode)}
              title={useNewAiMode ? "切换回经典设计器" : "体验全新 AI 工作流设计器"}
              style={{
                background: useNewAiMode ? 'var(--color-accent)' : undefined,
                color: useNewAiMode ? '#fff' : undefined,
              }}
            >
              {useNewAiMode ? '✨ AI 模式' : '💻 经典模式'}
            </button>

            <button
              className={`mode-btn ${uiMode === 'business' ? 'active' : ''}`}
              onClick={() => setUiMode(uiMode === 'business' ? 'pro' : 'business')}
              title={uiMode === 'business' ? "切换为专业开发者模式 (查看完整 DAG/JSON)" : "切换为普通使用者模式 (卡片流/数据胶囊/云平台动作)"}
              style={{
                background: uiMode === 'business' ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(59, 130, 246, 0.25))' : undefined,
                borderColor: uiMode === 'business' ? '#10b981' : undefined,
                color: uiMode === 'business' ? '#10b981' : undefined,
                fontWeight: 600,
              }}
            >
              {uiMode === 'business' ? '👔 业务模式' : '💻 开发者模式'}
            </button>

            <a
              href={import.meta.env.BASE_URL}
              className="mode-btn"
              title="查看 Conductor Workflow IDE v1.1.0 业务全融合发布宣传页"
              style={{
                textDecoration: 'none',
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(6, 182, 212, 0.2))',
                borderColor: 'rgba(16, 185, 129, 0.5)',
                color: 'var(--text-primary)',
                fontWeight: 600,
              }}
            >
              ⚡ v1.1 宣传页
            </a>

            <div className="divider"></div>

            {/* 合并工作流示例下拉选择器 */}
            <select
              className="sample-select"
              onChange={(e) => {
                const val = e.target.value;
                if (!val) return;
                const [kind, name] = val.split(':');
                if (kind === 'def') loadSampleWorkflow(name);
                else if (kind === 'exec') loadExecutionExample(name);
                e.target.value = '';
              }}
              defaultValue=""
              title="载入官方示例工作流（包含编辑态与运行态案例）"
            >
              <option value="" disabled>📁 示例工作流...</option>
              <optgroup label="── ☁️ 云平台业务流程 ──">
                <option value="def:ecs-lifecycle-automation">☁️ 云主机全生命周期自动化 (业务模式)</option>
              </optgroup>
              <optgroup label="── 编辑态流程 ──">
                <option value="def:simple-workflow">简单流程 (Simple)</option>
                <option value="def:decision-workflow">分支流程 (Decision)</option>
                <option value="def:fork-join-workflow">并行流程 (Fork/Join)</option>
                <option value="def:complex-workflow">复杂综合流程</option>
              </optgroup>
              <optgroup label="── 运行态实例 ──">
                <option value="exec:human-approval">▶ HUMAN 审批 (RUNNING)</option>
                <option value="exec:mixed-status">✗ CI/CD 流水线 (FAILED)</option>
                <option value="exec:loop-iterations">✓ DO_WHILE 循环 (3次)</option>
                <option value="exec:retry-tasks">✓ 任务重试机制</option>
                <option value="exec:fork-dynamic">✓ 动态并行 FORK</option>
                <option value="exec:switch-branches">✓ SWITCH 分支执行</option>
              </optgroup>
            </select>

            {/* 文件管理快捷按钮 */}
            <button
              className="mode-btn"
              onClick={() => {
                setWorkflowJson(null);
                setCurrentDef(null);
                setWorkflowExecution(null);
                ideRef.current?.createBlankWorkflow();
              }}
              title="新建空白工作流"
            >
              📄 新建
            </button>

            <label className="upload-btn">
              <input type="file" accept=".json" onChange={handleFileUpload} style={{ display: 'none' }} />
              📤 导入
            </label>

            {(currentDef || workflowJson) && (
              <button
                className="mode-btn"
                onClick={handleExport}
                title="导出当前工作流 JSON"
              >
                📥 导出
              </button>
            )}

            <div className="divider"></div>

            <ThemeControls />

            <button
              className="mode-btn"
              onClick={() => { setAiDraft(aiConfig); setShowAiConfig(true); }}
              title="配置 AI 服务（API Key / Base URL / 模型）"
              style={{
                background: aiConfig.apiKey ? 'var(--color-success)' : undefined,
                color: aiConfig.apiKey ? '#fff' : undefined,
              }}
            >
              🤖 AI {aiConfig.apiKey ? '已配置 ✓' : '配置'}
            </button>
          </div>
        </div>
      </header>

      <div className="app-content" style={{ flex: 1, position: 'relative' }}>
        {error && <div className="error-message">⚠️ {error}</div>}

        {useNewAiMode ? (
          <AiWorkflowIDE
            ref={ideRef}
            workflowDef={workflowJson}
            workflowExecution={workflowExecution}
            theme={themeMode}
            themeColor={themeColor}
            layoutDirection="LR"
            aiConfig={aiConfig}
            onSave={handleSave}
            onWorkflowChange={handleWorkflowChange}
            onRequestImport={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.json';
              input.onchange = (e) => handleFileUpload(e as any);
              input.click();
            }}
          />
        ) : (
          <WorkflowIDE
            ref={ideRef}
            workflowDef={workflowJson}
            workflowExecution={workflowExecution}
            readOnly={isReadOnly}
            uiMode={uiMode}
            theme={themeMode}
            themeColor={themeColor}
            layoutDirection="LR"
            searchQuery={searchQuery}
            viewMode={viewMode}
            aiConfig={aiConfig}
            onSave={handleSave}
            onWorkflowChange={handleWorkflowChange}
            onRequestImport={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.json';
              input.onchange = (e) => handleFileUpload(e as any);
              input.click();
            }}
            executionActions={workflowExecution ? {
              allowOperations,
              onPause: (wfId) => console.log('[demo] 暂停工作流', wfId),
              onResume: (wfId) => console.log('[demo] 继续工作流', wfId),
              onTerminate: (wfId) => console.log('[demo] 终止工作流', wfId),
              onRetry: (wfId) => console.log('[demo] 重试工作流', wfId),
              onRestart: (wfId, opts) => console.log('[demo] 重启工作流', wfId, opts?.useLatestDef ? '（最新版本）' : '（执行版本）'),
              onRerunFromTask: (wfId, ref, taskId) => console.log('[demo] 从任务重新运行', wfId, ref, 'taskId:', taskId),
              onSkipTask: (wfId, ref, taskId) => console.log('[demo] 跳过任务', wfId, ref, 'taskId:', taskId),
            } : undefined}
          />
        )}
      </div>

      {/* 全局居中 AI 服务配置弹窗 */}
      {showAiConfig && (
        <div className="ai-config-backdrop" onClick={() => setShowAiConfig(false)}>
          <div className="ai-config-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ai-config-modal-header">
              <div className="ai-config-title">
                <span style={{ fontSize: 20 }}>🤖</span>
                <span>AI 服务与模型配置</span>
              </div>
              <button
                className="ai-config-close"
                onClick={() => setShowAiConfig(false)}
                title="关闭 (Esc)"
              >
                ✕
              </button>
            </div>

            <div className="ai-config-modal-body">
              <div className="ai-config-field">
                <label className="ai-config-label">API Key</label>
                <input
                  className="ai-config-input"
                  type="password"
                  placeholder="sk-..."
                  value={aiDraft.apiKey}
                  onChange={(e) => setAiDraft((d) => ({ ...d, apiKey: e.target.value }))}
                  autoFocus
                />
                <span className="ai-config-help">支持 OpenAI、DeepSeek、Moonshot、通义千问等兼容服务的 API Key</span>
              </div>

              <div className="ai-config-field">
                <label className="ai-config-label">Base URL (接口地址)</label>
                <input
                  className="ai-config-input"
                  type="text"
                  placeholder="https://api.openai.com/v1"
                  value={aiDraft.baseUrl}
                  onChange={(e) => setAiDraft((d) => ({ ...d, baseUrl: e.target.value }))}
                />
              </div>

              <div className="ai-config-field">
                <label className="ai-config-label">Model (模型名称)</label>
                <input
                  className="ai-config-input"
                  type="text"
                  placeholder="gpt-4o / deepseek-chat"
                  value={aiDraft.model}
                  onChange={(e) => setAiDraft((d) => ({ ...d, model: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveAiConfig();
                  }}
                />
              </div>
            </div>

            <div className="ai-config-actions">
              <button className="ai-config-btn cancel" onClick={() => setShowAiConfig(false)}>
                取消
              </button>
              <button className="ai-config-btn save" onClick={saveAiConfig}>
                保存配置
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DemoApp;
