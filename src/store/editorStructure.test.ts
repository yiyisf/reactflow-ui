import { describe, it, expect, beforeEach } from 'vitest';
import useWorkflowStore from './workflowStore';
import { findTaskByRef } from '../parser/conductorGenerator';
import type { TaskDef, WorkflowDef } from '../types/conductor';

/**
 * v1.3.1 专业模式编辑器结构正确性（E1–E23）：通过 store 操作验证生成的 Conductor JSON。
 */

const store = () => useWorkflowStore.getState();
const temporal = () => useWorkflowStore.temporal.getState();
const simple = (ref: string, extra: Partial<TaskDef> = {}): TaskDef =>
    ({ name: ref, taskReferenceName: ref, type: 'SIMPLE', inputParameters: {}, ...extra }) as TaskDef;
const wf = (tasks: TaskDef[], extra: Partial<WorkflowDef> = {}): WorkflowDef =>
    ({ name: 'wf', version: 1, schemaVersion: 2, tasks, ...extra }) as WorkflowDef;
const def = () => store().workflowDef!;
const task = (ref: string) => findTaskByRef(def().tasks, ref)!;
const exported = () => JSON.parse(JSON.stringify(def())) as WorkflowDef;

const load = (w: WorkflowDef) => {
    store().setMode('edit');
    store().setWorkflow(w);
    store().selectTaskAction(null);
    useWorkflowStore.temporal.getState().clear();
};

const add = (type: string, ref: string, sourceId = 'a', edgeData: any = {}) =>
    store().addNode({ data: { label: `New ${type}`, taskReferenceName: ref, taskType: type } }, sourceId, '', '', edgeData);

