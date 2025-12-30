import { useState, useCallback, useEffect } from 'react';
import WorkflowDesigner from './components/WorkflowDesigner';
import TaskDetailPanel from './components/TaskDetailPanel';
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

  return (
    <div className={`app ${theme === 'light' ? 'light-theme' : ''}`}>
      <header className="app-header">
        <div className="header-content">
          <h1 className="app-title">
            <span className="title-icon">⚡</span>
            Conductor Workflow IDE
          </h1>
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
                  setNodesLocked(false); // 进入编辑模式自动解锁节点
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
              <button className="settings-btn" onClick={toggleTheme}>
                {theme === 'dark' ? '🌙' : '☀️'}
              </button>
              <button className="settings-btn" onClick={cycleEdgeType} title={edgeTypeLabels[edgeType]}>
                📏
              </button>
              <button className="settings-btn" onClick={toggleLayoutDirection}>
                {layoutDirection === 'TB' ? '⬇️' : '➡️'}
              </button>
              <button className="settings-btn" onClick={() => setNodesLocked(!nodesLocked)}>
                {nodesLocked ? '🔒' : '🔓'}
              </button>
            </div>

            <label className="upload-btn">
              <input type="file" accept=".json" onChange={handleFileUpload} style={{ display: 'none' }} />
              📤 上传
            </label>

            {mode === 'edit' && (
              <button className="save-btn" onClick={() => alert('保存逻辑待实现')}>
                💾 保存
              </button>
            )}
          </div>
        </div>

        {workflowDef && (
          <div className="workflow-info">
            <span className="info-item"><strong>{workflowDef.name}</strong> v{workflowDef.version}</span>
            <span className="info-item opacity-70">{workflowDef.description}</span>
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
            <div className="workflow-viewer">
              <WorkflowDesigner
                onNodeClick={setSelectedTask}
                edgeType={edgeType}
                theme={theme}
                nodesLocked={nodesLocked}
              />
            </div>
            <TaskDetailPanel
              task={selectedTask}
              onClose={() => setSelectedTask(null)}
              theme={theme}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
