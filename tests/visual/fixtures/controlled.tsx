/**
 * 测试夹具：R21 受控用法。宿主用 onWorkflowChange 回写 workflowDef prop（最常见的 React 受控写法）。
 * window.__store：画布 store；window.__hostDef：宿主当前持有的定义；window.__loadFlow(def)：宿主换一个流程。
 */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../src/index.css';
import { WorkflowIDE } from '../../../src/WorkflowIDE';
import useWorkflowStore from '../../../src/store/workflowStore';
import type { WorkflowDef } from '../../../src/types/conductor';

const INITIAL = {
    name: 'controlled_flow',
    version: 1,
    schemaVersion: 2,
    tasks: [{ name: 'a', taskReferenceName: 'a', type: 'NOOP' }],
} as WorkflowDef;

const w = window as unknown as Record<string, unknown>;
w.__store = useWorkflowStore;

function Host() {
    const [def, setDef] = useState<WorkflowDef>(INITIAL);
    w.__hostDef = def;
    w.__loadFlow = setDef;
    return <WorkflowIDE workflowDef={def} onWorkflowChange={setDef} uiMode="pro" theme="dark" />;
}

createRoot(document.getElementById('root')!).render(<Host />);
document.documentElement.dataset.fixtureReady = '1';