describe('新建任务默认值 → 导出的 JSON 符合 Conductor 结构（E1–E4、E20）', () => {
    beforeEach(() => load(wf([simple('a')])));

    it('SWITCH 写 evaluatorType + expression，不写 DECISION 字段', () => {
        add('SWITCH', 'sw');
        const t = exported().tasks.find(x => x.taskReferenceName === 'sw')!;
        expect(t.evaluatorType).toBe('value-param');
        expect(t.expression).toBe('switchCaseValue');
        expect(t.inputParameters?.switchCaseValue).toBeDefined();
        expect(t.caseValueParam).toBeUndefined();
        expect(t.caseExpression).toBeUndefined();
        expect(Object.keys(t.decisionCases || {})).toEqual(['case1']);
        expect(t.defaultCase).toEqual([]);
    });

    it('DECISION 仍使用 caseValueParam', () => {
        add('DECISION', 'dc');
        const t = task('dc');
        expect(t.caseValueParam).toBe('case_param');
        expect(t.inputParameters?.case_param).toBeDefined();
    });

    it('INLINE 的 evaluatorType 在 inputParameters', () => {
        add('INLINE', 'inl');
        const t = exported().tasks.find(x => x.taskReferenceName === 'inl')! as any;
        expect(t.evaluatorType).toBeUndefined();
        expect(t.inputParameters.evaluatorType).toBe('graaljs');
        expect(typeof t.inputParameters.expression).toBe('string');
    });

    it('HTTP 默认值写在 inputParameters.http_request，新节点不报"缺少 uri"', () => {
        add('HTTP', 'http1');
        const t = exported().tasks.find(x => x.taskReferenceName === 'http1')! as any;
        expect(t.httpRequest).toBeUndefined();
        expect(t.inputParameters.http_request.uri).toMatch(/^https?:\/\//);
        expect(t.inputParameters.http_request.method).toBe('GET');
        expect(store().validationResults.errors.filter(e => e.ref === 'http1')).toHaveLength(0);
    });

    it('KAFKA_PUBLISH 字段在 inputParameters.kafka_request 下', () => {
        add('KAFKA_PUBLISH', 'kp');
        const inp = task('kp').inputParameters as any;
        expect(Object.keys(inp)).toEqual(['kafka_request']);
        expect(inp.kafka_request).toMatchObject({ topic: 'my_topic', bootStrapServers: 'localhost:9092' });
    });

    it('FORK_JOIN 自动配对 JOIN；FORK_JOIN_DYNAMIC 的参数键都在 inputParameters 中', () => {
        add('FORK_JOIN', 'fk');
        const tasks = def().tasks;
        const i = tasks.findIndex(t => t.taskReferenceName === 'fk');
        expect(tasks[i + 1].type).toBe('JOIN');
        expect(tasks[i].forkTasks).toEqual([[], []]);

        add('FORK_JOIN_DYNAMIC', 'dyn', 'fk_join');
        const dyn = task('dyn');
        const tasks2 = def().tasks;
        expect(tasks2[tasks2.findIndex(t => t.taskReferenceName === 'dyn') + 1].type).toBe('JOIN');
        expect(dyn.inputParameters?.[dyn.dynamicForkTasksParam!]).toBeDefined();
        expect(dyn.inputParameters?.[dyn.dynamicForkTasksInputParamName!]).toBeDefined();
        expect((dyn as any).forkTaskType).toBeUndefined();
    });

    it.each([
        ['SIMPLE'], ['HTTP'], ['INLINE'], ['JSON_JQ_TRANSFORM'], ['SET_VARIABLE'], ['SUB_WORKFLOW'], ['EVENT'], ['WAIT'],
        ['TERMINATE'], ['SWITCH'], ['DO_WHILE'], ['DYNAMIC'], ['HUMAN'], ['KAFKA_PUBLISH'], ['FORK_JOIN'], ['FORK_JOIN_DYNAMIC'],
    ])('%s 新建后没有结构性校验错误', (type: string) => {
        add(type, `t_${type.toLowerCase()}`);
        const errs = store().validationResults.errors.filter(e => e.ref.startsWith(`t_${type.toLowerCase()}`));
        expect(errs).toEqual([]);
    });
});

describe('E5 joinOn 只在结构变化时同步对应项', () => {
    const forkWf = () => wf([
        { name: 'fork', taskReferenceName: 'fork', type: 'FORK_JOIN', forkTasks: [[simple('a')], [simple('b')]] } as TaskDef,
        { name: 'join', taskReferenceName: 'join', type: 'JOIN', joinOn: ['a'] } as TaskDef,
        simple('after'),
    ]);
    beforeEach(() => load(forkWf()));

    it('加载时保留部分 joinOn', () => {
        expect(task('join').joinOn).toEqual(['a']);
    });

    it('无关编辑不改写 joinOn', () => {
        store().updateTask('after', 'description', 'x');
        store().updateTask('b', 'description', 'y');
        add('SIMPLE', 'tail', 'after');
        expect(task('join').joinOn).toEqual(['a']);
    });

    it('被等待分支的末尾任务变化时只替换该项；未等待的分支保持不等待', () => {
        add('SIMPLE', 'a2', 'a');
        expect(task('join').joinOn).toEqual(['a2']);
        add('SIMPLE', 'b2', 'b');
        expect(task('join').joinOn).toEqual(['a2']);
    });

    it('新增分支后向其中添加任务会追加到 joinOn；删除末尾任务回退到前一个', () => {
        store().addForkBranch('fork');
        add('SIMPLE', 'c', 'fork', { forkIndex: 2 });
        expect(task('join').joinOn).toEqual(['a', 'c']);
        add('SIMPLE', 'a2', 'a');
        store().removeNode('a2');
        expect(task('join').joinOn).toEqual(['a', 'c']);
    });

    it('引用名改名会同步 joinOn 而不是重算', () => {
        store().updateTask('a', 'taskReferenceName', 'a_renamed');
        expect(task('join').joinOn).toEqual(['a_renamed']);
    });
});

describe('E6 空 FORK 分支可插入', () => {
    beforeEach(() => {
        load(wf([simple('a')]));
        add('FORK_JOIN', 'fk');
    });

    it('占位节点是可点击的 plusNode，带分支序号', () => {
        const ph = store().nodes.find(n => n.id === 'fk_empty_branch_0')!;
        expect(ph.type).toBe('plusNode');
        expect(ph.data.parentRef).toBe('fk');
        expect(ph.data.edgeData).toEqual({ forkIndex: 0 });
    });

    it('点击占位节点插入到对应分支，并加入 joinOn', () => {
        const ph = store().nodes.find(n => n.id === 'fk_empty_branch_1')!;
        add('SIMPLE', 'in_b1', ph.data.parentRef, ph.data.edgeData);
        expect(task('fk').forkTasks![1].map(t => t.taskReferenceName)).toEqual(['in_b1']);
        expect(task('fk_join').joinOn).toEqual(['in_b1']);
    });

    it('占位 → JOIN 边上的 "+" 也插入到该分支', () => {
        const edge = store().edges.find(e => e.source === 'fk_empty_branch_0')!;
        expect(edge.data).toMatchObject({ forkIndex: 0, branchParentRef: 'fk' });
        add('SIMPLE', 'in_b0', edge.source, edge.data);
        expect(task('fk').forkTasks![0].map(t => t.taskReferenceName)).toEqual(['in_b0']);
    });
});

describe('E7 引用名校验', () => {
    beforeEach(() => load(wf([simple('a'), simple('b', { inputParameters: { x: '${a.output.v}' } })])));

    it('改成已存在的引用名被拒绝，定义不变', () => {
        const before = JSON.stringify(def());
        store().updateTask('a', 'taskReferenceName', 'b');
        expect(JSON.stringify(def())).toBe(before);
    });

    it('非法字符和保留字被拒绝', () => {
        store().updateTask('a', 'taskReferenceName', 'bad ref');
        store().updateTask('a', 'taskReferenceName', 'workflow');
        expect(task('a')).toBeTruthy();
    });

    it('合法改名会级联更新表达式', () => {
        store().updateTask('a', 'taskReferenceName', 'a_new');
        expect(task('b').inputParameters!.x).toBe('${a_new.output.v}');
    });
});

describe('E8 / E15 粘贴', () => {
    it('选中 FORK 时粘贴到配对 JOIN 之后', () => {
        load(wf([
            { name: 'fork', taskReferenceName: 'fork', type: 'FORK_JOIN', forkTasks: [[simple('a')], [simple('b')]] } as TaskDef,
            { name: 'join', taskReferenceName: 'join', type: 'JOIN', joinOn: ['a', 'b'] } as TaskDef,
            simple('z'),
        ]));
        store().selectTaskAction(task('fork'));
        store().pasteTask(simple('p'));
        const refs = def().tasks.map(t => t.taskReferenceName);
        expect(refs[0]).toBe('fork');
        expect(refs[1]).toBe('join');
        expect(refs[2]).toMatch(/^p_copy_/);
    });

    it('粘贴容器任务时子树内部引用一起改名，外部引用不变', () => {
        load(wf([simple('outside'), simple('anchor')]));
        const loop: TaskDef = {
            name: 'loop', taskReferenceName: 'loop', type: 'DO_WHILE',
            loopCondition: "if ($.loop['iteration'] < 3) { true; } else { false; }",
            loopOver: [
                simple('step1', { inputParameters: { v: '${outside.output.x}' } }),
                simple('step2', { inputParameters: { prev: '${step1.output.result}' } }),
            ],
        } as TaskDef;
        store().selectTaskAction(task('anchor'));
        store().pasteTask(loop);
        const pasted = def().tasks[2];
        expect(pasted.taskReferenceName).toMatch(/^loop_copy_/);
        expect(pasted.loopCondition).toContain(`$.${pasted.taskReferenceName}[`);
        const [s1, s2] = pasted.loopOver!;
        expect(s1.taskReferenceName).toMatch(/^step1_copy_/);
        expect(s1.inputParameters!.v).toBe('${outside.output.x}');
        expect(s2.inputParameters!.prev).toBe(`\${${s1.taskReferenceName}.output.result}`);
        expect(store().validationResults.errors).toEqual([]);
    });

    it('粘贴 FORK_JOIN_DYNAMIC 时补上配对 JOIN', () => {
        load(wf([simple('a')]));
        store().selectTaskAction(task('a'));
        store().pasteTask({ name: 'dyn', taskReferenceName: 'dyn', type: 'FORK_JOIN_DYNAMIC', dynamicForkTasksParam: 'dt', dynamicForkTasksInputParamName: 'di', inputParameters: { dt: [], di: {} } } as TaskDef);
        const tasks = def().tasks;
        expect(tasks[1].type).toBe('FORK_JOIN_DYNAMIC');
        expect(tasks[2].type).toBe('JOIN');
    });
});

describe('E9 撤销快照只含流程数据', () => {
    beforeEach(() => load(wf([simple('a')])));

    it('撤销不会改回主题 / 布局方向 / 锁定状态', () => {
        store().setTheme('light');
        store().updateTask('a', 'description', 'changed');
        store().setTheme('dark');
        store().setNodesLocked(false);
        temporal().undo();
        expect(task('a').description).toBeUndefined();
        expect(store().theme).toBe('dark');
        expect(store().nodesLocked).toBe(false);
        expect(store().mode).toBe('edit');
    });
});

describe('P2 文本编辑撤销合并', () => {
    beforeEach(() => load(wf([simple('a')])));

    it('同一字段的连续输入只记一条撤销', () => {
        ['h', 'he', 'hel', 'hello'].forEach(v => store().updateTask('a', 'description', v));
        expect(temporal().pastStates.length).toBe(1);
        temporal().undo();
        expect(task('a').description).toBeUndefined();
    });

    it('换一个字段就是新的撤销记录', () => {
        store().updateTask('a', 'description', 'x');
        store().updateTask('a', 'name', 'renamed');
        expect(temporal().pastStates.length).toBe(2);
    });
});

describe('E12 删除 / 撤销后清理选中', () => {
    beforeEach(() => load(wf([simple('a'), simple('b')])));

    it('删除选中任务后关闭面板', () => {
        store().selectTaskAction(task('b'));
        store().removeNode('b');
        expect(store().selectedTask).toBeNull();
        expect(store().isDetailPanelOpen).toBe(false);
    });

    it('撤销掉新增的任务后清空选中', () => {
        add('SIMPLE', 'c', 'b');
        store().selectTaskAction(task('c'));
        temporal().undo();
        expect(store().selectedTask).toBeNull();
    });
});

describe('E14 分支重命名', () => {
    beforeEach(() => load(wf([
        { name: 'sw', taskReferenceName: 'sw', type: 'SWITCH', evaluatorType: 'value-param', expression: 'k', inputParameters: { k: '${workflow.input.k}' }, decisionCases: { a: [simple('in_a')], b: [simple('in_b')] }, defaultCase: [] } as TaskDef,
    ])));

    it('改成已存在的分支名被拒绝，原分支保留', () => {
        expect(store().renameDecisionBranch('sw', 'a', 'b')).toBe(false);
        expect(task('sw').decisionCases!.a.map(t => t.taskReferenceName)).toEqual(['in_a']);
        expect(task('sw').decisionCases!.b.map(t => t.taskReferenceName)).toEqual(['in_b']);
    });

    it('保留字 default 被拒绝；合法改名保持分支顺序', () => {
        expect(store().renameDecisionBranch('sw', 'a', 'default')).toBe(false);
        expect(store().renameDecisionBranch('sw', 'a', 'c')).toBe(true);
        expect(Object.keys(task('sw').decisionCases!)).toEqual(['c', 'b']);
    });
});

describe('E16 在 SWITCH 之后（同层）插入', () => {
    it('SWITCH 出口边带 exitOf，插入位置在 SWITCH 之后', () => {
        load(wf([
            { name: 'sw', taskReferenceName: 'sw', type: 'SWITCH', evaluatorType: 'value-param', expression: 'k', inputParameters: { k: '1' }, decisionCases: { a: [simple('in_a')] }, defaultCase: [] } as TaskDef,
            simple('next'),
        ]));
        const exit = store().edges.find(e => e.source === 'in_a' && e.target === 'next')!;
        expect(exit.data).toEqual({ exitOf: 'sw' });
        add('SIMPLE', 'mid', exit.source, exit.data);
        expect(def().tasks.map(t => t.taskReferenceName)).toEqual(['sw', 'mid', 'next']);
        expect(task('sw').decisionCases!.a.map(t => t.taskReferenceName)).toEqual(['in_a']);
    });
});

describe('E23 JSON 面板整体替换任务', () => {
    beforeEach(() => load(wf([simple('a', { description: 'old', optional: true } as any), simple('b')])));

    it('删掉的键在定义里也被删除', () => {
        const err = store().replaceTask('a', { name: 'a', taskReferenceName: 'a', type: 'SIMPLE', inputParameters: {} } as TaskDef);
        expect(err).toBeNull();
        expect(task('a').description).toBeUndefined();
        expect(task('a').optional).toBeUndefined();
    });

    it('引用名冲突时返回原因且不修改', () => {
        const err = store().replaceTask('a', { name: 'a', taskReferenceName: 'b', type: 'SIMPLE' } as TaskDef);
        expect(err).toContain('已被其他任务使用');
        expect(task('a').description).toBe('old');
    });
});

describe('导入 → 导出逐字段一致（真实 Conductor 样例）', () => {
    const sample = (): WorkflowDef => ({
        name: 'order_flow',
        description: 'realistic sample',
        version: 3,
        schemaVersion: 2,
        ownerEmail: 'ops@example.com',
        inputParameters: ['orderId', 'items'],
        outputParameters: { status: '${route.output.selectedCase}' },
        timeoutPolicy: 'ALERT_ONLY',
        timeoutSeconds: 0,
        restartable: true,
        tasks: [
            {
                name: 'route', taskReferenceName: 'route', type: 'SWITCH', evaluatorType: 'javascript',
                expression: '$.amount > 100 ? "big" : "small"', inputParameters: { amount: '${workflow.input.amount}' },
                decisionCases: {
                    big: [{ name: 'calc', taskReferenceName: 'calc', type: 'INLINE', inputParameters: { evaluatorType: 'graaljs', expression: '(function(){ return 1; })()' } }],
                    small: [],
                },
                defaultCase: [],
            },
            {
                name: 'call', taskReferenceName: 'call', type: 'HTTP',
                inputParameters: { http_request: { uri: 'https://api.example.com/orders/${workflow.input.orderId}', method: 'POST', body: { id: '${workflow.input.orderId}' }, connectionTimeOut: 3000, readTimeOut: 3000, accept: 'application/json', contentType: 'application/json' } },
                retryCount: 2,
                taskDefinition: { name: 'call', timeoutSeconds: 60, responseTimeoutSeconds: 60, retryLogic: 'EXPONENTIAL_BACKOFF' },
            },
            {
                name: 'publish', taskReferenceName: 'publish', type: 'KAFKA_PUBLISH',
                inputParameters: { kafka_request: { topic: 'orders', value: '${call.output.response.body}', bootStrapServers: 'kafka:9092', key: '${workflow.input.orderId}', headers: { 'x-src': 'cmaster' } } },
            },
            {
                name: 'fan', taskReferenceName: 'fan', type: 'FORK_JOIN',
                forkTasks: [[{ name: 'w1', taskReferenceName: 'w1', type: 'SIMPLE' }], [{ name: 'w2', taskReferenceName: 'w2', type: 'SIMPLE', optional: true }]],
            },
            { name: 'fan_join', taskReferenceName: 'fan_join', type: 'JOIN', joinOn: ['w1'] },
            {
                name: 'loop', taskReferenceName: 'loop', type: 'DO_WHILE',
                loopCondition: "if ($.loop['iteration'] < $.max) { true; } else { false; }",
                inputParameters: { max: 3 }, keepLastN: 2,
                loopOver: [{ name: 'poll', taskReferenceName: 'poll', type: 'WAIT', inputParameters: { duration: '10s' } }],
            },
            {
                name: 'dyn', taskReferenceName: 'dyn', type: 'FORK_JOIN_DYNAMIC',
                dynamicForkTasksParam: 'dynamicTasks', dynamicForkTasksInputParamName: 'dynamicTasksInput',
                inputParameters: { dynamicTasks: '${workflow.input.items}', dynamicTasksInput: '${workflow.input.itemsInput}' },
            },
            { name: 'dyn_join', taskReferenceName: 'dyn_join', type: 'JOIN' },
            { name: 'done', taskReferenceName: 'done', type: 'TERMINATE', inputParameters: { terminationStatus: 'TERMINATED', workflowOutput: {} } },
        ] as TaskDef[],
    } as WorkflowDef);

    it('加载后导出与原样一致', () => {
        load(sample());
        const out = exported();
        // 部分 joinOn、内嵌 taskDefinition、TERMINATED 等字段逐一保留
        expect(out).toEqual(sample());
    });

    it('做一次无关编辑后，其它任务逐字段不变', () => {
        load(sample());
        store().updateTask('done', 'description', '终止');
        const out = exported();
        const expected = sample();
        (expected.tasks[expected.tasks.length - 1] as any).description = '终止';
        expect(out).toEqual(expected);
    });

    it('真实样例没有校验错误（含 TERMINATED、部分 joinOn）', () => {
        load(sample());
        expect(store().validationResults.errors).toEqual([]);
    });

    it('旧版顶层字段在导入时迁移到 inputParameters（INLINE evaluatorType、动态并行简化字段）', () => {
        load(wf([
            { name: 'i', taskReferenceName: 'i', type: 'INLINE', evaluatorType: 'javascript', inputParameters: { expression: '1' } } as TaskDef,
            { name: 'd', taskReferenceName: 'd', type: 'FORK_JOIN_DYNAMIC', forkTaskType: 'HTTP', forkTaskInputs: '${workflow.input.list}' } as any,
            { name: 'dj', taskReferenceName: 'dj', type: 'JOIN' } as TaskDef,
        ]));
        const out = exported() as any;
        expect(out.tasks[0].evaluatorType).toBeUndefined();
        expect(out.tasks[0].inputParameters).toEqual({ expression: '1', evaluatorType: 'javascript' });
        expect(out.tasks[1].forkTaskType).toBeUndefined();
        expect(out.tasks[1].inputParameters).toEqual({ forkTaskType: 'HTTP', forkTaskInputs: '${workflow.input.list}' });
    });
});
