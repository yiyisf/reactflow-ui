/**
 * 视觉测试夹具：沙箱配置台（批次 2：S14 快速路由、U3 模拟状态徽标、U4 标题与启动按钮），
 * 也用于模板中心测试（批次 4：R23 替换确认、U1 试跑结果、U2 模板数）。
 *   ?theme=dark|light
 * 预置一条「可选 HTTP 任务模拟失败」的配置（sessionStorage，配置台打开时读取），测试点击工具栏按钮打开配置台。
 */
import { createRoot } from 'react-dom/client';
import '../../../src/index.css';
import { WorkflowIDE } from '../../../src/WorkflowIDE';
import type { WorkflowDef } from '../../../src/types/conductor';
import useWorkflowStore from '../../../src/store/workflowStore';

// 模板中心测试（template-gallery.spec.ts）用它检查画布上的定义与撤销
Object.assign(window, { __store: useWorkflowStore });

const theme = new URLSearchParams(location.search).get('theme') === 'light' ? 'light' : 'dark';

const DEF: WorkflowDef = {
    name: 'sandbox_fixture',
    version: 1,
    schemaVersion: 2,
    inputParameters: ['customerLevel', 'qty'],
    inputSchema: {
        name: 'sandbox_fixture_input',
        type: 'JSON',
        data: { type: 'object', properties: { customerLevel: { type: 'string', examples: ['vip'] }, qty: { type: 'integer' } } },
    },
    tasks: [
        { name: 'reserve_stock', taskReferenceName: 'reserve_stock', type: 'HTTP', optional: true, inputParameters: { http_request: { uri: 'https://api.internal/stock', method: 'POST' } } },
        {
            name: 'route_level', taskReferenceName: 'route_level', type: 'SWITCH', evaluatorType: 'value-param', expression: 'level',
            inputParameters: { level: '${workflow.input.customerLevel}' },
            decisionCases: {
                vip: [{ name: 'vip_gift', taskReferenceName: 'vip_gift', type: 'NOOP' }],
                normal: [{ name: 'normal_notice', taskReferenceName: 'normal_notice', type: 'NOOP' }],
            },
            defaultCase: [],
        },
    ],
} as WorkflowDef;

try {
    sessionStorage.setItem('sandbox_mock_cfg_sandbox_fixture', JSON.stringify({
        taskDrafts: {
            reserve_stock: { enabled: true, status: 'FAILED', durationMs: '', forceCase: '', reasonForIncompletion: '库存服务 503', outputJsonText: '{}' },
            route_level: { enabled: true, status: 'TIMED_OUT', durationMs: '', forceCase: '', reasonForIncompletion: '', outputJsonText: '{}' },
        },
        loopSafetyLimit: 20,
    }));
} catch {
    /* sessionStorage 不可用时配置台按默认值打开 */
}

createRoot(document.getElementById('root')!).render(
    <WorkflowIDE workflowDef={DEF} theme={theme} themeColor="orange" uiMode="pro" onSave={() => {}} />,
);
