import { useState, useCallback, useRef, useEffect } from 'react';
import { WorkflowIDE } from '../WorkflowIDE';
import type { WorkflowIDERef } from '../WorkflowIDE';
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
  const ideRef = useRef<WorkflowIDERef>(null);

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
      setError(null);
    } catch (err: any) {
      setError(`加载示例工作流失败: ${err.message}`);
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

            <ThemeControls />

            <select className="sample-select" onChange={(e) => loadSampleWorkflow(e.target.value)}>
              <option value="">选择示例...</option>
              <option value="simple-workflow">简单流程</option>
              <option value="decision-workflow">分支流程</option>
              <option value="fork-join-workflow">并行流程</option>
              <option value="complex-workflow">复杂流程</option>
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

        {!workflowJson && !error && !currentDef && (
          <div className="welcome-message">
            <h2>请选择示例或上传工作流以开始</h2>
          </div>
        )}

        <WorkflowIDE
          ref={ideRef}
          workflowDef={workflowJson}
          readOnly={isReadOnly}
          theme={themeMode}
          themeColor={themeColor}
          layoutDirection="LR"
          searchQuery={searchQuery}
          aiConfig={aiConfig}
          onSave={handleSave}
          onWorkflowChange={handleWorkflowChange}
        />
      </div>
    </div>
  );
}

export default DemoApp;
