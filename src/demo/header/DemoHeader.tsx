import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { WorkflowLevel } from '../../types/workflowLibrary';
import { ThemeControls } from '../../components/ThemeControls';
import { BrandLogo } from '../../components/BrandLogo';
import { HeaderPopover } from './HeaderPopover';
import { Bot, Briefcase, Code2, Download, FilePlus, FlaskConical, FolderOpen, RefreshCw, RotateCcw, Search, Sparkles, TriangleAlert, Upload, Workflow, X, Zap } from 'lucide-react';
import './DemoHeader.css';

export interface DemoHeaderProps {
  baseUrl: string;
  searchQuery: string;
  onSearchChange: (v: string) => void;
  /** 是否有已加载的工作流（决定搜索框与导出是否可用） */
  hasWorkflow: boolean;
  useNewAiMode: boolean;
  onAiModeChange: (ai: boolean) => void;
  uiMode: 'pro' | 'business';
  onUiModeChange: (m: 'pro' | 'business') => void;
  isReadOnly: boolean;
  onReadOnlyChange: (v: boolean) => void;
  /** 仅运行态（执行实例）且经典模式下展示「允许操作」 */
  showAllowOperations: boolean;
  allowOperations: boolean;
  onAllowOperationsChange: (v: boolean) => void;
  libraryFailed: boolean;
  onLibraryAction: (action: 'reload' | 'fail') => void;
  demoEnv: 'TEST' | 'PROD';
  onEnvChange: (env: 'TEST' | 'PROD') => void;
  onResetProducts: () => void;
  workflowLevel: WorkflowLevel | '';
  onLevelChange: (l: WorkflowLevel | '') => void;
  /** 示例下拉：value 形如 def:xxx / exec:xxx */
  onSamplePick: (value: string) => void;
  onNewBlank: () => void;
  onUpload: (e: ChangeEvent<HTMLInputElement>) => void;
  onExport: () => void;
  aiConfigured: boolean;
  onOpenAiConfig: () => void;
}

