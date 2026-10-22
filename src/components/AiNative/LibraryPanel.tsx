/**
 * LibraryPanel — L1/L2/L3 sub-workflow catalog browser
 *
 * Allows users to search the workflow library and insert workflows
 * as SUB_WORKFLOW tasks directly onto the canvas (creates a proposal).
 */

import React, { useState, useMemo } from 'react';
import { useIdeStores } from '../../store/ideStoresContext';
import useWorkflowStore from '../../store/workflowStore';
import { applyPatch, computeDiff } from '../../services/ai/toolExecutor';
import type { WorkflowLibraryItem, WorkflowLevel } from '../../types/workflowLibrary';
import type { WorkflowDef } from '../../types/conductor';
import { useLibraryCatalogSnapshot } from '../../library/useLibraryCatalog';
import { normalizeVersion } from '../../library/version';

/** 单次最多渲染的条目数（目录可能有上千项）；超出请用搜索缩小范围 */
const RENDER_LIMIT = 200;

const LEVEL_META: Record<WorkflowLevel, { label: string; color: string; bg: string; desc: string }> = {
    L1: { label: 'L1', color: '#64748b', bg: 'rgba(100,116,139,0.1)', desc: '原子操作' },
    L2: { label: 'L2', color: '#0ea5e9', bg: 'rgba(14,165,233,0.1)', desc: '业务场景' },
    L3: { label: 'L3', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)', desc: '端到端' },
};

