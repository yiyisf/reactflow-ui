import React, { useEffect } from 'react';
import { ReactFlowProvider } from 'reactflow';
import WorkflowDesigner from './components/WorkflowDesigner';
import TaskDetailPanel from './components/TaskDetailPanel';
import HealthCheckPanel from './components/HealthCheckPanel';
import ExecutionTaskPanel from './components/ExecutionTaskPanel';
import AIChatPanel from './components/AICopilot/AIChatPanel';
import useWorkflowStore from './store/workflowStore';
import { ThemeMode, ThemeColor, LayoutDirection } from './types/workflow';
import { WorkflowDef } from './types/conductor';
import './styles/tokens.css';
import './styles/executionStyles.css';

/**
 * WorkflowIDE 组件的属性接口
 */
export interface WorkflowIDEProps {
    /**
     * 初始加载的工作流定义 JSON 对象。
     * 如果在组件挂载后通过 Props 更新此值，IDE 内容也会随之更新。
     */
    workflowDef?: WorkflowDef;

    /**
     * 是否开启只读模式。
     * - `true`: 节点锁定，无法拖拽、连接或编辑。
     * - `false`: 允许完整的编辑功能。
     * @default false
     */
    readOnly?: boolean;

    /**
     * 主题模式。
     * @default 'dark'
     */
    theme?: ThemeMode;

    /**
     * 品牌主色调。
     * 修改此项会影响按钮、选中框等强调色。
     * @default 'blue'
     */
    themeColor?: ThemeColor;

    /**
     * 默认布局方向。
     * - `TB`: Top-to-Bottom (从上到下)
     * - `LR`: Left-to-Right (从左到右)
     * @default 'LR'
     */
    layoutDirection?: LayoutDirection;

    /**
     * 搜索关键词。
     * 传入字符串后，画布中通过 `taskReferenceName` 或 `name` 匹配的任务将被高亮显示。
     */
    searchQuery?: string;

    /**
     * 运行态数据 (WorkflowInstance)。
     * 当传入此属性时，IDE 会自动切换到 **Run Mode**，展示任务执行状态、连线路径高亮等。
     */
    workflowExecution?: any; // Workflow Instance or Task List

    /**
     * 点击保存按钮时的回调函数。
     * @param def 最新的工作流定义对象
     */
    onSave?: (def: WorkflowDef) => void;

    /**
     * 工作流定义发生变更时的实时回调 (可选)。
     */
    onWorkflowChange?: (def: WorkflowDef) => void;

    /**
     * 组件容器高度。
     * @default '100%'
     */
    height?: string | number;
}

/**
 * Conductor Workflow IDE 主组件。
 * 
 * 这是一个集成了流程设计、查看、搜索及运行态监控的 React 组件。
 * 它内部封装了 ReactFlow 画布、属性面板、状态管理等逻辑。
 * 
 * @example
 * ```tsx
 * <WorkflowIDE
 *   workflowDef={myWorkflow}
 *   theme="dark"
 *   onSave={(def) => console.log(def)}
 * />
 * ```
 */
export const WorkflowIDE: React.FC<WorkflowIDEProps> = ({
    workflowDef,
    readOnly = false,
    theme = 'dark',
    themeColor = 'blue',
    layoutDirection = 'LR', // Default per user request
    searchQuery = '',
    workflowExecution,
    // onSave,
    // onWorkflowChange,
    height = '100%'
}) => {
    const {
        setWorkflow,
        setTheme,
        setThemeColor,
        setLayoutDirection,
        setNodesLocked,
        selectedTask,

        setSelectedTask,
        edgeType,
        importExecutionJSON,
        setMode,
        isDetailPanelOpen,
        setIsDetailPanelOpen
    } = useWorkflowStore();

    const [showHealthCheck, setShowHealthCheck] = React.useState(false);

    // Initialize Store from Props
    useEffect(() => {
        setTheme(theme);
        setThemeColor(themeColor);
        setLayoutDirection(layoutDirection);
        setNodesLocked(readOnly || !!workflowExecution);
    }, [theme, themeColor, layoutDirection, readOnly, workflowExecution, setTheme, setThemeColor, setLayoutDirection, setNodesLocked]);

    // Handle initial workflow load
    useEffect(() => {
        if (workflowDef) {
            setWorkflow(workflowDef, layoutDirection);
            // Clear history after loading a new workflow to prevent undoing to empty state
            useWorkflowStore.temporal.getState().clear();
        }
    }, [workflowDef, setWorkflow, layoutDirection]);

    // Handle Execution Data Injection
    useEffect(() => {
        if (workflowExecution) {
            importExecutionJSON(workflowExecution);
        } else {
            setMode(readOnly ? 'view' : 'edit');
        }
    }, [workflowExecution, importExecutionJSON, setMode, readOnly]);

    // Handle node click
    const handleNodeClick = (task: any) => {
        setSelectedTask(task);
        if (!workflowExecution) {
            setIsDetailPanelOpen(true);
        }
    };

    return (
        <div
            className={`workflow-ide ${theme === 'light' ? 'light-theme' : ''}`}
            data-mode={theme}
            data-brand={themeColor}
            style={{ width: '100%', height: height, display: 'flex', position: 'relative', overflow: 'hidden' }}
        >
            <div className="workflow-viewer" style={{ flex: 1, position: 'relative' }}>
                <ReactFlowProvider>
                    <WorkflowDesigner
                        onNodeClick={handleNodeClick}
                        edgeType={edgeType}
                        theme={theme}
                        nodesLocked={readOnly || !!workflowExecution}
                        searchQuery={searchQuery}
                    />
                </ReactFlowProvider>

                {/* Internal Controls overlay if needed, or exposed via Slots later */}
                <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, display: 'flex', gap: 8 }}>
                    {/* Redundant button removed as it is now in ActionBar */}
                    {/* <button ... /> */}
                </div>
            </div>

            <TaskDetailPanel
                task={selectedTask}
                isOpen={isDetailPanelOpen}
                onClose={() => setIsDetailPanelOpen(false)}
                theme={theme}
            />

            <HealthCheckPanel
                isOpen={showHealthCheck}
                onClose={() => setShowHealthCheck(false)}
                theme={theme}
                onTaskSelect={(task) => {
                    setSelectedTask(task);
                    setIsDetailPanelOpen(true);
                }}
            />

            {
                workflowExecution && (
                    <ExecutionTaskPanel />
                )
            }

            <AIChatPanel />
        </div >
    );
};
