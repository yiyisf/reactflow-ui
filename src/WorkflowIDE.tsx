import { useCallback, useEffect, useImperativeHandle, forwardRef, useState, useMemo, useRef } from 'react';
import { ReactFlowProvider } from 'reactflow';
import WorkflowDesigner from './components/WorkflowDesigner';
import TaskDetailPanel from './components/TaskDetailPanel';
import ExecutionTaskPanel from './components/ExecutionTaskPanel';
import AIChatPanel from './components/AICopilot/AIChatPanel';
import WorkflowRunPanel from './components/WorkflowRunPanel';
import ExecutionSummaryPanel from './components/ExecutionSummaryPanel';
import useWorkflowStore from './store/workflowStore';
import { useShallow } from 'zustand/react/shallow';
import { ThemeMode, ThemeColor, LayoutDirection, ValidationResults, ExecutionActions, ViewMode, WorkflowExecutionInput } from './types/workflow';
import { WorkflowDef, WorkflowInstance } from './types/conductor';
import { AIServiceConfig } from './services/aiService';
import { ActionDefinition } from './actions/types';
import { ActionRegistry, defaultActionRegistry } from './actions/registry';
import type { WorkflowLevel } from './types/workflowLibrary';
import { LibraryCatalog } from './library/catalog';
import { toActions } from './library/projections';
import { useLibraryCatalogLoader, useLibraryCatalogSnapshot } from './library/useLibraryCatalog';
import type { LibraryProvider } from './library/types';
import type { IdeProviders } from './providers/types';
import { useResolvedProviders } from './providers/WorkflowIdeProvider';
import { useTelemetry, useIdeOpenedOnce, useProStoreTelemetry } from './telemetry/useTelemetry';
import { StepFlowEditor } from './components/business/StepFlowEditor';
import { TemplateGallery } from './components/template/TemplateGallery';
import { ApiImportDialog } from './components/import/ApiImportDialog';
import type { ApiImportInsertInfo } from './components/import/ApiImportDialog';
import { appendImportedActions } from './import/insert';
import {
    useOnboardingController,
    OnboardingToolbarButtons,
    OnboardingOverlays,
    OnboardingGuideOverlay,
} from './components/onboarding/OnboardingController';
import './styles/tokens.css';
import './styles/executionStyles.css';
import { ChartColumn, Copy, Download, LayoutList, LayoutTemplate, Network, Play, Plug, Square, TriangleAlert, X } from 'lucide-react';
import { saveNameHint } from './onboarding/naming';
import { handOffSave, type HostSaveHandler } from './utils/hostSave';
import { isSameWorkflow } from './utils/sameWorkflow';
import ConfirmDialog from './components/ConfirmDialog';
import Toast from './components/Toast';
import { useToast } from './hooks/useToast';

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
    /** 打开「导入接口」对话框（OpenAPI / Swagger / Postman / curl），供宿主或自助接入向导调用 */
    openApiImport: () => void;
    /**
     * 把定义记为服务端已保存的版本（不传时取当前编辑中的定义）。「执行验证」按名称 + 版本运行已保存的版本，
     * 画布与它不同时会提示。宿主在自己确认保存成功、或用其它方式加载了服务端定义后调用。
     */
    markSaved: (def?: WorkflowDef) => void;
}

/**
 * WorkflowIDE 组件的属性接口
 */
export interface WorkflowIDEProps {
    /**
     * 初始加载的工作流定义 JSON 对象。
     * 如果在组件挂载后通过 Props 更新此值，IDE 内容也会随之更新。
     * 传入的定义默认视为服务端已保存的版本（「执行验证」据此判断画布有没有未保存的修改），见 `workflowDefSaved`。
     */
    workflowDef?: WorkflowDef;

    /**
     * `workflowDef` 是否是服务端已保存的版本，默认 `true`。
     * 传入本地文件、草稿等还没保存的定义时设为 `false`，「执行验证」会提示将运行已保存的版本。
     */
    workflowDefSaved?: boolean;

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
    /** 运行态执行实例数据（完整 Conductor Workflow 实例，或裸的任务实例数组） */
    workflowExecution?: WorkflowExecutionInput;