/** 演示工作台头部：品牌 + 主模式开关 | 搜索 | 示例 / 文件 / 演示设置 / AI / 主题 */
export function DemoHeader(p: DemoHeaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // 窄屏（<=820px）下搜索框折叠为图标，点击后在头部下方展开
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  const demoNonDefault: string[] = [];
  if (p.isReadOnly) demoNonDefault.push('只读');
  if (p.showAllowOperations && !p.allowOperations) demoNonDefault.push('操作受限');
  if (p.demoEnv === 'PROD') demoNonDefault.push('PROD 环境');
  if (!p.useNewAiMode && p.workflowLevel) demoNonDefault.push(`层级 ${p.workflowLevel}`);
  if (p.libraryFailed) demoNonDefault.push('已模拟流程库加载失败');

  return (
    <header className="app-header dh">
      <div className="header-content dh-content">
        {/* 左：品牌 + 主模式开关 */}
        <div className="dh-left">
          <h1 className="app-title dh-brand">
            <BrandLogo size={26} />
            <span className="dh-brand-text"><span className="dh-brand-c">C</span>MASTER</span>
            <span className="dh-version">v1.3</span>
          </h1>

          <div className="dh-segmented" role="group" aria-label="设计器模式">
            <button
              type="button"
              className={!p.useNewAiMode ? 'is-on' : ''}
              aria-pressed={!p.useNewAiMode}
              onClick={() => p.onAiModeChange(false)}
              title="切换回经典设计器"
            >
              <Workflow size={15} strokeWidth={1.75} aria-hidden="true" /><span className="dh-seg-text"> 经典</span>
            </button>
            <button
              type="button"
              className={p.useNewAiMode ? 'is-on is-ai' : ''}
              aria-pressed={p.useNewAiMode}
              onClick={() => p.onAiModeChange(true)}
              title="体验全新 AI 工作流设计器"
            >
              <Sparkles size={15} strokeWidth={1.75} aria-hidden="true" /><span className="dh-seg-text"> AI</span>
            </button>
          </div>

          <div className="dh-segmented" role="group" aria-label="使用模式">
            <button
              type="button"
              className={p.uiMode === 'business' ? 'is-on is-business' : ''}
              aria-pressed={p.uiMode === 'business'}
              onClick={() => p.onUiModeChange('business')}
              title="切换为普通使用者模式 (卡片流/数据胶囊/云平台动作)"
            >
              <Briefcase size={15} strokeWidth={1.75} aria-hidden="true" /><span className="dh-seg-text"> 业务</span>
            </button>
            <button
              type="button"
              className={p.uiMode === 'pro' ? 'is-on' : ''}
              aria-pressed={p.uiMode === 'pro'}
              onClick={() => p.onUiModeChange('pro')}
              title="切换为专业开发者模式 (查看完整 DAG/JSON)"
            >
              <Code2 size={15} strokeWidth={1.75} aria-hidden="true" /><span className="dh-seg-text"> 专业</span>
            </button>
          </div>
        </div>

        {/* 中：搜索（弹性） */}
        <div className="dh-middle">
          {p.hasWorkflow && (
            <div className={`dh-search ${searchOpen ? 'is-open' : ''}`}>
              <button
                type="button"
                className={`mode-btn dh-search-toggle ${p.searchQuery ? 'active' : ''}`}
                aria-label="搜索任务"
                aria-expanded={searchOpen}
                title="搜索任务"
                onClick={() => setSearchOpen((v) => !v)}
              >
                <Search size={15} strokeWidth={1.75} aria-hidden="true" />
              </button>
              <div className="dh-search-field">
                <span className="search-icon" aria-hidden="true"><Search size={14} strokeWidth={1.75} aria-hidden="true" /></span>
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="搜索任务..."
                  aria-label="搜索任务"
                  value={p.searchQuery}
                  onChange={(e) => p.onSearchChange(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Escape') setSearchOpen(false); }}
                  className="search-input"
                />
                {p.searchQuery && (
                  <button type="button" className="search-clear" aria-label="清除搜索" onClick={() => p.onSearchChange('')}><X size={14} strokeWidth={1.75} aria-hidden="true" /></button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 右：示例 / 文件 / 演示设置 / AI / 主题 / 宣传页 */}
        <div className="header-actions dh-right">
          <select
            className="sample-select dh-sample"
            aria-label="示例工作流"
            onChange={(e) => {
              p.onSamplePick(e.target.value);
              e.target.value = '';
            }}
            defaultValue=""
            title="载入官方示例工作流（包含编辑态与运行态案例）"
          >
            <option value="" disabled>示例工作流…</option>
            <optgroup label="── 流程库 ──">
              <option value="def:library-capabilities-demo">引用库能力（有新版本 / 版本不可用）</option>
            </optgroup>
            <optgroup label="── 云平台业务流程 ──">
              <option value="def:ecs-lifecycle-automation">云主机全生命周期自动化（业务模式）</option>
            </optgroup>
            <optgroup label="── 编辑态流程 ──">
              <option value="def:simple-workflow">简单流程 (Simple)</option>
              <option value="def:decision-workflow">分支流程 (Decision)</option>
              <option value="def:fork-join-workflow">并行流程 (Fork/Join)</option>
              <option value="def:complex-workflow">复杂综合流程</option>
            </optgroup>
            <optgroup label="── 运行态实例 ──">
              <option value="exec:human-approval">HUMAN 审批 · 运行中</option>
              <option value="exec:mixed-status">CI/CD 流水线 · 失败</option>
              <option value="exec:loop-iterations">DO_WHILE 循环 3 次 · 成功</option>
              <option value="exec:retry-tasks">任务重试机制 · 成功</option>
              <option value="exec:fork-dynamic">动态并行 FORK · 成功</option>
              <option value="exec:switch-branches">SWITCH 分支执行 · 成功</option>
            </optgroup>
          </select>

          {/* 隐藏的文件选择框：始终挂载，供「导入 JSON」菜单项触发 */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={(e) => {
              p.onUpload(e);
              e.target.value = '';
            }}
          />

          <HeaderPopover icon={<FolderOpen size={15} strokeWidth={1.75} aria-hidden="true" />} label="文件" title="文件：新建 / 导入 / 导出" kind="menu">
            {({ close }) => (
              <>
                <button
                  type="button"
                  role="menuitem"
                  className="dh-item"
                  title="新建空白工作流"
                  onClick={() => { close(); p.onNewBlank(); }}
                >
                  <FilePlus size={14} strokeWidth={1.75} aria-hidden="true" /> 新建空白
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="dh-item"
                  title="导入 JSON 文件"
                  onClick={() => { close(); fileInputRef.current?.click(); }}
                >
                  <Upload size={14} strokeWidth={1.75} aria-hidden="true" /> 导入 JSON
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="dh-item"
                  disabled={!p.hasWorkflow}
                  title={p.hasWorkflow ? '导出当前工作流 JSON' : '没有可导出的工作流'}
                  onClick={() => { close(); p.onExport(); }}
                >
                  <Download size={14} strokeWidth={1.75} aria-hidden="true" /> 导出 JSON
                </button>
              </>
            )}
          </HeaderPopover>

          <HeaderPopover
            icon={<FlaskConical size={15} strokeWidth={1.75} aria-hidden="true" />}
            label="演示设置"
            title="演示设置"
            kind="dialog"
            badge={demoNonDefault.length > 0}
            badgeTitle={`非默认：${demoNonDefault.join('、')}`}
            panelClassName="dh-settings"
          >
            {({ close }) => (
              <>
                <section className="dh-group" aria-labelledby="dh-g-perm">
                  <h2 id="dh-g-perm" className="dh-group-title">权限</h2>
                  <ToggleRow
                    label="只读"
                    hint="经典设计器只读模式"
                    checked={p.isReadOnly}
                    onChange={p.onReadOnlyChange}
                    title={p.isReadOnly ? '切换到编辑模式' : '切换到只读模式'}
                  />
                  {p.showAllowOperations && (
                    <ToggleRow
                      label="允许操作"
                      hint="运行态实例的暂停 / 重试等操作"
                      checked={p.allowOperations}
                      onChange={p.onAllowOperationsChange}
                      title={p.allowOperations ? '切换至操作受限状态' : '切换至允许操作状态'}
                    />
                  )}
                </section>

                <section className="dh-group" aria-labelledby="dh-g-lib">
                  <h2 id="dh-g-lib" className="dh-group-title">流程库</h2>
                  <div className="dh-row-buttons">
                    <button
                      type="button"
                      className="mode-btn"
                      title="流程库由演示用的模拟治理服务提供（约 0.4 秒延迟）"
                      onClick={() => p.onLibraryAction('reload')}
                    >
                      <RefreshCw size={14} strokeWidth={1.75} aria-hidden="true" /> 重新加载
                    </button>
                    <button
                      type="button"
                      className={`mode-btn ${p.libraryFailed ? 'is-warn' : ''}`}
                      title="模拟目录加载失败，查看错误提示与重试（点击重试可恢复）"
                      onClick={() => p.onLibraryAction('fail')}
                    >
                      <TriangleAlert size={14} strokeWidth={1.75} aria-hidden="true" /> 模拟加载失败
                    </button>
                  </div>
                </section>

                <section className="dh-group" aria-labelledby="dh-g-onb">
                  <h2 id="dh-g-onb" className="dh-group-title">自助接入</h2>
                  <label className="dh-field">
                    <span>环境</span>
                    <select
                      className="sample-select"
                      value={p.demoEnv}
                      onChange={(e) => p.onEnvChange(e.target.value as 'TEST' | 'PROD')}
                      title="TEST 开放自助试用（命名类型固定 tmp）；PROD 不开放试用，新建流程可选 custom / std"
                    >
                      <option value="TEST">TEST</option>
                      <option value="PROD">PROD</option>
                    </select>
                  </label>
                  <div className="dh-row-buttons">
                    <button
                      type="button"
                      className="mode-btn"
                      title="清空演示用户的产品并清空画布，在 TEST 环境下可看到空画布的「开始试用」引导"
                      onClick={() => { p.onResetProducts(); close(); }}
                    >
                      <RotateCcw size={14} strokeWidth={1.75} aria-hidden="true" /> 重置产品
                    </button>
                  </div>
                </section>

                {!p.useNewAiMode && (
                  <section className="dh-group" aria-labelledby="dh-g-level">
                    <h2 id="dh-g-level" className="dh-group-title">分层</h2>
                    <label className="dh-field">
                      <span>层级</span>
                      <select
                        className="sample-select"
                        value={p.workflowLevel}
                        onChange={(e) => p.onLevelChange(e.target.value as WorkflowLevel | '')}
                        title="当前编辑流程的层级：L1 看不到 L2/L3 能力，L2 看不到 L3 能力（业务模式的动作选择器生效）"
                      >
                        <option value="">不限</option>
                        <option value="L1">L1</option>
                        <option value="L2">L2</option>
                        <option value="L3">L3</option>
                      </select>
                    </label>
                  </section>
                )}
              </>
            )}
          </HeaderPopover>

          <button
            type="button"
            className={`mode-btn dh-secondary-btn dh-ai-btn ${p.aiConfigured ? 'is-configured' : ''}`}
            onClick={p.onOpenAiConfig}
            title="配置 AI 服务（API Key / Base URL / 模型）"
            aria-label={p.aiConfigured ? 'AI 配置（已配置）' : 'AI 配置'}
          >
            <span className="dh-icon" aria-hidden="true"><Bot size={15} strokeWidth={1.75} aria-hidden="true" /></span>
            <span className="dh-label">AI {p.aiConfigured ? '已配置' : '配置'}</span>
          </button>

          <ThemeControls />

          <a
            href={p.baseUrl}
            className="mode-btn dh-launch"
            title="查看 Conductor Workflow IDE v1.3.2「补齐与打磨」发布宣传页"
            aria-label="v1.3 宣传页"
          >
            <Zap size={15} strokeWidth={1.75} aria-hidden="true" />
          </a>
        </div>
      </div>
    </header>
  );
}

function ToggleRow({ label, hint, checked, onChange, title }: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`dh-toggle ${checked ? 'is-on' : ''}`}
      title={title}
      onClick={() => onChange(!checked)}
    >
      <span className="dh-toggle-text">
        <span className="dh-toggle-label">{label}</span>
        <span className="dh-toggle-hint">{hint}</span>
      </span>
      <span className="dh-switch" aria-hidden="true"><span className="dh-switch-knob" /></span>
    </button>
  );
}
