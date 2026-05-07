import { WorkflowDiff } from '../../types/workflow';
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
                        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 8l3.5 3.5L13 5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        应用更改
                    </button>
                ) : (
                    <>
                        <button className="diff-btn applied" disabled>
                            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M3 8l3.5 3.5L13 5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            已应用
                        </button>
                        <button className="diff-btn undo" onClick={onUndo}>
                            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M3.5 8a4.5 4.5 0 1 1 1.4 3.3" strokeLinecap="round" />
                                <path d="M3 4.5L4.5 8L7 6.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            撤销
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
