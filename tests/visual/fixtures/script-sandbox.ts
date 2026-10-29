/**
 * 测试夹具：S10 脚本隔离。把沙箱默认的脚本求值器和异步沙箱挂到 window 上，测试在真实浏览器里驱动它们。
 */
import { createWorkerScriptEvaluator } from '../../../src/utils/sandbox/scriptRunner';
import { executeLocalSandboxDryRunAsync } from '../../../src/utils/localSandboxEngine';

const evaluator = createWorkerScriptEvaluator({ timeoutMs: 1500 });
Object.assign(window, { __evaluate: evaluator.evaluate, __runSandbox: executeLocalSandboxDryRunAsync });
document.documentElement.dataset.fixtureReady = '1';
