/**
 * CanvasPreview — 画布预览组件
 *
 * 包裹现有的 WorkflowDesigner，作为右侧预览区。
 * 后续会增加 Ghost 节点叠加层。
 */

import React from 'react';
import WorkflowDesigner from '../WorkflowDesigner';
import type { ExecutionActions } from '../../types/workflow';

interface CanvasPreviewProps {
    onSave?: (def: any) => void;
    onRequestImport?: () => void;
    executionActions?: ExecutionActions;
}

const CanvasPreview: React.FC<CanvasPreviewProps> = ({
    onSave,
    onRequestImport,
    executionActions,
}) => {
    return (
        <div className="ai-canvas-area">
            <WorkflowDesigner
                onSave={onSave}
                onRequestImport={onRequestImport}
                executionActions={executionActions}
            />
        </div>
    );
};

export default CanvasPreview;
