import React, { useEffect } from 'react';
import { ReactFlowProvider } from 'reactflow';
import WorkflowDesigner from './components/WorkflowDesigner';
import TaskDetailPanel from './components/TaskDetailPanel';
import HealthCheckPanel from './components/HealthCheckPanel';
import ExecutionTaskPanel from './components/ExecutionTaskPanel';
import useWorkflowStore from './store/workflowStore';
import { ThemeMode, ThemeColor, LayoutDirection } from './types/workflow';
import { WorkflowDef } from './types/conductor';
import './styles/tokens.css';
import './styles/executionStyles.css';

export interface WorkflowIDEProps {
    workflowDef?: WorkflowDef;
    readOnly?: boolean;
    theme?: ThemeMode;
    themeColor?: ThemeColor;
    layoutDirection?: LayoutDirection;
    searchQuery?: string;
    workflowExecution?: any; // Workflow Instance or Task List
    onSave?: (def: WorkflowDef) => void;
    onWorkflowChange?: (def: WorkflowDef) => void;
    height?: string | number;
}

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
        validationResults,
        edgeType,
        importExecutionJSON,
        setMode
    } = useWorkflowStore();

    const [isDetailPanelOpen, setIsDetailPanelOpen] = React.useState(false);
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
        }
    }, [workflowDef, setWorkflow]);

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
                    <button
                        onClick={() => setShowHealthCheck(!showHealthCheck)}
                        style={{
                            background: 'var(--bg-tertiary)',
                            border: '1px solid var(--border-primary)',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            color: 'var(--text-primary)'
                        }}
                    >
                        🩺 {(validationResults?.errors?.length || 0) > 0 ? 'Errors' : 'Check'}
                    </button>
                </div>
            </div>

            <TaskDetailPanel
                task={isDetailPanelOpen ? selectedTask : null}
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

            {workflowExecution && (
                <ExecutionTaskPanel />
            )}
        </div>
    );
};
