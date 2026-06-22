import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ReferenceOption } from '../../utils/referenceContext';
import './ReferencePicker.css';

interface ReferencePickerProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (expr: string) => void;
    references: ReferenceOption[];
    anchorRect?: DOMRect;
}

const SOURCE_LABELS: Record<ReferenceOption['source'], string> = {
    workflow_input: '工作流入参',
    task_output: '任务输出',
    workflow_variable: '工作流变量',
    system: '系统变量',
};

const SOURCE_ICONS: Record<ReferenceOption['source'], string> = {
    workflow_input: '📥',
    task_output: '📤',
    workflow_variable: '📦',
    system: '⚙️',
};

export default function ReferencePicker({ isOpen, onClose, onSelect, references, anchorRect }: ReferencePickerProps) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const grouped = references.reduce<Record<string, ReferenceOption[]>>((acc, opt) => {
        (acc[opt.source] ??= []).push(opt);
        return acc;
    }, {});

    const style: React.CSSProperties = anchorRect ? {
        position: 'fixed',
        top: Math.min(anchorRect.bottom + 4, window.innerHeight - 320),
        left: Math.max(anchorRect.left, 8),
        zIndex: 9999,
    } : { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 9999 };

    return createPortal(
        <div ref={ref} className="ref-picker" style={style}>
            <div className="ref-picker-header">
                <span>选择引用</span>
                <button className="ref-picker-close" onClick={onClose}>✕</button>
            </div>
            <div className="ref-picker-body">
                {references.length === 0 ? (
                    <div className="ref-picker-empty">暂无可引用项</div>
                ) : (
                    (Object.keys(SOURCE_LABELS) as ReferenceOption['source'][]).map(source => {
                        const items = grouped[source];
                        if (!items || items.length === 0) return null;
                        return (
                            <div key={source} className="ref-picker-group">
                                <div className="ref-picker-group-label">
                                    {SOURCE_ICONS[source]} {SOURCE_LABELS[source]}
                                </div>
                                {items.map(opt => (
                                    <button
                                        key={opt.expr}
                                        className="ref-picker-item"
                                        onClick={() => { onSelect(opt.expr); onClose(); }}
                                        title={opt.description}
                                    >
                                        <code className="ref-picker-expr">{opt.expr}</code>
                                        {opt.description && (
                                            <span className="ref-picker-desc">{opt.description}</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        );
                    })
                )}
            </div>
        </div>,
        document.body
    );
}
