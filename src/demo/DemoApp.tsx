import { useState, useCallback, useRef, useEffect } from 'react';
import { Bot, TriangleAlert, X } from 'lucide-react';
import { WorkflowIDE } from '../WorkflowIDE';
import { AiWorkflowIDE } from '../AiWorkflowIDE';

import type { ViewMode } from '../types/workflow';
import type { WorkflowDef } from '../types/conductor';
import type { WorkflowLevel } from '../types/workflowLibrary';
import { createMockGovernanceProvider, createMockOnboardingProvider } from './mockGovernance';
import type { MockOnboardingProvider } from './mockGovernance';
import useWorkflowStore from '../store/workflowStore';
import { createMockProviders } from './mockProviders';
import { WorkflowIdeProvider } from '../providers/WorkflowIdeProvider';
import { useTheme } from '../hooks/useTheme';
import { DemoHeader } from './header/DemoHeader';
import '../styles/tokens.css';
import './DemoApp.css';
import './header/DemoHeader.css';
import '../styles/executionStyles.css';

function DemoApp() {
  const { mode: themeMode, color: themeColor } = useTheme();

  // Local state for the demo wrapper
  const [workflowJson, setWorkflowJson] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [useNewAiMode, setUseNewAiMode] = useState(false);
  const [uiMode, setUiMode] = useState<'pro' | 'business'>('business');
  const [allowOperations, setAllowOperations] = useState(true);

  // 扩展点：演示用的模拟实现（流程库 + 控制台埋点），经 WorkflowIdeProvider 一次配置、两个 IDE 共用。
  // 流程库为带网络延迟、可模拟加载失败的模拟治理服务；更换 library 实例即触发目录重新加载。
  const [providers, setProviders] = useState(() => createMockProviders());
  // 当前编辑的流程层级：用于演示分层调用规则（空 = 不限）
  const [workflowLevel, setWorkflowLevel] = useState<WorkflowLevel | ''>('');

  // 是否处于「已模拟流程库加载失败」状态（仅用于演示设置按钮上的提示点；重新加载后清除）
  const [libraryFailed, setLibraryFailed] = useState(false);

  const handleLibraryAction = useCallback((action: 'reload' | 'fail') => {
    const next = createMockGovernanceProvider();
    // 让第一次目录加载失败：界面显示「加载失败，点击重试」，点击重试后恢复正常
    if (action === 'fail') next.failNext();
    setLibraryFailed(action === 'fail');
    setProviders((prev) => ({ ...prev, library: next }));
  }, []);

  // 自助接入演示：切换环境（TEST 开放试用 / PROD 不开放）、重置产品（看到空画布的「开始试用」引导）
  // provider 实例变化会让 IDE 重新加载自助接入信息；切环境时沿用当前产品
  const [demoEnv, setDemoEnv] = useState<'TEST' | 'PROD'>('TEST');
  const handleOnboardingEnv = useCallback((env: 'TEST' | 'PROD') => {
    setDemoEnv(env);
    setProviders((prev) => {
      const cur = prev.onboarding as MockOnboardingProvider | undefined;
      return { ...prev, onboarding: createMockOnboardingProvider({ env, initialProducts: cur?.products }) };
    });
  }, []);
  const handleResetProducts = useCallback(() => {
    setProviders((prev) => ({ ...prev, onboarding: createMockOnboardingProvider({ env: demoEnv, initialProducts: [] }) }));
    // 同时清空画布：引导卡片只在空画布上出现
    setWorkflowJson(null);
    setCurrentDef(null);
    setWorkflowExecution(null);
    useWorkflowStore.setState({ workflowDef: null, nodes: [], edges: [] });
  }, [demoEnv]);

  // 视图模式（运行态由 WorkflowIDE 内部强制 developer，此处仅控制定义态）
  const [viewMode] = useState<ViewMode>('developer');

  // AI config from localStorage (editable in demo header)
  const [aiConfig, setAiConfig] = useState(() => ({
    apiKey: localStorage.getItem('AI_API_KEY') || '',
    baseUrl: localStorage.getItem('AI_BASE_URL') || '',
    model: localStorage.getItem('AI_MODEL') || '',
  }));
  const [showAiConfig, setShowAiConfig] = useState(false);
  const [aiDraft, setAiDraft] = useState(aiConfig);

  // Handle Escape key to close modal
  useEffect(() => {
    if (!showAiConfig) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowAiConfig(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showAiConfig]);

  const saveAiConfig = () => {
    setAiConfig(aiDraft);
    localStorage.setItem('AI_API_KEY', aiDraft.apiKey);
    localStorage.setItem('AI_BASE_URL', aiDraft.baseUrl);
    localStorage.setItem('AI_MODEL', aiDraft.model);
    setShowAiConfig(false);
  };

  // Ref for imperative access to WorkflowIDE
  const ideRef = useRef<any>(null);

  // Track current workflow def from onWorkflowChange (replaces direct store access)
  const [currentDef, setCurrentDef] = useState<WorkflowDef | null>(null);

  const handleWorkflowChange = useCallback((def: WorkflowDef) => {
    setCurrentDef(def);
  }, []);

  const handleSave = useCallback((def: WorkflowDef) => {
    console.log('[DemoApp] onSave:', def.name, `(${def.tasks?.length ?? 0} tasks)`);
  }, []);

  const handleExport = useCallback(() => {
    const def = ideRef.current?.getWorkflowDef();
    if (!def) return;
    const blob = new Blob([JSON.stringify(def, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${def.name || 'workflow'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // 处理文件上传
  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);

    const reader = new FileReader();
    reader.onload = (e: ProgressEvent<FileReader>) => {
      try {
        const result = e.target?.result as string;
        if (!result) return;
        const json = JSON.parse(result);
        setWorkflowJson(json);
        // Clear history handled inside IDE or here? ideally handled by IDE on new props
      } catch (err: any) {
        setError(`解析 JSON 失败: ${err.message}`);
      }
    };
    reader.onerror = () => setError('读取文件失败');
    reader.readAsText(file);
  }, []);

  // 加载示例工作流
  const loadSampleWorkflow = useCallback(async (sampleName: string) => {
    if (!sampleName) return;
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}sample-workflows/${sampleName}.json`);
      if (!response.ok) throw new Error(`加载示例失败: ${response.statusText}`);
      const json = await response.json();
      setWorkflowJson(json);
      setWorkflowExecution(null);
      setError(null);
    } catch (err: any) {
      setError(`加载示例工作流失败: ${err.message}`);
    }
  }, []);

  // 运行态执行示例
  const [workflowExecution, setWorkflowExecution] = useState<any>(null);

  // 初始默认加载云主机全生命周期自动化示例
  useEffect(() => {
    loadSampleWorkflow('ecs-lifecycle-automation');
  }, [loadSampleWorkflow]);

  const loadExecutionExample = useCallback(async (exampleName: string) => {
    if (!exampleName) {
      setWorkflowExecution(null);
      return;
    }
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}sample-executions/${exampleName}.json`);
      if (!response.ok) throw new Error(`加载示例失败: ${response.statusText}`);
      const json = await response.json();
      setWorkflowExecution(json);
      setWorkflowJson(null);
      setError(null);
    } catch (err: any) {
      setError(`加载执行示例失败: ${err.message}`);
    }
  }, []);

  // 示例下拉：def:xxx 为编辑态流程，exec:xxx 为运行态实例
  const handleSamplePick = useCallback((val: string) => {
    if (!val) return;
    const [kind, name] = val.split(':');
    if (kind === 'def') loadSampleWorkflow(name);
    else if (kind === 'exec') loadExecutionExample(name);
  }, [loadSampleWorkflow, loadExecutionExample]);

  const handleNewBlank = useCallback(() => {
    setWorkflowJson(null);
    setCurrentDef(null);
    setWorkflowExecution(null);
    ideRef.current?.createBlankWorkflow();
  }, []);

  return (
    <div
      className={`app ${themeMode === 'light' ? 'light-theme' : ''}`}
      data-mode={themeMode}
      data-brand={themeColor}
      style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}
    >
      <DemoHeader
        baseUrl={import.meta.env.BASE_URL}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        hasWorkflow={!!(currentDef || workflowJson)}
        useNewAiMode={useNewAiMode}
        onAiModeChange={setUseNewAiMode}
        uiMode={uiMode}
        onUiModeChange={setUiMode}
        isReadOnly={isReadOnly}
        onReadOnlyChange={setIsReadOnly}
        showAllowOperations={!!workflowExecution && !useNewAiMode}
        allowOperations={allowOperations}
        onAllowOperationsChange={setAllowOperations}
        libraryFailed={libraryFailed}
        onLibraryAction={handleLibraryAction}
        demoEnv={demoEnv}
        onEnvChange={handleOnboardingEnv}
        onResetProducts={handleResetProducts}
        workflowLevel={workflowLevel}
        onLevelChange={setWorkflowLevel}
        onSamplePick={handleSamplePick}
        onNewBlank={handleNewBlank}
        onUpload={handleFileUpload}
        onExport={handleExport}
        aiConfigured={!!aiConfig.apiKey}
        onOpenAiConfig={() => { setAiDraft(aiConfig); setShowAiConfig(true); }}
      />

      <div className="app-content" style={{ flex: 1, position: 'relative' }}>
        {error && <div className="error-message"><TriangleAlert size={16} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -3, marginRight: 6 }} />{error}</div>}

        <WorkflowIdeProvider providers={providers}>
        {useNewAiMode ? (
          <AiWorkflowIDE
            ref={ideRef}
            workflowDef={workflowJson}
            workflowExecution={workflowExecution}
            theme={themeMode}
            themeColor={themeColor}
            layoutDirection="LR"
            aiConfig={aiConfig}
            onSave={handleSave}
            onWorkflowChange={handleWorkflowChange}
            onRequestImport={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.json';
              input.onchange = (e) => handleFileUpload(e as any);
              input.click();
            }}
          />
        ) : (
          <WorkflowIDE
            ref={ideRef}
            workflowDef={workflowJson}
            workflowExecution={workflowExecution}
            readOnly={isReadOnly}
            uiMode={uiMode}
            theme={themeMode}
            themeColor={themeColor}
            layoutDirection="LR"
            searchQuery={searchQuery}
            viewMode={viewMode}
            aiConfig={aiConfig}
            currentWorkflowLevel={workflowLevel || undefined}
            onSave={handleSave}
            onWorkflowChange={handleWorkflowChange}
            onRequestImport={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.json';
              input.onchange = (e) => handleFileUpload(e as any);
              input.click();
            }}
            executionActions={workflowExecution ? {
              allowOperations,
              onPause: (wfId) => console.log('[demo] 暂停工作流', wfId),
              onResume: (wfId) => console.log('[demo] 继续工作流', wfId),
              onTerminate: (wfId) => console.log('[demo] 终止工作流', wfId),
              onRetry: (wfId) => console.log('[demo] 重试工作流', wfId),
              onRestart: (wfId, opts) => console.log('[demo] 重启工作流', wfId, opts?.useLatestDef ? '（最新版本）' : '（执行版本）'),
              onRerunFromTask: (wfId, ref, taskId) => console.log('[demo] 从任务重新运行', wfId, ref, 'taskId:', taskId),
              onSkipTask: (wfId, ref, taskId) => console.log('[demo] 跳过任务', wfId, ref, 'taskId:', taskId),
            } : undefined}
          />
        )}
        </WorkflowIdeProvider>
      </div>

      {/* 全局居中 AI 服务配置弹窗 */}
      {showAiConfig && (
        <div className="ai-config-backdrop" onClick={() => setShowAiConfig(false)}>
          <div className="ai-config-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ai-config-modal-header">
              <div className="ai-config-title">
                <Bot size={20} strokeWidth={1.75} aria-hidden="true" />
                <span>AI 服务与模型配置</span>
              </div>
              <button
                className="ai-config-close"
                onClick={() => setShowAiConfig(false)}
                title="关闭 (Esc)"
                aria-label="关闭"
              >
                <X size={16} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>

            <div className="ai-config-modal-body">
              <div className="ai-config-field">
                <label className="ai-config-label">API Key</label>
                <input
                  className="ai-config-input"
                  type="password"
                  placeholder="sk-..."
                  value={aiDraft.apiKey}
                  onChange={(e) => setAiDraft((d) => ({ ...d, apiKey: e.target.value }))}
                  autoFocus
                />
                <span className="ai-config-help">支持 OpenAI、DeepSeek、Moonshot、通义千问等兼容服务的 API Key</span>
              </div>

              <div className="ai-config-field">
                <label className="ai-config-label">Base URL (接口地址)</label>
                <input
                  className="ai-config-input"
                  type="text"
                  placeholder="https://api.openai.com/v1"
                  value={aiDraft.baseUrl}
                  onChange={(e) => setAiDraft((d) => ({ ...d, baseUrl: e.target.value }))}
                />
              </div>

              <div className="ai-config-field">
                <label className="ai-config-label">Model (模型名称)</label>
                <input
                  className="ai-config-input"
                  type="text"
                  placeholder="gpt-4o / deepseek-chat"
                  value={aiDraft.model}
                  onChange={(e) => setAiDraft((d) => ({ ...d, model: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveAiConfig();
                  }}
                />
              </div>
            </div>

            <div className="ai-config-actions">
              <button className="ai-config-btn cancel" onClick={() => setShowAiConfig(false)}>
                取消
              </button>
              <button className="ai-config-btn save" onClick={saveAiConfig}>
                保存配置
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DemoApp;
