import { useState, useCallback } from 'react';
import { ReactFlowProvider } from 'reactflow';
import WorkflowDesigner from './components/WorkflowDesigner';
import TaskDetailPanel from './components/TaskDetailPanel';
import WorkflowSettingsPanel from './components/WorkflowSettingsPanel';
import JsonPreviewPanel from './components/JsonPreviewPanel';
import HealthCheckPanel from './components/HealthCheckPanel';
import useWorkflowStore from './store/workflowStore';
import { useTheme } from './hooks/useTheme';
import { ThemeControls } from './components/ThemeControls';
import './styles/tokens.css'; // Import Design Tokens
import './App.css';
import './styles/executionStyles.css';

function App() {
  const { mode: themeMode, color: themeColor } = useTheme();

  const {
    workflowDef,
    mode,
    setMode,
    setWorkflow,
    layoutDirection,
    setLayoutDirection,
    selectedTask,
    setSelectedTask,
    validationResults,
    edgeType,
    setEdgeType,
    nodesLocked,
    setNodesLocked
  } = useWorkflowStore();

  const [error, setError] = useState<string | null>(null);
  // const [fileName, setFileName] = useState(''); // Unused
  const [showWorkflowSettings, setShowWorkflowSettings] = useState(false);
  const [showJsonPreview, setShowJsonPreview] = useState(false);
  const [showHealthCheck, setShowHealthCheck] = useState(false);
  const [isDetailPanelOpen, setIsDetailPanelOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // 处理文件上传
  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // setFileName(file.name);
    setError(null);

    const reader = new FileReader();
    reader.onload = (e: ProgressEvent<FileReader>) => {
      try {
        const result = e.target?.result as string;
        if (!result) return;
        const json = JSON.parse(result);
        setWorkflow(json, layoutDirection);
        // 清除初始加载产生的历史记录，防止撤销导致返回首页
        (useWorkflowStore as any).temporal.getState().clear();
      } catch (err: any) {
        setError(`解析 JSON 失败: ${err.message}`);
      }
    };
    reader.onerror = () => setError('读取文件失败');
    reader.readAsText(file);
  }, [setWorkflow, layoutDirection]);

  // 加载示例工作流
  const loadSampleWorkflow = useCallback(async (sampleName: string) => {
    if (!sampleName) return;
    try {
      const response = await fetch(`/sample-workflows/${sampleName}.json`);
      if (!response.ok) throw new Error(`加载示例失败: ${response.statusText}`);
      const json = await response.json();
      // setFileName(`${sampleName}.json (示例)`);
      setWorkflow(json, layoutDirection);
      // 清除初始加载产生的历史记录
      (useWorkflowStore as any).temporal.getState().clear();
      setError(null);
    } catch (err: any) {
      setError(`加载示例工作流失败: ${err.message}`);
    }
  }, [setWorkflow, layoutDirection]);

  // toggleTheme removed - used toggleMode directly

  // 切换边类型
  const cycleEdgeType = useCallback(() => {
    const types = ['default', 'step', 'smoothstep', 'straight'];
    const currentIndex = types.indexOf(edgeType);
    const nextType = types[(currentIndex + 1) % types.length];
    setEdgeType(nextType);
  }, [edgeType, setEdgeType]);

  const edgeTypeLabels: Record<string, string> = {
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

  // 选中任务并打开面板
  const handleNodeClick = useCallback((task: any) => {
    setSelectedTask(task);
    setIsDetailPanelOpen(true);
  }, [setSelectedTask]);

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
    <div
      className={`app ${themeMode === 'light' ? 'light-theme' : ''}`}
      data-mode={themeMode}
      data-brand={themeColor}
    >
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
              <ThemeControls />
              <button
                className={`settings-btn ${showJsonPreview ? 'active' : ''}`}
                onClick={() => setShowJsonPreview(!showJsonPreview)}
                title="预览 JSON"
              >
                📄
              </button>
              <button
                className={`settings-btn ${showHealthCheck ? 'active' : ''}`}
                onClick={() => setShowHealthCheck(!showHealthCheck)}
                title="健康检查"
                style={{ position: 'relative' }}
              >
                🩺
                {(validationResults?.errors?.length > 0 || validationResults?.warnings?.length > 0) && (
                  <span style={{
                    position: 'absolute',
                    top: '-4px',
                    right: '-4px',
                    background: (validationResults?.errors?.length || 0) > 0 ? '#ef4444' : '#f59e0b',
                    color: '#fff',
                    borderRadius: '10px',
                    padding: '2px 5px',
                    fontSize: '9px',
                    fontWeight: 'bold',
                    border: '2px solid #1e293b'
                  }}>
                    {(validationResults?.errors?.length || 0) + (validationResults?.warnings?.length || 0)}
                  </span>
                )}
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
              theme={themeMode}
            />

            <div className="workflow-viewer">
              <ReactFlowProvider>
                <WorkflowDesigner
                  onNodeClick={handleNodeClick}
                  edgeType={edgeType}
                  theme={themeMode}
                  nodesLocked={nodesLocked}
                  searchQuery={searchQuery}
                />
              </ReactFlowProvider>
            </div>

            <TaskDetailPanel
              task={isDetailPanelOpen ? selectedTask : null}
              onClose={() => setIsDetailPanelOpen(false)}
              theme={themeMode}
            />

            <WorkflowSettingsPanel
              isOpen={showWorkflowSettings}
              onClose={() => setShowWorkflowSettings(false)}
              theme={themeMode}
            />

            <HealthCheckPanel
              isOpen={showHealthCheck}
              onClose={() => setShowHealthCheck(false)}
              theme={themeMode}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
