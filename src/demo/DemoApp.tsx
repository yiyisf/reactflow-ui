import { useState, useCallback, useRef, useEffect } from 'react';
import { WorkflowIDE } from '../WorkflowIDE';
import { AiWorkflowIDE } from '../AiWorkflowIDE';

import type { ViewMode } from '../types/workflow';
import type { WorkflowDef } from '../types/conductor';
import { useTheme } from '../hooks/useTheme';
import { ThemeControls } from '../components/ThemeControls';
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

  // Close popover on outside click
  useEffect(() => {
    if (!showAiConfig) return;
    const handler = (e: MouseEvent) => {
      if (aiConfigRef.current && !aiConfigRef.current.contains(e.target as Node)) {
        setShowAiConfig(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
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
      const response = await fetch(`/sample-workflows/${sampleName}.json`);
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

  const loadExecutionExample = useCallback(async (exampleName: string) => {
    if (!exampleName) {
      setWorkflowExecution(null);
      return;
    }
    try {
      const response = await fetch(`/sample-executions/${exampleName}.json`);
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <h1 className="app-title">
              <span className="title-icon">⚡</span>
              Conductor Workflow IDE <span style={{ fontSize: '12px', opacity: 0.6 }}>(Demo)</span>
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
            {/* 视图模式切换（运行态自动锁定为开发模式） */}
            {!workflowExecution && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'var(--bg-tertiary)', borderRadius: 8, padding: 3, border: '1px solid var(--border-primary)' }}>
                {(['business', 'standard', 'developer'] as ViewMode[]).map((m) => {
                  const labels: Record<ViewMode, string> = { business: '业务', standard: '标准', developer: '开发' };
                  const titles: Record<ViewMode, string> = { business: '仅展示核心业务节点', standard: '业务 + 控制流节点', developer: '展示所有节点（含数据转换）' };
                  return (
                    <button
                      key={m}
                      onClick={() => setViewMode(m)}
                      title={titles[m]}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 6,
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 500,
                        fontFamily: 'inherit',
                        background: viewMode === m ? 'var(--color-accent)' : 'transparent',
                        color: viewMode === m ? '#fff' : 'var(--text-secondary)',
                        transition: 'all 0.15s',
                      }}
                    >
                      {labels[m]}
                    </button>
                  );
                })}
              </div>
            )}
            {workflowExecution && (
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '4px 8px', background: 'var(--bg-tertiary)', borderRadius: 6, border: '1px solid var(--border-primary)' }}>
                运行态 · 开发模式
              </span>
            )}

            {workflowExecution && !useNewAiMode && (
              <>
                <button
                  className={`mode-btn ${!allowOperations ? 'active' : ''}`}
                  onClick={() => setAllowOperations(prev => !prev)}
                  title={allowOperations ? "切换至操作受限状态" : "切换至允许操作状态"}
                  style={{
                    background: !allowOperations ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-tertiary)',
                    border: !allowOperations ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--border-primary)',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    color: !allowOperations ? 'var(--status-failed)' : 'var(--text-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '13px',
                    fontWeight: 500,
                    transition: 'all 0.2s',
                  }}
                >
                  {allowOperations ? '🔓 操作授权' : '🔒 操作受限'}
                </button>
                <div className="divider"></div>
              </>
            )}

            <div className="divider"></div>

            <button
              className={`mode-btn ${isReadOnly ? 'active' : ''}`}
              onClick={() => setIsReadOnly(!isReadOnly)}
              title={isReadOnly ? "切换到编辑模式" : "切换到只读模式"}
              style={{
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-primary)',
                padding: '6px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px',
                fontWeight: 500
              }}
            >
              {isReadOnly ? '👁️ 仅查看' : '✏️ 编辑中'}
            </button>

            <div className="divider"></div>

            <button
              className={`mode-btn ${useNewAiMode ? 'active' : ''}`}
              onClick={() => setUseNewAiMode(!useNewAiMode)}
              title={useNewAiMode ? "切换回旧版设计器" : "体验全新 AI 工作流设计器"}
              style={{
                background: useNewAiMode ? 'var(--color-accent)' : 'var(--bg-tertiary)',
                border: '1px solid var(--border-primary)',
                padding: '6px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
                color: useNewAiMode ? '#fff' : 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px',
                fontWeight: 500
              }}
            >
              {useNewAiMode ? '✨ AiWorkflowIDE' : '💻 WorkflowIDE'}
            </button>

            <div className="divider"></div>

            <ThemeControls />

            <button
              className="mode-btn"
              onClick={() => {
                setWorkflowJson(null);
                setCurrentDef(null);
                ideRef.current?.createBlankWorkflow();
              }}
              title="新建空白工作流"
              style={{
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-primary)',
                padding: '6px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
                color: 'var(--text-primary)',
                fontSize: '13px',
                fontWeight: 500
              }}
            >
              📄 新建
            </button>

            <select className="sample-select" onChange={(e) => loadSampleWorkflow(e.target.value)}>
              <option value="">编辑态示例...</option>
              <option value="simple-workflow">简单流程</option>
              <option value="decision-workflow">分支流程</option>
              <option value="fork-join-workflow">并行流程</option>
              <option value="complex-workflow">复杂流程</option>
            </select>

            <select
              className="sample-select"
              onChange={(e) => loadExecutionExample(e.target.value)}
              style={{ borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }}
            >
              <option value="">运行态示例...</option>
              <option value="human-approval">▶ HUMAN 人工审批（RUNNING · 暂停/终止/跳过任务）</option>
              <option value="mixed-status">✗ CI/CD 流水线（FAILED · 重试/重启）</option>
              <option value="loop-iterations">✓ DO_WHILE 循环迭代 ×3（COMPLETED · 重启）</option>
              <option value="retry-tasks">✓ 任务重试机制（COMPLETED · 重启）</option>
              <option value="fork-dynamic">✓ FORK_JOIN_DYNAMIC 动态并行（COMPLETED · 重启）</option>
              <option value="switch-branches">✓ SWITCH 分支执行（COMPLETED · 重启）</option>
            </select>

            <label className="upload-btn">
              <input type="file" accept=".json" onChange={handleFileUpload} style={{ display: 'none' }} />
              📤 上传
            </label>

            {(currentDef || workflowJson) && (
              <button
                className="mode-btn"
                onClick={handleExport}
                title="导出当前工作流 JSON"
                style={{
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-primary)',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  fontWeight: 500
                }}
              >
                📥 导出
              </button>
            )}

            <div className="divider"></div>

            <div style={{ position: 'relative' }} ref={aiConfigRef}>
              <button
                className="mode-btn"
                onClick={() => { setAiDraft(aiConfig); setShowAiConfig(v => !v); }}
                title="配置 AI 服务"
                style={{
                  background: aiConfig.apiKey ? 'var(--color-success)' : 'var(--bg-tertiary)',
                  border: '1px solid var(--border-primary)',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  color: aiConfig.apiKey ? '#fff' : 'var(--text-primary)',
                  fontSize: '13px',
                  fontWeight: 500
                }}
              >
                🤖 AI {aiConfig.apiKey ? '✓' : '配置'}
              </button>

              {showAiConfig && (
                <div className="ai-config-popover">
                  <div className="ai-config-title">AI 服务配置</div>

                  <label className="ai-config-label">API Key</label>
                  <input
                    className="ai-config-input"
                    type="password"
                    placeholder="sk-..."
                    value={aiDraft.apiKey}
                    onChange={e => setAiDraft(d => ({ ...d, apiKey: e.target.value }))}
                    autoFocus
                  />

                  <label className="ai-config-label">Base URL</label>
                  <input
                    className="ai-config-input"
                    type="text"
                    placeholder="https://api.openai.com/v1"
                    value={aiDraft.baseUrl}
                    onChange={e => setAiDraft(d => ({ ...d, baseUrl: e.target.value }))}
                  />

                  <label className="ai-config-label">Model</label>
                  <input
                    className="ai-config-input"
                    type="text"
                    placeholder="gpt-4o"
                    value={aiDraft.model}
                    onChange={e => setAiDraft(d => ({ ...d, model: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') saveAiConfig(); }}
                  />

                  <div className="ai-config-actions">
                    <button className="ai-config-btn cancel" onClick={() => setShowAiConfig(false)}>取消</button>
                    <button className="ai-config-btn save" onClick={saveAiConfig}>保存</button>
                  </div>
                </div>
              )}
            </div>
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
    </div>
  );
}

export default DemoApp;
