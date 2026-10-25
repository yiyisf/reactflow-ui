import type { RepairAction } from '../../store/aiStore';

/** 修复动作可用的能力：集成方提供了哪些 executionActions 回调、AI 是否允许修改流程定义 */
export interface RepairCapabilities {
    onRerunFromTask?: unknown;
    onSkipTask?: unknown;
    onRetry?: unknown;
    /** modify_def 需要切到编辑模式并让 AI 生成变更方案 */
    canEditDefinition?: boolean;
}

/**
 * 每个修复动作只看它自己需要的那个回调：只提供了 onRetry 时，"跳过"必须是不可执行的，
 * 不能点击后什么都不做却仍上报 repair:executed 并开始轮询。
 */
export function isRepairActionExecutable(action: RepairAction, caps: RepairCapabilities): boolean {
    switch (action.type) {
        case 'rerun_from':
            return typeof caps.onRerunFromTask === 'function' && !!action.taskRef;
        case 'skip':
            return typeof caps.onSkipTask === 'function' && !!action.taskRef;
        case 'retry_workflow':
            return typeof caps.onRetry === 'function';
        case 'modify_def':
            return caps.canEditDefinition === true;
        default:
            return false;
    }
}

/** 不可执行时告诉用户原因（按钮 title 与卡片提示） */
export function repairActionUnavailableReason(action: RepairAction, caps: RepairCapabilities): string {
    if (action.type === 'modify_def') return 'AI 当前没有修改工作流的权限，请参考诊断手动修改';
    if ((action.type === 'rerun_from' || action.type === 'skip') && !action.taskRef) return '修复方案没有指明目标任务，无法执行';
    void caps;
    return '集成方没有提供该操作的执行接口，请参考诊断手动处理';
}
