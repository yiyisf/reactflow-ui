import React, { useEffect, useImperativeHandle, forwardRef } from 'react';
import { ReactFlowProvider } from 'reactflow';
import WorkflowDesigner from './components/WorkflowDesigner';
import TaskDetailPanel from './components/TaskDetailPanel';
import HealthCheckPanel from './components/HealthCheckPanel';
import ExecutionTaskPanel from './components/ExecutionTaskPanel';
import AIChatPanel from './components/AICopilot/AIChatPanel';
import useWorkflowStore from './store/workflowStore';
import { ThemeMode, ThemeColor, LayoutDirection, ValidationResults, ExecutionActions } from './types/workflow';
import { WorkflowDef } from './types/conductor';
import { AIServiceConfig } from './services/aiService';
import './styles/tokens.css';
import './styles/executionStyles.css';

/**
 * WorkflowIDE 的命令式 API（通过 ref 调用）
 */
export interface WorkflowIDERef {
    /** 获取当前最新的工作流定义 */
    getWorkflowDef: () => WorkflowDef | null;
    /** 获取当前校验结果 */
    getValidationResults: () => ValidationResults;
    /** 触发保存（等同于 Ctrl+S） */
    save: () => void;
    /** 创建空白工作流 */
    createBlankWorkflow: (name?: string) => void;
}

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
     * 空状态面板点击"导入 JSON"时的回调。
     */
    onRequestImport?: () => void;

    /**
     * 运行态操作回调。
     * 传入后，运行模式下会根据工作流状态显示对应的操作按钮（暂停/恢复/停止/重试/重启）。
     * 未传入的回调对应的按钮不会渲染。
     */
    executionActions?: ExecutionActions;

    /**
     * AI 配置。通过 Props 注入优先于 localStorage 配置。
     */
    aiConfig?: Partial<AIServiceConfig>;

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
export const WorkflowIDE = forwardRef<WorkflowIDERef, WorkflowIDEProps>(({
    workflowDef,
    readOnly = false,
    theme = 'dark',
    themeColor = 'blue',
    layoutDirection = 'LR', // Default per user request
    searchQuery = '',
    workflowExecution,
    onRequestImport,
    executionActions,
    aiConfig,
    onSave,
    onWorkflowChange,
    height = '100%'
}, ref) => {
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
        setIsDetailPanelOpen,
        selectTaskAction
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

    // Expose imperative API via ref
    useImperativeHandle(ref, () => ({
        getWorkflowDef: () => useWorkflowStore.getState().workflowDef,
        getValidationResults: () => useWorkflowStore.getState().validationResults,
        save: () => {
            const def = useWorkflowStore.getState().workflowDef;
            if (def && onSave) onSave(def);
        },
        createBlankWorkflow: (name?: string) => {
            useWorkflowStore.getState().createBlankWorkflow(name);
            useWorkflowStore.temporal.getState().clear();
        },
    }), [onSave]);

    // Notify consumer when workflowDef changes (skip initial load from props)
    useEffect(() => {
        if (!onWorkflowChange) return;
        let skipInitial = true;
        let prevDef = useWorkflowStore.getState().workflowDef;
        const unsub = useWorkflowStore.subscribe((state) => {
            const def = state.workflowDef;
            if (def === prevDef) return;
            prevDef = def;
            if (skipInitial) { skipInitial = false; return; }
            if (def) onWorkflowChange(def);
        });
        return unsub;
    }, [onWorkflowChange]);

    // Handle node click
    const handleNodeClick = (task: any) => {
        if (!workflowExecution) {
            selectTaskAction(task, true);
        } else {
            setSelectedTask(task);
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
                        onSave={onSave}
                        onRequestImport={onRequestImport}
                        executionActions={executionActions}
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
                aiConfig={aiConfig}
            />

            <HealthCheckPanel
                isOpen={showHealthCheck}
                onClose={() => setShowHealthCheck(false)}
                theme={theme}
                onTaskSelect={(task) => {
                    selectTaskAction(task, true);
                }}
            />

            {
                workflowExecution && (
                    <ExecutionTaskPanel />
                )
            }

            <AIChatPanel aiConfig={aiConfig} />
        </div >
    );
});

WorkflowIDE.displayName = 'WorkflowIDE';