function makeUniqueRef(base: string, existingRefs: Set<string>): string {
    const slug = `sub_${base.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;
    if (!existingRefs.has(slug)) return slug;
    let i = 2;
    while (existingRefs.has(`${slug}_${i}`)) i++;
    return `${slug}_${i}`;
}

const LibraryPanel: React.FC = () => {
    const { aiStore, libraryStore, libraryCatalog } = useIdeStores();
    const { items } = libraryStore();
    const catalogState = useLibraryCatalogSnapshot(libraryCatalog);
    const { setProposal } = aiStore();
    const workflowDef = useWorkflowStore(s => s.workflowDef);

    const [query, setQuery] = useState('');
    const [levelFilter, setLevelFilter] = useState<WorkflowLevel | 'ALL'>('ALL');

    const filtered = useMemo(() => {
        const q = query.toLowerCase().trim();
        return items.filter(item => {
            if (levelFilter !== 'ALL' && item.workflowLevel !== levelFilter) return false;
            if (!q) return true;
            return (
                item.workflowName.toLowerCase().includes(q) ||
                item.description.toLowerCase().includes(q) ||
                item.tags.some(t => t.toLowerCase().includes(q))
            );
        });
    }, [items, query, levelFilter]);

    const visible = useMemo(() => filtered.slice(0, RENDER_LIMIT), [filtered]);

    const byLevel = useMemo(() => ({
        L3: visible.filter(i => i.workflowLevel === 'L3'),
        L2: visible.filter(i => i.workflowLevel === 'L2'),
        L1: visible.filter(i => i.workflowLevel === 'L1'),
    }), [visible]);

    const handleInsert = (item: WorkflowLibraryItem) => {
        const currentDef: WorkflowDef = workflowDef ?? {
            name: 'new_workflow',
            version: 1,
            tasks: [],
        };
        const existingRefs = new Set((currentDef.tasks ?? []).map(t => t.taskReferenceName));
        const ref = makeUniqueRef(item.workflowName, existingRefs);
        // 新建引用固定为目录中的当前最新版本；无目录信息时才从版本串解析主版本号
        const versionNum = libraryCatalog?.latest(item.workflowName)?.version ?? normalizeVersion(item.version).version;

        const task = {
            name: item.description || item.workflowName,
            taskReferenceName: ref,
            type: 'SUB_WORKFLOW' as const,
            subWorkflowParam: {
                name: item.workflowName,
                version: versionNum,
            },
        };

        const proposed = applyPatch(currentDef, [{ op: 'add_task', task }]);
        const diff = computeDiff(workflowDef, proposed);
        setProposal({
            proposedDef: proposed,
            diff,
            inferredLevel: item.workflowLevel,
            messageId: `library-insert-${item.workflowName}`,
        });
    };

    // 加载状态条：加载中 / 加载失败（点击重试）；失败不阻塞其它功能
    const statusBar = catalogState.status === 'loading' ? (
        <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--text-muted)' }}>正在加载流程库…</div>
    ) : catalogState.status === 'error' ? (
        <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--status-failed, #ef4444)', display: 'flex', gap: 8, alignItems: 'center' }}>
            <span title={catalogState.error?.message}>流程库加载失败</span>
            <button
                onClick={() => { void libraryCatalog?.reload(); }}
                style={{
                    background: 'none', border: '1px solid currentColor', borderRadius: 4, color: 'inherit',
                    cursor: 'pointer', fontSize: 11, padding: '1px 8px',
                }}
            >点击重试</button>
        </div>
    ) : null;

    if (items.length === 0) {
        if (statusBar) return <div className="ai-library-empty-state">{statusBar}</div>;
        return (
            <div className="ai-library-empty-state">
                <div style={{ fontSize: 32, marginBottom: 12 }}>📚</div>
                <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>未配置工作流库</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    在集成组件时传入 <code style={{ background: 'var(--bg-tertiary)', padding: '1px 5px', borderRadius: 4 }}>workflowLibrary</code> 或 <code style={{ background: 'var(--bg-tertiary)', padding: '1px 5px', borderRadius: 4 }}>libraryProvider</code> prop 即可启用库浏览功能
                </div>
            </div>
        );
    }

    return (
        <div className="ai-library-panel">
            {statusBar}
            {/* Search & filter */}
            <div className="ai-library-toolbar">
                <input
                    className="ai-library-search"
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="搜索工作流名称、描述、标签…"
                />
                <div className="ai-library-level-filters">
                    {(['ALL', 'L3', 'L2', 'L1'] as const).map(lvl => (
                        <button
                            key={lvl}
                            onClick={() => setLevelFilter(lvl)}
                            className={`ai-library-filter-btn ${levelFilter === lvl ? 'active' : ''}`}
                            style={levelFilter === lvl && lvl !== 'ALL' ? {
                                background: LEVEL_META[lvl as WorkflowLevel].bg,
                                color: LEVEL_META[lvl as WorkflowLevel].color,
                                borderColor: LEVEL_META[lvl as WorkflowLevel].color,
                            } : {}}
                        >
                            {lvl === 'ALL' ? '全部' : lvl}
                        </button>
                    ))}
                </div>
            </div>

            {/* Results */}
            <div className="ai-library-content">
                {filtered.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-muted)', fontSize: 13 }}>
                        未找到匹配的工作流
                    </div>
                ) : (
                    (['L3', 'L2', 'L1'] as WorkflowLevel[]).map(lvl => {
                        const group = byLevel[lvl];
                        if (group.length === 0) return null;
                        const meta = LEVEL_META[lvl];
                        return (
                            <div key={lvl} className="ai-library-group">
                                <div className="ai-library-group-header">
                                    <span style={{
                                        padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                                        color: meta.color, background: meta.bg, border: `1px solid ${meta.color}40`,
                                    }}>{meta.label}</span>
                                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{meta.desc} · {group.length} 个</span>
                                </div>
                                {group.map(item => (
                                    <div key={item.workflowName} className="ai-library-item">
                                        <div className="ai-library-item-main">
                                            <div className="ai-library-item-name">{item.workflowName}</div>
                                            <div className="ai-library-item-version">v{item.version}</div>
                                        </div>
                                        <div className="ai-library-item-desc">{item.description}</div>
                                        {item.tags.length > 0 && (
                                            <div className="ai-library-item-tags">
                                                {item.tags.map(tag => (
                                                    <span key={tag} className="ai-library-tag">{tag}</span>
                                                ))}
                                            </div>
                                        )}
                                        <button
                                            className="ai-library-insert-btn"
                                            onClick={() => handleInsert(item)}
                                            title={`将 ${item.workflowName} 作为子工作流插入画布`}
                                        >
                                            + 插入画布
                                        </button>
                                    </div>
                                ))}
                            </div>
                        );
                    })
                )}
                {filtered.length > visible.length && (
                    <div style={{ textAlign: 'center', padding: '12px 16px', color: 'var(--text-muted)', fontSize: 12 }}>
                        共 {filtered.length} 个，仅显示前 {visible.length} 个，请用搜索缩小范围
                    </div>
                )}
            </div>
        </div>
    );
};

export default LibraryPanel;
