import React from 'react';
import { TriangleAlert } from 'lucide-react';
import './UnsavedRunNotice.css';

export interface UnsavedRunNoticeProps {
    /** 将要运行的已保存版本的名称 */
    workflowName: string;
    /** 将要运行的已保存版本号 */
    version?: number;
    className?: string;
}

/**
 * R19：执行按「名称 + 版本」启动服务端已保存的定义，画布上未保存的修改不会参与运行。
 * 执行验证面板（WorkflowIDE）和 AI 运行卡片（AiWorkflowIDE）共用这段提示。
 * 是否显示由调用方根据 store.hasUnsavedChanges() 决定。
 */
const UnsavedRunNotice: React.FC<UnsavedRunNoticeProps> = ({ workflowName, version, className }) => (
    <p className={`cm-unsaved-run-notice${className ? ` ${className}` : ''}`} role="status" data-testid="unsaved-run-notice">
        <TriangleAlert size={14} strokeWidth={1.75} aria-hidden="true" />
        <span>
            画布有未保存的修改。将运行已保存的版本（<code>{workflowName}</code> v{version ?? 1}），
            这些修改不会参与本次执行；要验证修改，先保存再执行。
        </span>
    </p>
);

export default UnsavedRunNotice;