    /**
     * 点击保存按钮时的回调函数。
     * 异步保存请返回 Promise：resolve 后 IDE 才把这份定义记为已保存，reject 时执行面板继续提示"有未保存的修改"。
     * @param def 最新的工作流定义对象
     */
    onSave?: HostSaveHandler;

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
     * UI 体验模式：
     * - `pro` (默认): 专业开发者模式，展示完整 DAG 画布、底层参数、Monaco JSON
     * - `business`: 面向普通使用者的业务模式，提供卡片步骤流、业务动作与数据胶囊
     * @default 'pro'
     */
    uiMode?: 'pro' | 'business';

    /**
     * 自定义扩展的业务动作定义列表。
     * 宿主可传入自定义业务动作（如私有云/特定系统连接器）。
     */
    actions?: ActionDefinition[];

    /**
     * 流程库数据源（LibraryProvider）。提供后，库内流程 / 任务定义会生成业务动作并注册到本实例的动作库：
     * 流程库能力编译为 `SUB_WORKFLOW`，步骤在首次引用时固定为目录当前最新版本，
     * 库发布新版本后步骤不会自动跟随，徽标提示「有新版本」，由用户确认差异后手动升级。
     *
     * 同名动作 Provider 优先于 `actions`；不传时 `actions` 的行为完全不变。
     * `libraryProvider` 引用变化时重新加载，组件卸载时中止进行中的请求。
     *
     * ```tsx
     * const provider = createConductorLibraryProvider({ baseUrl, headers });
     * <WorkflowIDE uiMode="business" libraryProvider={provider} />
     * ```
     */
    libraryProvider?: LibraryProvider;

    /**
     * 统一扩展点集合（`library` / `onboarding` / `telemetry`）。
     * 解析顺序：专用 prop（如 `libraryProvider`）> 本 prop > 外层 `WorkflowIdeProvider` > 无。
     * 按字段比较引用，宿主每次渲染新建对象但 provider 实例不变时不会触发目录重载。
     */
    providers?: IdeProviders;

