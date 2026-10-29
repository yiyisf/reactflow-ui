import { WorkflowDiff } from '../../types/workflow';
import { Check, Undo2 } from 'lucide-react';
import './DiffCard.css';

interface DiffCardProps {
    diff: WorkflowDiff;
    applied: boolean;
    onApply: () => void;
    onUndo: () => void;
}

const KIND_LABEL: Record<string, string> = {
    add: '新增',
    mod: '修改',
    del: '删除',
    replace: '替换',
};

const ROW_SYMBOL: Record<string, string> = { add: '+', mod: '~', del: '−' };

export default function DiffCard({ diff, applied, onApply, onUndo }: DiffCardProps) {
    const badgeKind = diff.kind === 'replace' ? 'add' : diff.kind;

    return (
        <div className="diff-card">
            <div className="diff-head">
                <span className={`diff-badge ${badgeKind}`}>
                    {KIND_LABEL[diff.kind] ?? diff.kind}
                </span>
                <span className="diff-summary">{diff.summary}</span>
            </div>

            {diff.rows && diff.rows.length > 0 && (
                <div className="diff-list">
                    {diff.rows.map((row, i) => (
                        <div key={i} className={`diff-row ${row.kind}`}>
                            <div className="diff-marker">{ROW_SYMBOL[row.kind] ?? '·'}</div>
                            <div className="diff-desc">{row.desc}</div>
                        </div>
                    ))}
                </div>
            )}

            <div className="diff-actions">
                {!applied ? (
                    <button className="diff-btn apply" onClick={onApply}>
                        <Check size={12} strokeWidth={1.75} aria-hidden="true" />
                        应用更改
                    </button>
                ) : (
                    <>
                        <button className="diff-btn applied" disabled>
                            <Check size={12} strokeWidth={1.75} aria-hidden="true" />
                            已应用
                        </button>
                        <button className="diff-btn undo" onClick={onUndo}>
                            <Undo2 size={12} strokeWidth={1.75} aria-hidden="true" />
                            撤销
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
