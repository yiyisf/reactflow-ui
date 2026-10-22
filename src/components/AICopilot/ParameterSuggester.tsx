import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './ParameterSuggester.css';
import { WlspCompletionItem, ValueType } from '../../services/wlsp/workflowLsp';
import useWorkflowStore from '../../store/workflowStore';

export interface Suggestion {
    label: string;
    value: string;
    description: string;
    category?: 'upstream' | 'workflow_input' | 'variable' | 'system' | 'ai';
    valueType?: ValueType;
    sourceLabel?: string;
    sampleValue?: string;
    isConditional?: boolean;
}

interface ParameterSuggesterProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (value: string) => void;
    suggestions: Suggestion[];
    wlspItems?: WlspCompletionItem[];
    anchorRect?: DOMRect;
    onRequestAiHint?: () => void;
    aiLoading?: boolean;
}

const TYPE_COLORS: Record<string, string> = {
    string: '#38bdf8',
    number: '#a78bfa',
    boolean: '#f472b6',
    object: '#fbbf24',
    array: '#34d399',
    any: '#94a3b8',
};

const ParameterSuggester: React.FC<ParameterSuggesterProps> = ({
    isOpen,
    onClose,
    onSelect,
    suggestions,
    wlspItems = [],
    anchorRect,
    onRequestAiHint,
    aiLoading = false,
}) => {
    const theme = useWorkflowStore((s) => s.theme);
    const themeColor = useWorkflowStore((s) => s.themeColor);
    const [activeCategory, setActiveCategory] = useState<'all' | 'upstream' | 'workflow_input' | 'variable' | 'system'>('all');
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const searchInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setQuery('');
            setActiveIndex(0);
            setTimeout(() => searchInputRef.current?.focus(), 30);
        }
    }, [isOpen]);

    const mergedItems: Suggestion[] = useMemo(() => {
        const list: Suggestion[] = wlspItems.map(item => ({
            label: item.label,
            value: item.value,
            description: item.description,
            category: item.category,
            valueType: item.valueType,
            sourceLabel: item.sourceLabel,
            sampleValue: item.sampleValue,
            isConditional: item.isConditional,
        }));

        // 追加 AI 生成的额外建议（去重）
        const seen = new Set(list.map(i => i.value));
        for (const s of suggestions) {
            if (!seen.has(s.value)) {
                seen.add(s.value);
                list.push({
                    ...s,
                    category: s.category || 'ai',
                });
            }
        }
        return list;
    }, [wlspItems, suggestions]);

    const filteredItems = useMemo(() => {
        return mergedItems.filter(item => {
            if (activeCategory !== 'all' && item.category !== activeCategory && item.category !== 'ai') {
                return false;
            }
            if (!query.trim()) return true;
            const q = query.toLowerCase();
            return (
                item.label.toLowerCase().includes(q) ||
                item.value.toLowerCase().includes(q) ||
                item.description.toLowerCase().includes(q) ||
                (item.sourceLabel && item.sourceLabel.toLowerCase().includes(q))
            );
        });
    }, [mergedItems, activeCategory, query]);

    useEffect(() => {
        setActiveIndex(0);
    }, [activeCategory, query]);

    if (!isOpen || !anchorRect || typeof document === 'undefined') return null;

    // 计算安全的弹窗位置（通过 Portal 挂载到 document.body，彻底脱离侧边栏 backdrop-filter/transform 的局部坐标陷阱）
    const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800;
    const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const popoverWidth = Math.min(380, viewportW - 32);

    // 水平方向：若触发元素较宽（如整行输入框/文本域），与输入框左边缘或右边缘对齐；若为右侧小按钮，则右边缘与按钮右边缘对齐
    const preferredLeft = anchorRect.width >= 160
        ? anchorRect.left
        : anchorRect.right - popoverWidth;
    const left = Math.min(
        Math.max(16, preferredLeft),
        viewportW - popoverWidth - 16
    );

    // 垂直方向：优先向下展开；若下方空间不足，则向上紧贴输入框顶部展开
    const spaceBelow = viewportH - anchorRect.bottom - 16;
    const spaceAbove = anchorRect.top - 16;
    const openUpward = spaceBelow < 260 && spaceAbove > spaceBelow;
    const availableHeight = openUpward
        ? Math.min(400, Math.max(200, spaceAbove))
        : Math.min(400, Math.max(200, spaceBelow));

    const isLight = theme === 'light';
    const style: React.CSSProperties = {
        position: 'fixed',
        ...(openUpward
            ? { bottom: `${viewportH - anchorRect.top + 6}px` }
            : { top: `${anchorRect.bottom + 6}px` }),
        left: `${left}px`,
        width: `${popoverWidth}px`,
        maxHeight: `${availableHeight}px`,
        zIndex: 9999,
        background: isLight ? 'rgba(255, 255, 255, 0.98)' : 'rgba(15, 23, 42, 0.96)',
        color: isLight ? '#0f172a' : '#f8fafc',
        borderColor: isLight ? 'rgba(148, 163, 184, 0.35)' : 'rgba(56, 189, 248, 0.28)',
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex(prev => (filteredItems.length > 0 ? (prev + 1) % filteredItems.length : 0));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(prev => (filteredItems.length > 0 ? (prev - 1 + filteredItems.length) % filteredItems.length : 0));
        } else if (e.key === 'Enter' && filteredItems[activeIndex]) {
            e.preventDefault();
            onSelect(filteredItems[activeIndex].value);
            onClose();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
        }
    };

    return createPortal(
        <>
            <div className="suggester-overlay" onClick={onClose} />
            <div
                className={`parameter-suggester-popover glass-panel ${isLight ? 'theme-light' : 'theme-dark'}`}
                data-mode={theme}
                data-brand={themeColor}
                style={style}
                onKeyDown={handleKeyDown}
            >
                <div className="suggester-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="sparkle-icon">⚡</span>
                        <span>W-LSP 上下文变量补全</span>
                        <span style={{ fontSize: 10, opacity: 0.65, fontWeight: 500 }}>
                            ({filteredItems.length})
                        </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {onRequestAiHint && (
                            <button
                                type="button"
                                className="suggester-ai-btn"
                                onClick={onRequestAiHint}
                                disabled={aiLoading}
                                title="调用 AI 推理更多上下文表达式"
                            >
                                {aiLoading ? 'AI 思考中...' : '✨ AI 推荐'}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            title="关闭 (Esc)"
                            style={{
                                background: 'none',
                                border: 'none',
                                color: 'inherit',
                                opacity: 0.55,
                                cursor: 'pointer',
                                padding: '2px 4px',
                                fontSize: 12,
                                lineHeight: 1,
                            }}
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* 搜索过滤框 */}
                <div className="suggester-search-bar">
                    <input
                        ref={searchInputRef}
                        type="text"
                        className="suggester-search-input"
                        placeholder="搜索上游任务、输出字段或输入参数 (↑↓选择, Enter插入)..."
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                    />
                </div>

                {/* 分类切换 Tab */}
                <div className="suggester-tabs">
                    {[
                        { id: 'all', label: '全部' },
                        { id: 'upstream', label: '🔗 上游输出' },
                        { id: 'workflow_input', label: '📥 工作流输入' },
                        { id: 'variable', label: '📦 全局变量' },
                        { id: 'system', label: '⚙️ 系统' },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            type="button"
                            className={`suggester-tab ${activeCategory === tab.id ? 'active' : ''}`}
                            onClick={() => setActiveCategory(tab.id as any)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div className="suggester-list">
                    {filteredItems.length === 0 ? (
                        <div className="suggester-empty">
                            没有匹配的上下文变量
                        </div>
                    ) : (
                        filteredItems.map((s, idx) => {
                            const typeColor = TYPE_COLORS[s.valueType || 'any'] || '#94a3b8';
                            return (
                                <div
                                    key={`${s.value}-${idx}`}
                                    className={`suggestion-item ${idx === activeIndex ? 'active' : ''}`}
                                    onMouseEnter={() => setActiveIndex(idx)}
                                    onClick={() => {
                                        onSelect(s.value);
                                        onClose();
                                    }}
                                >
                                    <div className="suggestion-top-row">
                                        <span className="suggestion-label">{s.label}</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            {s.isConditional && (
                                                <span className="suggestion-cond-badge" title="来自条件分支，可能未执行">
                                                    条件分支
                                                </span>
                                            )}
                                            {s.valueType && (
                                                <span
                                                    className="suggestion-type-badge"
                                                    style={{ color: typeColor, borderColor: `${typeColor}44`, background: `${typeColor}15` }}
                                                >
                                                    {s.valueType}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="suggestion-value-row">
                                        <code className="suggestion-value">{s.value}</code>
                                        {s.sampleValue !== undefined && (
                                            <span className="suggestion-sample" title={`真实样本值: ${s.sampleValue}`}>
                                                = {s.sampleValue}
                                            </span>
                                        )}
                                    </div>

                                    <div className="suggestion-desc">
                                        {s.sourceLabel ? `[${s.sourceLabel}] ` : ''}{s.description}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </>,
        document.body
    );
};

export default ParameterSuggester;
