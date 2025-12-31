import { useState, useCallback, useEffect } from 'react';
import { ReactFlowProvider } from 'reactflow';
import WorkflowDesigner from './components/WorkflowDesigner';
import TaskDetailPanel from './components/TaskDetailPanel';
import WorkflowSettingsPanel from './components/WorkflowSettingsPanel';
import JsonPreviewPanel from './components/JsonPreviewPanel';
import useWorkflowStore from './store/workflowStore';
import './App.css';

function App() {
  const {
    workflowDef,
    mode,
    setMode,
    setWorkflow,
    layoutDirection,
    setLayoutDirection,
    selectedTask,
    setSelectedTask
  } = useWorkflowStore();

  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState('');
  const [theme, setTheme] = useState('dark');
  const [edgeType, setEdgeType] = useState('default');
  const [nodesLocked, setNodesLocked] = useState(true);
  const [showWorkflowSettings, setShowWorkflowSettings] = useState(false);
  const [showJsonPreview, setShowJsonPreview] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // 处理文件上传
  const handleFileUpload = useCallback((event) => {
    const file = event.target.files[0];
    if (!file) return;

    setFileName(file.name);
    setError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target.result);
        setWorkflow(json, layoutDirection);
      } catch (err) {
        setError(`解析 JSON 失败: ${err.message}`);
      }
    };
    reader.onerror = () => setError('读取文件失败');
    reader.readAsText(file);
  }, [setWorkflow, layoutDirection]);

  // 加载示例工作流
  const loadSampleWorkflow = useCallback(async (sampleName) => {
    try {
      const response = await fetch(`/sample-workflows/${sampleName}.json`);
      if (!response.ok) throw new Error(`加载示例失败: ${response.statusText}`);
      const json = await response.json();
      setFileName(`${sampleName}.json (示例)`);
      setWorkflow(json, layoutDirection);
      setError(null);
    } catch (err) {
      setError(`加载示例工作流失败: ${err.message}`);
    }
  }, [setWorkflow, layoutDirection]);

  // 切换主题
  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  }, []);

  // 切换边类型
  const cycleEdgeType = useCallback(() => {
    setEdgeType(prev => {
      const types = ['default', 'step', 'smoothstep', 'straight'];
      const currentIndex = types.indexOf(prev);
      return types[(currentIndex + 1) % types.length];
    });
  }, []);

  const edgeTypeLabels = {
    'default': '曲线',
    'step': '阶梯',
    'smoothstep': '平滑阶梯',
    'straight': '直线'
  };

  // 切换布局方向
  const toggleLayoutDirection = () => {
    const newDir = layoutDirection === 'TB' ? 'LR' : 'TB';
    setLayoutDirection(newDir);
  };

  // 自动缩放以适应屏幕
  const zoomToFit = useCallback(() => {
    window.dispatchEvent(new CustomEvent('workflow-zoom-to-fit'));
  }, []);

  // 保存/下载工作流
  const handleSave = useCallback(() => {
    if (!workflowDef) return;
    const dataStr = JSON.stringify(workflowDef, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.body.appendChild(document.createElement('a'));
    link.href = url;
    link.download = `${workflowDef.name || 'workflow'}_v${workflowDef.version || 1}.json`;
    link.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      link.remove();
    }, 100);
  }, [workflowDef]);

  return (
    <div className={`app ${theme === 'light' ? 'light-theme' : ''}`}>
      <header className="app-header">
        <div className="header-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <h1 className="app-title">
              <span className="title-icon">⚡</span>
              Conductor Workflow IDE
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
            {/* 模式切换 */}
            <div className="mode-toggle">
              <button
                className={`mode-btn ${mode === 'view' ? 'active' : ''}`}
                onClick={() => setMode('view')}
              >
                👁️ 查看
              </button>
              <button
                className={`mode-btn ${mode === 'edit' ? 'active' : ''}`}
                onClick={() => {
                  setMode('edit');
                  setNodesLocked(false);
                }}
              >
                ✏️ 编辑
              </button>
              <button
                className={`mode-btn ${mode === 'run' ? 'active' : ''}`}
                onClick={() => setMode('run')}
              >
                ▶️ 运行
              </button>
            </div>

            <div className="divider"></div>

            {/* 示例加载 */}
            <select className="sample-select" onChange={(e) => loadSampleWorkflow(e.target.value)}>
              <option value="">选择示例...</option>
              <option value="simple-workflow">简单流程</option>
              <option value="decision-workflow">分支流程</option>
              <option value="fork-join-workflow">并行流程</option>
              <option value="complex-workflow">复杂流程</option>
            </select>

            {/* 功能设置 */}
            <div className="settings-buttons">
              <button className="settings-btn" onClick={toggleTheme} title="切换主题">
                {theme === 'dark' ? '🌙' : '☀️'}
              </button>
              <button
                className={`settings-btn ${showJsonPreview ? 'active' : ''}`}
                onClick={() => setShowJsonPreview(!showJsonPreview)}
                title="预览 JSON"
              >
                📄
              </button>
              <button className="settings-btn" onClick={zoomToFit} title="自动适应窗口">
                🎯
              </button>
              <button className="settings-btn" onClick={cycleEdgeType} title={edgeTypeLabels[edgeType]}>
                📏
              </button>
              <button className="settings-btn" onClick={toggleLayoutDirection} title="切换布局方向">
                {layoutDirection === 'TB' ? '⬇️' : '➡️'}
              </button>
              <button className="settings-btn" onClick={() => setNodesLocked(!nodesLocked)} title={nodesLocked ? '解锁节点' : '锁定节点'}>
                {nodesLocked ? '🔒' : '🔓'}
              </button>
            </div>

            <label className="upload-btn">
              <input type="file" accept=".json" onChange={handleFileUpload} style={{ display: 'none' }} />
              📤 上传
            </label>

            {mode === 'edit' && (
              <button className="save-btn" onClick={handleSave}>
                💾 保存
              </button>
            )}
          </div>
        </div>

        {workflowDef && (
          <div
            className="workflow-info"
            onClick={() => setShowWorkflowSettings(true)}
            style={{ cursor: 'pointer', transition: 'background 0.2s' }}
            title="点击配置工作流全局属性"
          >
            <span className="info-item"><strong>{workflowDef.name}</strong> v{workflowDef.version}</span>
            <span className="info-item opacity-70">{workflowDef.description}</span>
            <span style={{ fontSize: '10px', marginLeft: '12px', opacity: 0.6, background: 'rgba(59, 130, 246, 0.2)', padding: '2px 6px', borderRadius: '4px' }}>⚙️ 配置</span>
          </div>
        )}
      </header>

      <div className="app-content">
        {error && <div className="error-message">⚠️ {error}</div>}

        {!workflowDef && !error && (
          <div className="welcome-message">
            <div className="welcome-icon">🚀</div>
            <h2>Conductor 工作流设计器</h2>
            <p>请上传 JSON 或选择示例开始，切换到“编辑”模式可进行添加节点操作</p>
          </div>
        )}

        {workflowDef && (
          <div className="workflow-container">
            <JsonPreviewPanel
              isOpen={showJsonPreview}
              onClose={() => setShowJsonPreview(false)}
              theme={theme}
            />

            <div className="workflow-viewer">
              <ReactFlowProvider>
                <WorkflowDesigner
                  onNodeClick={setSelectedTask}
                  edgeType={edgeType}
                  theme={theme}
                  nodesLocked={nodesLocked}
                  searchQuery={searchQuery}
                />
              </ReactFlowProvider>
            </div>

            <TaskDetailPanel
              task={selectedTask}
              onClose={() => setSelectedTask(null)}
              theme={theme}
            />

            <WorkflowSettingsPanel
              isOpen={showWorkflowSettings}
              onClose={() => setShowWorkflowSettings(false)}
              theme={theme}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
