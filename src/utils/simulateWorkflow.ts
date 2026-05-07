/**
 * 对工作流任务进行拓扑排序，返回按并行波浪分组的执行顺序。
 * 每一波内的任务可以并行执行，波与波之间有依赖关系。
 */
export function buildExecutionWaves(
    taskRefs: string[],
    edges: Array<{ source: string; target: string }>,
): string[][] {
    const refSet = new Set(taskRefs);
    const inDegree: Record<string, number> = {};
    taskRefs.forEach((r) => (inDegree[r] = 0));

    edges.forEach((e) => {
        if (refSet.has(e.source) && refSet.has(e.target)) {
            inDegree[e.target] = (inDegree[e.target] ?? 0) + 1;
        }
    });

    const waves: string[][] = [];
    let queue = taskRefs.filter((r) => inDegree[r] === 0);
    const localDeg = { ...inDegree };

    while (queue.length > 0) {
        waves.push([...queue]);
        const next: string[] = [];
        queue.forEach((r) => {
            edges.forEach((e) => {
                if (e.source === r && refSet.has(e.target)) {
                    localDeg[e.target]--;
                    if (localDeg[e.target] === 0) next.push(e.target);
                }
            });
        });
        queue = next;
    }

    return waves;
}