    /**
     * 当前正在编辑的工作流层级（L1 / L2 / L3）。
     * 提供时，动作选择器隐藏违反分层调用规则的流程库动作（L1 不显示 L2/L3，L2 不显示 L3）；未提供则不过滤。
     */
    currentWorkflowLevel?: WorkflowLevel;

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
    workflowDefSaved = true,
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
    uiMode = 'pro',
    actions,
    libraryProvider: libraryProviderProp,
    providers: providersProp,
    currentWorkflowLevel,
    onSave: onSaveProp,
    onWorkflowChange,
    height = '100%',
    onTriggerExecution,
    onPollExecution,
    executionPollInterval = 3000,
}, ref) => {
    // 扩展点解析：libraryProvider prop > providers prop > 外层 WorkflowIdeProvider
    const resolvedProviders = useResolvedProviders(providersProp, { library: libraryProviderProp });
    const libraryProvider = resolvedProviders.library;

    // 接入埋点（无 telemetry sink 时为空操作；只上报事件名与简单属性）
    const track = useTelemetry('workflow', resolvedProviders.telemetry);
    // ide_opened 每个实例只上报一次（StrictMode 双执行 effect 也不重复）
    useIdeOpenedOnce(track);
    // 专业模式本地试跑（ActionBar / SandboxConfigModal 都经 store.runLocalSandboxDryRun）
    useProStoreTelemetry(track);
    const handleStepAdded = useCallback((info: { source: 'library' | 'builtin' }) => {
        track('step_added', { source: info.source });
    }, [track]);
    const handleSandboxRun = useCallback((result: string) => {
        track('sandbox_run', { result, entry: 'business' });
    }, [track]);
    // 模板中心的试跑（快捷试跑 / 向导内试跑）
    const handleTemplateSandboxRun = useCallback((result: string) => {
        track('sandbox_run', { result, entry: 'template' });
    }, [track]);

    // 业务模式下的视图切换：卡片流 (card) vs 全景拓扑 (canvas)
    const [businessViewLayout, setBusinessViewLayout] = useState<'card' | 'canvas'>('card');
    const [showTemplateGallery, setShowTemplateGallery] = useState(false);
    // R23：等待确认的模板（画布上已有流程时）
    const [pendingTemplate, setPendingTemplate] = useState<{ def: WorkflowDef; replacing: string } | null>(null);
    // 接口导入：对话框开关；导入生成的动作仅在本会话内注册（登记为流程库能力属 v1.4.0）
    const [showApiImport, setShowApiImport] = useState(false);
    const [importedActions, setImportedActions] = useState<ActionDefinition[]>([]);

    // 自助接入（仅在解析到 providers.onboarding 时出现入口）
    const onboarding = useOnboardingController({
        provider: resolvedProviders.onboarding,
        track,
        disabled: readOnly || !!workflowExecution,
        onPickTemplate: () => setShowTemplateGallery(true),
        // 向导起点「从接口导入」：先建好骨架流程，再打开接口导入对话框
        onImportApi: () => setShowApiImport(true),
    });
    // R15（设计 3.3）：启用自助接入时，保存前用命名规范检查名称，只提示不阻断
    const [saveNameNotice, setSaveNameNotice] = useState<string | null>(null);
    const onboardingEnabled = !!resolvedProviders.onboarding;
    const onboardingDomains = onboarding.data.domains;
    const onSave = useMemo(() => {
        if (!onSaveProp) return undefined;
        return (def: WorkflowDef) => {
            setSaveNameNotice(onboardingEnabled ? saveNameHint(def.name, onboardingDomains) : null);
            track('workflow_saved');
            // R19：运行态画布展示的是实例定义，保存的永远是编辑中的定义
            const toSave = useWorkflowStore.getState().editWorkflowDefStash ?? def;
            // R19：宿主保存成功后（异步保存等 Promise resolve），执行验证运行的已保存版本才是这一份
            handOffSave(onSaveProp, toSave);
        };
    }, [onSaveProp, track, onboardingEnabled, onboardingDomains]);

    // 宿主没传 currentWorkflowLevel 时，用向导选择的层级作为默认
    const effectiveWorkflowLevel = currentWorkflowLevel ?? onboarding.level;

    // 流程库目录：每个 IDE 实例独立；provider 变化时重新加载，卸载时中止进行中的请求
    const [libraryCatalog] = useState(() => new LibraryCatalog());
    useLibraryCatalogLoader(libraryCatalog, libraryProvider);
    const catalogSnapshot = useLibraryCatalogSnapshot(libraryCatalog);

    // 动作注册表：内置动作 + actions prop + 流程库动作（同名 Provider 优先，先 unregister 再注册）
    const actionRegistry = useMemo(() => {
        const libraryActions = libraryProvider ? toActions(libraryCatalog) : [];
        if ((!actions || actions.length === 0) && libraryActions.length === 0 && importedActions.length === 0) return defaultActionRegistry;
        const reg = new ActionRegistry(defaultActionRegistry.getAllActions());
        if (actions) reg.registerAll(actions);
        reg.registerAll(importedActions);
        for (const a of libraryActions) {
            reg.unregister(a.id);
            reg.register(a);
        }
        return reg;
        // catalogSnapshot.revision：目录加载完成 / 变化后重建
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [actions, importedActions, libraryProvider, libraryCatalog, catalogSnapshot.revision]);
    const { setWorkflow, setWorkflowDefOnly, refreshGraph, graphStale, setTheme, setThemeColor, setLayoutDirection, setNodesLocked, selectedTask, setSelectedTask, edgeType, importExecutionJSON, setMode, setViewMode, isDetailPanelOpen, setIsDetailPanelOpen, selectTaskAction, workflowDef: storeWorkflowDef, isSimRunning, startSimulation, stopSimulation, mode, setShowRunPanel, showAnalysisPanel, setShowAnalysisPanel, executionData, workflowInstance } = useWorkflowStore(useShallow((s) => ({
            setWorkflow: s.setWorkflow,
            setWorkflowDefOnly: s.setWorkflowDefOnly,
            refreshGraph: s.refreshGraph,
            graphStale: s.graphStale,
            setTheme: s.setTheme,
            setThemeColor: s.setThemeColor,
            setLayoutDirection: s.setLayoutDirection,
            setNodesLocked: s.setNodesLocked,
            selectedTask: s.selectedTask,
            setSelectedTask: s.setSelectedTask,
            edgeType: s.edgeType,
            importExecutionJSON: s.importExecutionJSON,
            setMode: s.setMode,
            setViewMode: s.setViewMode,
            isDetailPanelOpen: s.isDetailPanelOpen,
            setIsDetailPanelOpen: s.setIsDetailPanelOpen,
            selectTaskAction: s.selectTaskAction,
            workflowDef: s.workflowDef,
            isSimRunning: s.isSimRunning,
            startSimulation: s.startSimulation,
            stopSimulation: s.stopSimulation,
            mode: s.mode,
            setShowRunPanel: s.setShowRunPanel,
            showAnalysisPanel: s.showAnalysisPanel,
            setShowAnalysisPanel: s.setShowAnalysisPanel,
            executionData: s.executionData,
            workflowInstance: s.workflowInstance,
        })));

    // 把模板生成的定义放上画布：替换已有流程时不清撤销历史，可以撤回（R8 / R23）
    const applyTemplate = useCallback((def: WorkflowDef) => {
        // 模板带来的步骤：每个顶层任务一条 step_added（source: template）
        for (let i = 0; i < (def.tasks?.length ?? 0); i++) track('step_added', { source: 'template' });
        setWorkflow(def, layoutDirection);
    }, [track, setWorkflow, layoutDirection]);

    // 导出 JSON（R19：运行态画布展示的是实例定义，导出的始终是编辑中的定义）
    const handleExportJson = useCallback(() => {
        const def = useWorkflowStore.getState().getEditingWorkflowDef();
        if (!def) return;
        const blob = new Blob([JSON.stringify(def, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${def.name || 'workflow'}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }, []);

    // 复制 Conductor DSL：U5 复制后给出结果，失败时说明原因和替代办法
    const { toasts, showToast, dismissToast } = useToast();
    const handleCopyDsl = useCallback(async () => {
        const def = useWorkflowStore.getState().getEditingWorkflowDef();
        if (!def) return;
        try {
            if (!navigator.clipboard?.writeText) throw new Error('当前浏览器不支持写入剪贴板');
            await navigator.clipboard.writeText(JSON.stringify(def, null, 2));
            showToast(`已复制「${def.name || '未命名流程'}」的 Conductor DSL（JSON）`, 'success');
        } catch (err) {
            const reason = err instanceof Error && err.name === 'NotAllowedError'
                ? '浏览器没有授予剪贴板权限（页面需要在 HTTPS 下并处于焦点）'
                : err instanceof Error ? err.message : String(err);
            showToast(`复制失败：${reason}。可以改用「导出 JSON」下载文件`, 'error');
        }
    }, [showToast]);

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
    // 只在 workflowDef 变化时读取，切换这个标记本身不重新加载定义
    const workflowDefSavedRef = useRef(workflowDefSaved);
    workflowDefSavedRef.current = workflowDefSaved;
    const layoutDirectionRef = useRef(layoutDirection);
    layoutDirectionRef.current = layoutDirection;
    useEffect(() => {
        if (!workflowDef) return;
        const current = useWorkflowStore.getState().getEditingWorkflowDef();
        // R21：受控用法下宿主把 onWorkflowChange 的结果回写成 prop。内容与画布相同就什么都不做：
        // 不重新布局、不触发 fitView、不清撤销历史，也不把用户的修改记成已保存
        if (isSameWorkflow(current, workflowDef)) return;
        // 只有真正换了流程才清撤销历史；同一流程被宿主改动时保留，用户仍能撤回到之前的状态
        const switching = !current || current.name !== workflowDef.name;
        setWorkflow(workflowDef, layoutDirectionRef.current);
        // R19：宿主传入的定义默认视为服务端已保存的版本；宿主声明未保存时清空基线
        useWorkflowStore.getState().markWorkflowSaved(workflowDefSavedRef.current ? undefined : null);
        if (switching) useWorkflowStore.temporal.getState().clear();
    }, [workflowDef, setWorkflow]);

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
        getWorkflowDef: () => useWorkflowStore.getState().getEditingWorkflowDef(),
        getValidationResults: () => useWorkflowStore.getState().validationResults,
        save: () => {
            const def = useWorkflowStore.getState().getEditingWorkflowDef();
            if (def && onSave) onSave(def);
        },
        createBlankWorkflow: (name?: string) => {
            useWorkflowStore.getState().createBlankWorkflow(name);
            useWorkflowStore.temporal.getState().clear();
        },
        openApiImport: () => setShowApiImport(true),
        markSaved: (def?: WorkflowDef) => useWorkflowStore.getState().markWorkflowSaved(def),
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
            // R19：运行态展示实例定义、离开运行态换回编辑定义，都不是用户的修改，不通知宿主
            if (state.editWorkflowDefStash || state.mode === 'run') return;
            if (def) onWorkflowChange(def);
        });
        return unsub;
    }, [onWorkflowChange]);

    // 离开卡片视图（切到画布/专业模式）前，补建过期的画布数据
    const isCardView = uiMode === 'business' && businessViewLayout === 'card';
    useEffect(() => {
        if (!isCardView && graphStale) refreshGraph();
    }, [isCardView, graphStale, refreshGraph]);

    // 接口导入确认：注册动作（业务卡片可正确渲染）并把步骤追加到流程末尾；
    // 业务卡片视图只更新定义，画布 / 专业模式需要重新布局
    const handleApiInsert = useCallback((newActions: ActionDefinition[], info: ApiImportInsertInfo) => {
        if (newActions.length === 0) return;
        const ids = new Set(newActions.map((a) => a.id));
        setImportedActions((prev) => [...prev.filter((a) => !ids.has(a.id)), ...newActions]);
        const next = appendImportedActions(useWorkflowStore.getState().workflowDef, newActions);
        if (isCardView) setWorkflowDefOnly(next);
        else setWorkflow(next, layoutDirection);
        track('api_imported', { format: info.format, count: info.count });
        for (let i = 0; i < newActions.length; i++) track('step_added', { source: 'import' });
    }, [isCardView, setWorkflowDefOnly, setWorkflow, layoutDirection, track]);

    // Handle node click
    const handleNodeClick = (task: any) => {
        if (mode !== 'run' && !workflowExecution) {
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
                {/* 业务模式下的视图切换器 */}
                {uiMode === 'business' && mode !== 'run' && (
                    <div style={{
                        display: 'inline-flex',
                        background: 'var(--bg-highlight)',
                        borderRadius: 6,
                        padding: 2,
                        border: '1px solid var(--border-secondary)',
                    }}>
                        <button
                            onClick={() => setBusinessViewLayout('card')}
                            style={{
                                height: 24, padding: '0 8px', borderRadius: 4, border: 'none',
                                background: businessViewLayout === 'card' ? 'var(--color-accent)' : 'transparent',
                                color: businessViewLayout === 'card' ? 'var(--color-on-accent)' : 'var(--text-secondary)',
                                cursor: 'pointer', fontSize: 11, fontWeight: 500,
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                            }}
                        >
                            <LayoutList size={14} strokeWidth={1.75} aria-hidden="true" />业务卡片流
                        </button>
                        <button
                            onClick={() => setBusinessViewLayout('canvas')}
                            style={{
                                height: 24, padding: '0 8px', borderRadius: 4, border: 'none',
                                background: businessViewLayout === 'canvas' ? 'var(--color-accent)' : 'transparent',
                                color: businessViewLayout === 'canvas' ? 'var(--color-on-accent)' : 'var(--text-secondary)',
                                cursor: 'pointer', fontSize: 11, fontWeight: 500,
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                            }}
                        >
                            <Network size={14} strokeWidth={1.75} aria-hidden="true" />全景画布
                        </button>
                    </div>
                )}

                <div style={{ flex: 1 }} />

                {/* 导入接口（编辑态；业务 / 专业模式均可用） */}
                {mode === 'edit' && !readOnly && (
                    <button
                        onClick={() => setShowApiImport(true)}
                        style={{
                            height: 28, padding: '0 10px',
                            background: 'transparent',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--border-secondary)',
                            borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 500,
                            display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'inherit',
                        }}
                        title="从 OpenAPI / Swagger / Postman / curl 导入接口，生成 HTTP 步骤"
                    >
                        <Plug size={14} strokeWidth={1.75} aria-hidden="true" />
                        <span>导入接口</span>
                    </button>
                )}
                {/* 自助接入：新建流程 / 申请上线 */}
                {mode !== 'run' && <OnboardingToolbarButtons c={onboarding} />}

                {/* 模板中心按钮（编辑/查看态下可用） */}
                {mode !== 'run' && (
                    <button
                        onClick={() => setShowTemplateGallery(true)}
                        style={{
                            height: 28, padding: '0 10px',
                            background: 'transparent',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--border-secondary)',
                            borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                            display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'inherit',
                        }}
                        title="打开场景化工作流模板中心"
                    >
                        <LayoutTemplate size={14} strokeWidth={1.75} aria-hidden="true" />
                        <span>模板中心</span>
                    </button>
                )}

                {/* P4.2: 执行验证按钮（edit 模式）。U5：宿主没接 onTriggerExecution 时不显示，免得点开才说未配置 */}
                {mode === 'edit' && storeWorkflowDef && onTriggerExecution && (
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
                        <Play size={14} strokeWidth={1.75} aria-hidden="true" />
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
                        <ChartColumn size={14} strokeWidth={1.75} aria-hidden="true" />
                        分析
                    </button>
                )}

                {/* 流转预览按钮（非 run 模式下可用）：只按连线顺序播放高亮动画，不执行任何步骤 */}
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
                            title="停止流转预览"
                        >
                            <Square size={14} strokeWidth={1.75} aria-hidden="true" />
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
                            title="按连线顺序播放步骤流转动画（不执行任何步骤）"
                        >
                            <Play size={14} strokeWidth={1.75} aria-hidden="true" />
                            流转预览
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
                                border: '1px solid var(--border-secondary)',
                                borderRadius: 6, cursor: 'pointer', fontSize: 12,
                                display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'inherit',
                            }}
                            title="导出工作流 JSON 文件"
                        >
                            <Download size={14} strokeWidth={1.75} aria-hidden="true" />
                            导出 JSON
                        </button>
                        <button
                            onClick={() => { void handleCopyDsl(); }}
                            style={{
                                height: 28, padding: '0 10px',
                                background: 'transparent',
                                color: 'var(--text-secondary)',
                                border: '1px solid var(--border-secondary)',
                                borderRadius: 6, cursor: 'pointer', fontSize: 12,
                                display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'inherit',
                            }}
                            title="复制 Conductor DSL 到剪贴板"
                        >
                            <Copy size={14} strokeWidth={1.75} aria-hidden="true" />
                            复制 DSL
                        </button>
                    </>
                )}
            </div>

            <Toast messages={toasts} onDismiss={dismissToast} />

            {saveNameNotice && (
                <div
                    role="status"
                    style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', fontSize: 12,
                        color: 'var(--cm-status-warning)',
                        background: 'var(--cm-warning-tint)',
                        borderBottom: '1px solid var(--border)',
                        flexShrink: 0,
                    }}
                >
                    <TriangleAlert size={14} strokeWidth={1.75} aria-hidden="true" style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1, color: 'var(--text-primary)' }}>{saveNameNotice}</span>
                    <button
                        type="button"
                        onClick={() => setSaveNameNotice(null)}
                        aria-label="关闭命名提示"
                        style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 2, display: 'inline-flex' }}
                    >
                        <X size={14} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                </div>
            )}

            {uiMode === 'business' && businessViewLayout === 'card' ? (
                <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                    <StepFlowEditor
                        workflowDef={storeWorkflowDef}
                        workflowExecution={workflowInstance ?? undefined}
                        registry={actionRegistry}
                        libraryCatalog={libraryProvider ? libraryCatalog : undefined}
                        currentWorkflowLevel={effectiveWorkflowLevel}
                        onStepAdded={handleStepAdded}
                        onSandboxRun={handleSandboxRun}
                        readOnly={readOnly || mode === 'run'}
                        onSave={onSave}
                        // 卡片视图与画布共用同一份撤销历史
                        onUndo={() => useWorkflowStore.temporal.getState().undo()}
                        onRedo={() => useWorkflowStore.temporal.getState().redo()}
                        onChange={(newDef) => {
                            // 卡片视图下画布未挂载：只更新定义，避免每次按键都做整图布局
                            setWorkflowDefOnly(newDef);
                        }}
                    />
                </div>
            ) : (
                <div className="workflow-viewer" style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                    <ReactFlowProvider>
                        <WorkflowDesigner
                            onNodeClick={handleNodeClick}
                            edgeType={edgeType}
                            theme={theme}
                            nodesLocked={readOnly || mode === 'run' || !!workflowExecution}
                            searchQuery={searchQuery}
                            onSave={onSave}
                            onRequestImport={onRequestImport}
                            executionActions={executionActions}
                        />
                    </ReactFlowProvider>
                </div>
            )}

            <TaskDetailPanel
                task={selectedTask}
                isOpen={isDetailPanelOpen && mode !== 'run'}
                onClose={() => setIsDetailPanelOpen(false)}
                theme={theme}
                aiConfig={aiConfig}
            />

            {
                (workflowExecution || mode === 'run') && (
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

            {/* 接口导入对话框 */}
            <ApiImportDialog
                open={showApiImport}
                onClose={() => setShowApiImport(false)}
                onInsert={handleApiInsert}
                existingActionIds={showApiImport ? actionRegistry.getAllActions().map((a) => a.id) : undefined}
            />

            {/* 场景化工作流模板中心 */}
            <TemplateGallery
                isOpen={showTemplateGallery}
                onClose={() => { setShowTemplateGallery(false); onboarding.takePendingIdentity(); }}
                onSandboxRun={handleTemplateSandboxRun}
                onSelectTemplate={(configuredDef) => {
                    // 经自助接入向导选了模板：保留向导按规范生成的名称与说明
                    const identity = onboarding.takePendingIdentity();
                    const next = identity
                        ? {
                            ...configuredDef,
                            name: identity.name,
                            description: identity.description || configuredDef.description,
                            ...(identity.ownerEmail ? { ownerEmail: identity.ownerEmail } : {}),
                        }
                        : configuredDef;
                    // R23：画布上已有流程时先确认（与「新建流程」的 R8 一致），替换后可以撤销
                    const current = useWorkflowStore.getState().getEditingWorkflowDef();
                    if ((current?.tasks?.length ?? 0) > 0) {
                        setPendingTemplate({ def: next, replacing: current?.name || '未命名流程' });
                        return;
                    }
                    applyTemplate(next);
                }}
            />
            {pendingTemplate && (
                <ConfirmDialog
                    message={`用模板创建的「${pendingTemplate.def.name}」会替换当前画布上的「${pendingTemplate.replacing}」。替换后可以用撤销（⌘Z / Ctrl+Z）找回。`}
                    confirmLabel="替换当前流程"
                    onConfirm={() => {
                        const { def } = pendingTemplate;
                        setPendingTemplate(null);
                        applyTemplate(def);
                    }}
                    onCancel={() => setPendingTemplate(null)}
                />
            )}

            {/* 自助接入：向导 / 申请上线弹窗与空画布引导 */}
            <OnboardingOverlays c={onboarding} />
            <OnboardingGuideOverlay c={onboarding} />
        </div >
    );
});

WorkflowIDE.displayName = 'WorkflowIDE';
