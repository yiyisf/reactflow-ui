/**
 * CanvasPreview — 画布预览组件
 *
 * 包裹现有的 WorkflowDesigner，作为右侧预览区。
 * 后续会增加 Ghost 节点叠加层。
 */

import React from 'react';
import WorkflowDesigner from '../WorkflowDesigner';
import TaskDetailPanel from '../TaskDetailPanel';
import ExecutionTaskPanel from '../ExecutionTaskPanel';
import useWorkflowStore from '../../store/workflowStore';
import { useShallow } from 'zustand/react/shallow';
import type { ExecutionActions } from '../../types/workflow';
import type { WorkflowDef } from '../../types/conductor';

interface CanvasPreviewProps {
    onSave?: (def: WorkflowDef) => void;
    onRequestImport?: () => void;
    executionActions?: ExecutionActions;
}

const CanvasPreview: React.FC<CanvasPreviewProps> = ({
    onSave,
    onRequestImport,
    executionActions,
}) => {
    const { mode, theme, selectedTask, isDetailPanelOpen, setIsDetailPanelOpen, selectTaskAction, setSelectedTask } = useWorkflowStore(useShallow((s) => ({
            mode: s.mode,
            theme: s.theme,
            selectedTask: s.selectedTask,
            isDetailPanelOpen: s.isDetailPanelOpen,
            setIsDetailPanelOpen: s.setIsDetailPanelOpen,
            selectTaskAction: s.selectTaskAction,
            setSelectedTask: s.setSelectedTask,
        })));

    const handleNodeClick = (task: any) => {
        if (mode !== 'run') {
            selectTaskAction(task, true);
        } else {
            setSelectedTask(task);
        }
    };

    return (
        <div className="ai-canvas-area" style={{ position: 'relative' }}>
            <WorkflowDesigner
                onNodeClick={handleNodeClick}
                nodesLocked={mode === 'run'}
                onSave={onSave}
                onRequestImport={onRequestImport}
                executionActions={executionActions}
            />
            <TaskDetailPanel
                task={selectedTask}
                isOpen={isDetailPanelOpen && mode !== 'run'}
                onClose={() => setIsDetailPanelOpen(false)}
                theme={theme}
            />
            {mode === 'run' && (
                <ExecutionTaskPanel executionActions={executionActions} />
            )}
        </div>
    );
};

export default CanvasPreview;
