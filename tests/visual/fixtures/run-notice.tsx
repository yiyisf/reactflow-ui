/**
 * 视觉测试夹具：R19「将运行已保存的版本」提示。
 * demo（app.html）不接执行回调，看不到这段提示；这里挂载真实组件并接上执行回调。
 *   ?ide=classic|ai     WorkflowIDE 的执行验证面板 / AiWorkflowIDE 的运行卡片
 *   ?theme=dark|light
 *   ?edited=1           加载后改一处属性，制造未保存的修改
 *   ?inputs=1           声明一个必填的数字入参 qty（R22），发起的执行记在 window.__triggered
 * classic 会直接打开执行验证面板；ai 由测试点击「执行」打开运行卡片。
 */
import { createRoot } from 'react-dom/client';
import '../../../src/index.css';
import { WorkflowIDE } from '../../../src/WorkflowIDE';
import { AiWorkflowIDE } from '../../../src/AiWorkflowIDE';
import useWorkflowStore from '../../../src/store/workflowStore';
import type { WorkflowDef } from '../../../src/types/conductor';

const params = new URLSearchParams(location.search);
const ide = params.get('ide') === 'ai' ? 'ai' : 'classic';
const theme = params.get('theme') === 'light' ? 'light' : 'dark';

const SAVED: WorkflowDef = {
    name: 'order_fulfillment',
    version: 3,
    schemaVersion: 2,
    tasks: [
        { name: 'reserve_stock', taskReferenceName: 'reserve_stock', type: 'SIMPLE', inputParameters: {} },
        { name: 'notify_customer', taskReferenceName: 'notify_customer', type: 'SIMPLE', inputParameters: {} },
    ],
} as WorkflowDef;
if (params.get('inputs') === '1') {
    Object.assign(SAVED, {
        inputParameters: ['qty'],
        inputSchema: { name: 'order_fulfillment_input', type: 'JSON', data: { type: 'object', properties: { qty: { type: 'integer' } }, required: ['qty'] } },
    });
}

const triggered: unknown[] = [];
(window as unknown as { __triggered: unknown[] }).__triggered = triggered;
const trigger = async (_name: string, _version: number, input: Record<string, unknown>) => {
    triggered.push(input);
    return { workflowId: 'fixture-run' };
};
const poll = async () => null;

createRoot(document.getElementById('root')!).render(
    ide === 'ai'
        ? <AiWorkflowIDE workflowDef={SAVED} theme={theme} themeColor="orange" onTriggerExecution={trigger} onPollExecution={poll} onSave={() => {}} />
        : <WorkflowIDE workflowDef={SAVED} theme={theme} themeColor="orange" uiMode="pro" onTriggerExecution={trigger} onPollExecution={poll} onSave={() => {}} />,
);

// 等宿主定义加载进 store 再制造修改，避免被加载覆盖
const unsub = useWorkflowStore.subscribe((s) => {
    if (s.workflowDef?.name !== SAVED.name) return;
    unsub();
    queueMicrotask(() => {
        if (params.get('edited') === '1') {
            useWorkflowStore.getState().updateWorkflowProperties({ description: '本地未保存的修改' });
        }
        if (ide === 'classic') useWorkflowStore.getState().setShowRunPanel(true);
        document.documentElement.dataset.fixtureReady = '1';
    });
});
