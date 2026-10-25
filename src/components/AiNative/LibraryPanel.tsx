/**
 * LibraryPanel — L1/L2/L3 sub-workflow catalog browser
 *
 * Allows users to search the workflow library and insert workflows
 * as SUB_WORKFLOW tasks directly onto the canvas (creates a proposal).
 */

import React, { useState, useMemo } from 'react';
import { Library } from 'lucide-react';
import { useIdeStores } from '../../store/ideStoresContext';
import useWorkflowStore from '../../store/workflowStore';
import { applyPatch, computeDiff } from '../../services/ai/toolExecutor';
import { collectAllTasksInOrder } from '../../services/ai/workflowSynthesizer';
import type { WorkflowLibraryItem, WorkflowLevel } from '../../types/workflowLibrary';
import type { WorkflowDef } from '../../types/conductor';
import { useLibraryCatalogSnapshot } from '../../library/useLibraryCatalog';
import { normalizeVersion } from '../../library/version';

/** 单次最多渲染的条目数（目录可能有上千项）；超出请用搜索缩小范围 */
const RENDER_LIMIT = 200;

const LEVEL_META: Record<WorkflowLevel, { label: string; color: string; bg: string; desc: string }> = {
    L1: { label: 'L1', color: 'var(--cm-text-muted)', bg: 'color-mix(in srgb, var(--cm-text-muted) 10%, transparent)', desc: '原子操作' },
    L2: { label: 'L2', color: 'var(--cm-data)', bg: 'color-mix(in srgb, var(--cm-data) 10%, transparent)', desc: '业务场景' },
    L3: { label: 'L3', color: 'var(--cm-ai)', bg: 'color-mix(in srgb, var(--cm-ai) 10%, transparent)', desc: '端到端' },
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
    const { setProposal, pendingProposal } = aiStore();
    /** Item waiting for the user's choice because an AI proposal is still pending (A15) */
    const [pendingInsert, setPendingInsert] = useState<WorkflowLibraryItem | null>(null);
    const workflowDef = useWorkflowStore(s => s.workflowDef);

    const [query, setQuery] = useState('');
    const [levelFilter, setLevelFilter] = useState<WorkflowLevel | 'ALL'>('ALL');
    const [domainFilter, setDomainFilter] = useState<string>('ALL');

    // 业务域列表按目录中首次出现的顺序；没有任何条目带业务域时不显示筛选
    const domains = useMemo(() => {
        const out: string[] = [];
        for (const item of items) if (item.domain && !out.includes(item.domain)) out.push(item.domain);
        return out;
    }, [items]);

    const filtered = useMemo(() => {
        const q = query.toLowerCase().trim();
        return items.filter(item => {
            if (levelFilter !== 'ALL' && item.workflowLevel !== levelFilter) return false;
            if (domainFilter !== 'ALL' && item.domain !== domainFilter) return false;
            if (!q) return true;
            return (
                item.workflowName.toLowerCase().includes(q) ||
                item.description.toLowerCase().includes(q) ||
                item.tags.some(t => t.toLowerCase().includes(q))
            );
        });
    }, [items, query, levelFilter, domainFilter]);

    const visible = useMemo(() => filtered.slice(0, RENDER_LIMIT), [filtered]);

    const byLevel = useMemo(() => ({
        L3: visible.filter(i => i.workflowLevel === 'L3'),
        L2: visible.filter(i => i.workflowLevel === 'L2'),
        L1: visible.filter(i => i.workflowLevel === 'L1'),
    }), [visible]);

    /**
     * Inserting while an AI proposal is pending would silently replace it. Ask first:
     * add to the pending proposal (keeps its changes), or discard it and insert on the canvas.
     */
    const handleInsert = (item: WorkflowLibraryItem) => {
        if (pendingProposal) {
            setPendingInsert(item);
            return;
        }
        insertInto(item, 'canvas');
    };

    const insertInto = (item: WorkflowLibraryItem, base: 'canvas' | 'proposal') => {
        setPendingInsert(null);
        const proposalDef = base === 'proposal' ? aiStore.getState().pendingProposal?.proposedDef : undefined;
        const currentDef: WorkflowDef = proposalDef ?? workflowDef ?? {
            name: 'new_workflow',
            version: 1,
            tasks: [],
        };
        const existingRefs = new Set(collectAllTasksInOrder(currentDef.tasks ?? []).map(t => t.taskReferenceName));
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
        <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--status-failed, var(--cm-status-failed))', display: 'flex', gap: 8, alignItems: 'center' }}>
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
                <div style={{ marginBottom: 12, color: 'var(--text-muted)' }}><Library size={32} strokeWidth={1.5} aria-hidden="true" /></div>
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
            {pendingInsert && (
                <div
                    role="alertdialog"
                    aria-label="插入前确认"
                    style={{
                        margin: '8px 12px 0', padding: '10px 12px', borderRadius: 8, fontSize: 12, lineHeight: 1.5,
                        border: '1px solid var(--cm-border-default)', background: 'var(--cm-surface-2)', color: 'var(--cm-text-secondary)',
                    }}
                >
                    <div style={{ marginBottom: 8 }}>
                        还有一份待确认的 AI 方案。要把 <code style={{ fontFamily: 'var(--cm-font-mono)' }}>{pendingInsert.workflowName}</code> 加到这份方案里，还是放弃方案、直接插入到当前画布？
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        <button
                            onClick={() => insertInto(pendingInsert, 'proposal')}
                            style={{ padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: 'var(--cm-brand-500)', color: 'var(--cm-on-brand)' }}
                        >追加到待确认方案</button>
                        <button
                            onClick={() => insertInto(pendingInsert, 'canvas')}
                            style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--cm-border-default)', cursor: 'pointer', fontSize: 12, background: 'var(--cm-surface-1)', color: 'var(--cm-text-primary)' }}
                        >放弃方案并插入画布</button>
                        <button
                            onClick={() => setPendingInsert(null)}
                            style={{ padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, background: 'none', color: 'var(--cm-text-muted)' }}
                        >取消插入</button>
                    </div>
                </div>
            )}
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
                {domains.length > 0 && (
                    <select
                        className="ai-library-search"
                        value={domainFilter}
                        onChange={e => setDomainFilter(e.target.value)}
                        title="按业务域筛选"
                    >
                        <option value="ALL">全部业务域</option>
                        {domains.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                )}
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
                                        color: meta.color, background: meta.bg, border: `1px solid color-mix(in srgb, ${meta.color} 25%, transparent)`,
                                    }}>{meta.label}</span>
                                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{meta.desc} · {group.length} 个</span>
                                </div>
                                {group.map(item => (
                                    <div key={item.workflowName} className="ai-library-item">
                                        <div className="ai-library-item-main">
                                            <div className="ai-library-item-name">{item.workflowName}</div>
                                            <div className="ai-library-item-version">v{item.version}</div>
                                            {item.domain && <span className="ai-library-tag" title="业务域">{item.domain}</span>}
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
