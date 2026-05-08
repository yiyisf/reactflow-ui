import { WorkflowDef, TaskDef } from '../types/conductor';
import { WorkflowDiff, WorkflowDiffRow, WorkflowPatchOp } from '../types/workflow';

/**
 * 将 WorkflowDiff 应用到 WorkflowDef，返回新的 def 以及用于撤销的逆操作 diff。
 * 不修改入参（深拷贝）。
 */
export function applyWorkflowDiff(
    def: WorkflowDef,
    diff: WorkflowDiff,
): { next: WorkflowDef; inverse: WorkflowDiff } {
    const wf: any = JSON.parse(JSON.stringify(def));

    if (diff.kind === 'replace' && diff.payload) {
        return {
            next: JSON.parse(JSON.stringify(diff.payload)),
            inverse: { kind: 'replace', summary: '撤销替换', rows: [], payload: def },
        };
    }

    if (diff.kind === 'add' && diff.payload) {
        return {
            next: JSON.parse(JSON.stringify(diff.payload)),
            inverse: { kind: 'replace', summary: '撤销生成', rows: [], payload: def },
        };
    }

    if (!diff.patch) {
        return { next: wf, inverse: { kind: diff.kind, summary: '（无变更）', rows: [] } };
    }

    const inverseOps: WorkflowPatchOp[] = [];
    const inverseRows: WorkflowDiffRow[] = [];

    for (const op of diff.patch) {
        if (op.op === 'patchTask') {
            const task = wf.tasks.find((t: TaskDef) => t.taskReferenceName === op.ref);
            if (!task) continue;
            const before: Record<string, any> = {};
            for (const k of Object.keys(op.set)) before[k] = (task as any)[k];
            Object.assign(task, op.set);
            inverseOps.push({ op: 'patchTask', ref: op.ref, set: before as Partial<TaskDef> });
            inverseRows.push({ kind: 'mod', desc: `还原 ${op.ref} 属性` });

        } else if (op.op === 'addEdge') {
            wf.edges = wf.edges ?? [];
            wf.edges.push({ from: op.from, to: op.to, label: op.label });
            inverseOps.push({ op: 'removeEdge', from: op.from, to: op.to });
            inverseRows.push({ kind: 'del', desc: `移除边 ${op.from} → ${op.to}` });

        } else if (op.op === 'removeEdge') {
            wf.edges = (wf.edges ?? []).filter(
                (e: any) => !(e.from === op.from && e.to === op.to),
            );
            inverseOps.push({ op: 'addEdge', from: op.from, to: op.to });
            inverseRows.push({ kind: 'add', desc: `恢复边 ${op.from} → ${op.to}` });

        } else if (op.op === 'addTask') {
            wf.tasks.push(op.task);
            wf.edges = wf.edges ?? [];
            if (op.removeEdges) {
                op.removeEdges.forEach((re) => {
                    wf.edges = wf.edges.filter((e: any) => !(e.from === re.from && e.to === re.to));
                });
            }
            if (op.extraEdges) op.extraEdges.forEach((e) => wf.edges.push(e));
            inverseOps.push({ op: 'removeTask', ref: op.task.taskReferenceName });
            inverseRows.push({ kind: 'del', desc: `移除 ${op.task.taskReferenceName}` });

        } else if (op.op === 'removeTask') {
            const idx = wf.tasks.findIndex((t: TaskDef) => t.taskReferenceName === op.ref);
            if (idx < 0) continue;
            const [removed] = wf.tasks.splice(idx, 1);
            const removedEdges = (wf.edges ?? []).filter(
                (e: any) => e.from === op.ref || e.to === op.ref,
            );
            wf.edges = (wf.edges ?? []).filter(
                (e: any) => e.from !== op.ref && e.to !== op.ref,
            );
            inverseOps.push({ op: 'addTask', task: removed, extraEdges: removedEdges });
            inverseRows.push({ kind: 'add', desc: `恢复 ${op.ref}` });

        } else if (op.op === 'insertAfter') {
            wf.tasks.push(op.task);
            wf.edges = wf.edges ?? [];
            const oldIdx = wf.edges.findIndex(
                (e: any) => e.from === op.after && e.to === op.edgeTo,
            );
            if (oldIdx >= 0) wf.edges.splice(oldIdx, 1);
            wf.edges.push({ from: op.after, to: op.task.taskReferenceName });
            wf.edges.push({ from: op.task.taskReferenceName, to: op.edgeTo });
            inverseOps.push({ op: 'removeTask', ref: op.task.taskReferenceName });
            inverseRows.push({ kind: 'del', desc: `移除 ${op.task.taskReferenceName}（恢复直连边）` });

        } else if (op.op === 'insertBefore') {
            wf.tasks.push(op.task);
            wf.edges = wf.edges ?? [];
            const incoming = wf.edges.filter((e: any) => e.to === op.before);
            wf.edges = wf.edges.filter((e: any) => e.to !== op.before);
            incoming.forEach((e: any) =>
                wf.edges.push({ from: e.from, to: op.task.taskReferenceName, label: e.label }),
            );
            wf.edges.push({ from: op.task.taskReferenceName, to: op.before });
            inverseOps.push({ op: 'removeTask', ref: op.task.taskReferenceName });
            inverseRows.push({ kind: 'del', desc: `移除 ${op.task.taskReferenceName}（恢复原有入边）` });
        }
    }

    return {
        next: wf as WorkflowDef,
        inverse: {
            kind: diff.kind,
            summary: `撤销：${diff.summary}`,
            rows: inverseRows,
            patch: inverseOps.reverse(),
        },
    };
}

/**
 * 从 AI 响应文本中提取 ```diff-json ... ``` 块并解析为 WorkflowDiff。
 * 找不到或解析失败时返回 null。
 */
export function parseDiffFromAIResponse(text: string): WorkflowDiff | null {
    const match = text.match(/```diff-json\n([\s\S]*?)\n```/);
    if (!match) return null;
    try {
        const parsed = JSON.parse(match[1]);
        if (!parsed.kind || !parsed.summary) return null;
        return parsed as WorkflowDiff;
    } catch {
        return null;
    }
}
