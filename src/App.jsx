import { useState, useCallback } from 'react';
import WorkflowViewer from './components/WorkflowViewer';
import TaskDetailPanel from './components/TaskDetailPanel';
import { parseConductorWorkflow } from './parser/conductorParser';
import { getLayoutedElements } from './layout/autoLayout';
import './App.css';

function App() {
  const [workflowData, setWorkflowData] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState('');
  const [theme, setTheme] = useState('dark'); // 'dark' or 'light'
  const [edgeType, setEdgeType] = useState('default'); // 'default', 'step', 'smoothstep', 'straight'
  const [layoutDirection, setLayoutDirection] = useState('TB'); // 'TB' (top-bottom) or 'LR' (left-right)
  const [nodesLocked, setNodesLocked] = useState(true); // 节点是否锁定（默认锁定）
  const [workflowKey, setWorkflowKey] = useState(0); // 用于强制重新渲染

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
        processWorkflow(json);
      } catch (err) {
        setError(`解析 JSON 失败: ${err.message}`);
        setWorkflowData(null);
      }
    };
    reader.onerror = () => {
      setError('读取文件失败');
      setWorkflowData(null);
    };
    reader.readAsText(file);
  }, []);

  // 处理工作流数据
  const processWorkflow = useCallback((workflowDef, direction) => {
    try {
      // 解析工作流
      const { nodes, edges, taskMap } = parseConductorWorkflow(workflowDef);

      if (nodes.length === 0) {
        setError('工作流中没有任务');
        setWorkflowData(null);
        return;
      }

      // 自动布局 - 使用传入的方向或当前方向
      const layoutedNodes = getLayoutedElements(nodes, edges, { direction: direction || layoutDirection });

      setWorkflowData({
        nodes: layoutedNodes,
        edges,
        taskMap,
        workflowDef
      });
      setSelectedTask(null);
      setError(null);
      setWorkflowKey(prev => prev + 1); // 强制重新渲染
    } catch (err) {
      setError(`处理工作流失败: ${err.message}`);
      setWorkflowData(null);
      console.error('Workflow processing error:', err);
    }
  }, [layoutDirection]);

  // 加载示例工作流
  const loadSampleWorkflow = useCallback(async (sampleName) => {
    try {
      const response = await fetch(`/sample-workflows/${sampleName}.json`);
      if (!response.ok) {
        throw new Error(`加载示例失败: ${response.statusText}`);
      }
      const json = await response.json();
      setFileName(`${sampleName}.json (示例)`);
      processWorkflow(json);
    } catch (err) {
      setError(`加载示例工作流失败: ${err.message}`);
      setWorkflowData(null);
    }
  }, [processWorkflow]);

  // 处理节点点击
  const handleNodeClick = useCallback((task) => {
    setSelectedTask(task);
  }, []);

  // 关闭详情面板
  const handleCloseDetail = useCallback(() => {
    setSelectedTask(null);
  }, []);

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
    'default': '默认曲线',
    'step': '阶梯线',
    'smoothstep': '平滑阶梯',
    'straight': '直线'
  };

  // 切换布局方向
  const toggleLayoutDirection = useCallback(() => {
    const newDirection = layoutDirection === 'TB' ? 'LR' : 'TB';
    setLayoutDirection(newDirection);

    // 如果已有工作流数据，重新布局
    if (workflowData?.workflowDef) {
      processWorkflow(workflowData.workflowDef, newDirection);
    }
  }, [layoutDirection, workflowData, processWorkflow]);

  // 切换节点锁定状态
  const toggleNodesLock = useCallback(() => {
    setNodesLocked(prev => !prev);
  }, []);

  return (
    <div className={`app ${theme === 'light' ? 'light-theme' : ''}`}>
      {/* Header */}
      <header className="app-header">
        <div className="header-content">
          <h1 className="app-title">
            <span className="title-icon">⚡</span>
            Conductor 工作流可视化
          </h1>
          <div className="header-actions">
            {/* 示例工作流按钮 */}
            <div className="sample-buttons">
              <button
                className="sample-btn"
                onClick={() => loadSampleWorkflow('simple-workflow')}
              >
                📝 简单流程
              </button>
              <button
                className="sample-btn"
                onClick={() => loadSampleWorkflow('decision-workflow')}
              >
                🔀 分支流程
              </button>
              <button
                className="sample-btn"
                onClick={() => loadSampleWorkflow('fork-join-workflow')}
              >
                🔱 并行流程
              </button>
              <button
                className="sample-btn"
                onClick={() => loadSampleWorkflow('complex-workflow')}
              >
                🎯 复杂流程
              </button>
            </div>

            {/* 设置按钮 */}
            <div className="settings-buttons">
              <button
                className="settings-btn"
                onClick={toggleTheme}
                title="切换主题"
              >
                {theme === 'dark' ? '🌙' : '☀️'} {theme === 'dark' ? '深色' : '浅色'}
              </button>
              <button
                className="settings-btn"
                onClick={cycleEdgeType}
                title="切换连接线类型"
              >
                📏 {edgeTypeLabels[edgeType]}
              </button>
              <button
                className="settings-btn"
                onClick={toggleLayoutDirection}
                title="切换布局方向"
              >
                {layoutDirection === 'TB' ? '⬇️ 纵向' : '➡️ 横向'}
              </button>
              <button
                className="settings-btn"
                onClick={toggleNodesLock}
                title="切换节点锁定"
              >
                {nodesLocked ? '🔒 已锁定' : '🔓 可拖拽'}
              </button>
            </div>

            {/* 文件上传 */}
            <label className="upload-btn">
              <input
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
              📤 上传 JSON
            </label>
          </div>
        </div>

        {fileName && (
          <div className="file-info">
            当前文件: <span className="file-name">{fileName}</span>
          </div>
        )}

        {workflowData?.workflowDef && (
          <div className="workflow-info">
            <span className="info-item">
              <strong>名称:</strong> {workflowData.workflowDef.name}
            </span>
            {workflowData.workflowDef.version && (
              <span className="info-item">
                <strong>版本:</strong> {workflowData.workflowDef.version}
              </span>
            )}
            {workflowData.workflowDef.description && (
              <span className="info-item">
                <strong>描述:</strong> {workflowData.workflowDef.description}
              </span>
            )}
          </div>
        )}
      </header>

      {/* Main Content */}
      <div className="app-content">
        {error && (
          <div className="error-message">
            <span className="error-icon">⚠️</span>
            {error}
          </div>
        )}

        {!workflowData && !error && (
          <div className="welcome-message">
            <div className="welcome-icon">🚀</div>
            <h2>欢迎使用 Conductor 工作流可视化工具</h2>
            <p>请上传 Conductor 工作流 JSON 文件或选择示例工作流开始</p>
            <div className="features">
              <div className="feature">
                <span className="feature-icon">✅</span>
                <span>支持所有任务类型</span>
              </div>
              <div className="feature">
                <span className="feature-icon">✅</span>
                <span>自动 DAG 布局</span>
              </div>
              <div className="feature">
                <span className="feature-icon">✅</span>
                <span>嵌套任务层级</span>
              </div>
              <div className="feature">
                <span className="feature-icon">✅</span>
                <span>交互式详情查看</span>
              </div>
            </div>
          </div>
        )}

        {workflowData && (
          <div className="workflow-container">
            <div className="workflow-viewer">
              <WorkflowViewer
                key={workflowKey}
                nodes={workflowData.nodes}
                edges={workflowData.edges}
                taskMap={workflowData.taskMap}
                onNodeClick={handleNodeClick}
                edgeType={edgeType}
                theme={theme}
                nodesLocked={nodesLocked}
                layoutDirection={layoutDirection}
              />
            </div>
            <TaskDetailPanel
              task={selectedTask}
              onClose={handleCloseDetail}
              theme={theme}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
