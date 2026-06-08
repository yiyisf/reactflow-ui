import React, { useCallback, useEffect, useImperativeHandle, forwardRef } from 'react';
import { ReactFlowProvider } from 'reactflow';
import WorkflowDesigner from './components/WorkflowDesigner';
import TaskDetailPanel from './components/TaskDetailPanel';
import HealthCheckPanel from './components/HealthCheckPanel';
import ExecutionTaskPanel from './components/ExecutionTaskPanel';
import AIChatPanel from './components/AICopilot/AIChatPanel';
import WorkflowRunPanel from './components/WorkflowRunPanel';
import ExecutionSummaryPanel from './components/ExecutionSummaryPanel';
import useWorkflowStore from './store/workflowStore';
import { ThemeMode, ThemeColor, LayoutDirection, ValidationResults, ExecutionActions, ViewMode } from './types/workflow';
import { WorkflowDef, WorkflowInstance } from './types/conductor';
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
     * 视图模式（仅在编辑/查看态生效，运行态强制为 developer）。
     * - `business`：仅展示核心业务节点
     * - `standard`：业务 + 控制流节点
     * - `developer`：展示所有节点（含数据转换）
     * @default 'developer'
     */
    viewMode?: ViewMode;

    /**
     * AI 配置。通过 Props 注入优先于 localStorage 配置。
     */
    aiConfig?: Partial<AIServiceConfig>;

    /**
     * 组件容器高度。
     * @default '100%'
     */
    height?: string | number;

    /**
     * P4.2: 触发工作流执行。用户在执行验证面板中点击"发起执行"时调用。
     * 返回 workflowId 后 IDE 自动切换至 run 模式并开始轮询。
     */
    onTriggerExecution?: (
        workflowName: string,
        version: number,
        input: Record<string, any>
    ) => Promise<{ workflowId: string }>;

    /**
     * P4.2: 轮询执行状态。IDE 在执行触发后按指数退避间隔调用。
     * 返回 null 表示暂未获取到结果，返回 WorkflowInstance 则加载执行数据。
     * 返回终态（COMPLETED/FAILED/TIMED_OUT/TERMINATED）后停止轮询。
     */
    onPollExecution?: (workflowId: string) => Promise<WorkflowInstance | null>;

    /**
     * P4.2: 初始轮询间隔（毫秒），内部使用指数退避，最大退避至 15000ms。
     * @default 3000
     */
    executionPollInterval?: number;
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
    layoutDirection = 'LR',
    searchQuery = '',
    workflowExecution,
    onRequestImport,
    executionActions,
    aiConfig,
    viewMode = 'developer',
    onSave,
    onWorkflowChange,
    height = '100%',
    onTriggerExecution,
    onPollExecution,
    executionPollInterval = 3000,
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
        setViewMode,
        isDetailPanelOpen,
        setIsDetailPanelOpen,
        selectTaskAction,
        workflowDef: storeWorkflowDef,
        isSimRunning,
        startSimulation,
        stopSimulation,
        mode,
        setShowRunPanel,
        showAnalysisPanel,
        setShowAnalysisPanel,
        executionData,
    } = useWorkflowStore();

    const [showHealthCheck, setShowHealthCheck] = React.useState(false);

    // 导出 JSON
    const handleExportJson = useCallback(() => {
        if (!storeWorkflowDef) return;
        const blob = new Blob([JSON.stringify(storeWorkflowDef, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${storeWorkflowDef.name || 'workflow'}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }, [storeWorkflowDef]);

    // 复制 Conductor DSL
    const handleCopyDsl = useCallback(() => {
        if (!storeWorkflowDef) return;
        navigator.clipboard.writeText(JSON.stringify(storeWorkflowDef, null, 2));
    }, [storeWorkflowDef]);

    // Initialize Store from Props
    useEffect(() => {
        setTheme(theme);
        setThemeColor(themeColor);
        setLayoutDirection(layoutDirection);
        setNodesLocked(readOnly || !!workflowExecution);
    }, [theme, themeColor, layoutDirection, readOnly, workflowExecution, setTheme, setThemeColor, setLayoutDirection, setNodesLocked]);

    // 运行态强制 developer 模式；否则跟随 viewMode prop
    useEffect(() => {
        setViewMode(workflowExecution ? 'developer' : viewMode);
    }, [viewMode, workflowExecution, setViewMode]);

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
            style={{ width: '100%', height: height, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}
        >
            {/* 顶部工具栏：操作按钮 */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                borderBottom: '1px solid var(--border)',
                background: 'var(--bg-primary)',
                flexShrink: 0,
                flexWrap: 'wrap',
            }}>
                <div style={{ flex: 1 }} />

                {/* P4.2: 执行验证按钮（edit 模式） */}
                {mode === 'edit' && storeWorkflowDef && (
                    <button
                        onClick={() => setShowRunPanel(true)}
                        style={{
                            height: 28, padding: '0 10px',
                            background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)',
                            color: 'var(--color-accent)',
                            border: '1px solid color-mix(in srgb, var(--color-accent) 40%, transparent)',
                            borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                            display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'inherit',
                        }}
                        title="填写工作流入参并触发真实执行"
                    >
                        <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M4 3l9 5-9 5z" /></svg>
                        执行验证
                    </button>
                )}

                {/* P4.3: 分析按钮（run 模式） */}
                {mode === 'run' && executionData && (
                    <button
                        onClick={() => setShowAnalysisPanel(!showAnalysisPanel)}
                        style={{
                            height: 28, padding: '0 10px',
                            background: showAnalysisPanel
                                ? 'color-mix(in srgb, var(--color-accent) 20%, transparent)'
                                : 'transparent',
                            color: showAnalysisPanel ? 'var(--color-accent)' : 'var(--text-secondary)',
                            border: `1px solid ${showAnalysisPanel ? 'color-mix(in srgb, var(--color-accent) 40%, transparent)' : 'var(--border-strong)'}`,
                            borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 500,
                            display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'inherit',
                        }}
                        title="查看执行概览与异常分析"
                    >
                        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                            <rect x="2" y="2" width="12" height="12" rx="2" />
                            <path d="M5 8h6M5 5h3M5 11h4" />
                        </svg>
                        分析
                    </button>
                )}

                {/* 模拟运行按钮（非 run 模式下可用） */}
                {mode !== 'run' && storeWorkflowDef && (
                    isSimRunning ? (
                        <button
                            onClick={stopSimulation}
                            style={{
                                height: 28, padding: '0 10px',
                                background: 'color-mix(in srgb, var(--status-failed) 15%, transparent)',
                                color: 'var(--status-failed)',
                                border: '1px solid color-mix(in srgb, var(--status-failed) 30%, transparent)',
                                borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 500,
                                display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'inherit',
                            }}
                            title="停止模拟"
                        >
                            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><rect x="4" y="4" width="8" height="8" rx="1" /></svg>
                            停止
                        </button>
                    ) : (
                        <button
                            onClick={startSimulation}
                            style={{
                                height: 28, padding: '0 10px',
                                background: 'color-mix(in srgb, var(--status-completed) 15%, transparent)',
                                color: 'var(--status-completed)',
                                border: '1px solid color-mix(in srgb, var(--status-completed) 30%, transparent)',
                                borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 500,
                                display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'inherit',
                            }}
                            title="模拟执行工作流"
                        >
                            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M4 3l9 5-9 5z" /></svg>
                            模拟运行
                        </button>
                    )
                )}
                {/* 导出 / 复制 DSL */}
                {storeWorkflowDef && (
                    <>
                        <button
                            onClick={handleExportJson}
                            style={{
                                height: 28, padding: '0 10px',
                                background: 'transparent',
                                color: 'var(--text-secondary)',
                                border: '1px solid var(--border-strong)',
                                borderRadius: 6, cursor: 'pointer', fontSize: 12,
                                display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'inherit',
                            }}
                            title="导出工作流 JSON 文件"
                        >
                            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M3 10v2.5a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5V10M5 7l3 3 3-3M8 2v8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            导出 JSON
                        </button>
                        <button
                            onClick={handleCopyDsl}
                            style={{
                                height: 28, padding: '0 10px',
                                background: 'transparent',
                                color: 'var(--text-secondary)',
                                border: '1px solid var(--border-strong)',
                                borderRadius: 6, cursor: 'pointer', fontSize: 12,
                                display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'inherit',
                            }}
                            title="复制 Conductor DSL 到剪贴板"
                        >
                            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <rect x="4" y="4" width="9" height="10" rx="1" /><path d="M2 10V3a1 1 0 0 1 1-1h7" strokeLinecap="round" />
                            </svg>
                            复制 DSL
                        </button>
                    </>
                )}
            </div>

            <div className="workflow-viewer" style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
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
                    <ExecutionTaskPanel executionActions={executionActions} />
                )
            }

            <AIChatPanel aiConfig={aiConfig} />

            {/* P4.2: 执行验证面板 */}
            <WorkflowRunPanel
                onTriggerExecution={onTriggerExecution}
                onPollExecution={onPollExecution}
                executionPollInterval={executionPollInterval}
            />

            {/* P4.3: 执行分析面板（run 模式下悬浮） */}
            {mode === 'run' && <ExecutionSummaryPanel />}
        </div >
    );
});

WorkflowIDE.displayName = 'WorkflowIDE';
