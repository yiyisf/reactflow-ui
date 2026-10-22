/**
 * Demo 专用：模拟编排治理服务（流程库）。不从包入口（src/index.ts、src/ai.ts）导出。
 */
export { createMockGovernanceProvider, createMockServerError } from './mockGovernanceProvider';
export type { MockGovernanceProvider, MockGovernanceProviderOptions } from './mockGovernanceProvider';
export { DEMO_DOMAINS, DEMO_WORKFLOW_NAMES, createDemoLibraryData } from './libraryData';
