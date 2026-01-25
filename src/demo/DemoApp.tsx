import { useState, useCallback } from 'react';
import { WorkflowIDE } from '../WorkflowIDE';
import useWorkflowStore from '../store/workflowStore'; // Still used for some global state in demo
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

  // Access store for Mode switching if needed by Header (optional, or pass via props)
  const storeState = useWorkflowStore();
  const workflowDef = storeState?.workflowDef;

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
            {workflowDef && (
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
          </div>
        </div>
      </header>

      <div className="app-content" style={{ flex: 1, position: 'relative' }}>
        {error && <div className="error-message">⚠️ {error}</div>}

        {!workflowJson && !error && !workflowDef && (
          <div className="welcome-message">
            <h2>请选择示例或上传工作流以开始</h2>
          </div>
        )}

        <WorkflowIDE
          workflowDef={workflowJson}
          readOnly={isReadOnly}
          theme={themeMode}
          themeColor={themeColor}
          layoutDirection="LR"
          searchQuery={searchQuery}
        />
      </div>
    </div>
  );
}

export default DemoApp;
