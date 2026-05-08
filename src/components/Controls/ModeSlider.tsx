import { useEffect, useRef, useState } from 'react';
import useWorkflowStore from '../../store/workflowStore';
import { ViewMode } from '../../types/workflow';
import './ModeSlider.css';

const MODES: { id: ViewMode; label: string; title: string }[] = [
    { id: 'business', label: '业务', title: '仅展示核心业务节点' },
    { id: 'standard', label: '标准', title: '业务 + 控制流节点' },
    { id: 'developer', label: '全开发', title: '展示所有节点（含数据转换）' },
];

export default function ModeSlider() {
    const viewMode = useWorkflowStore((s) => s.viewMode);
    const setViewMode = useWorkflowStore((s) => s.setViewMode);
    const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const [knob, setKnob] = useState({ x: 3, w: 0 });

    useEffect(() => {
        const i = MODES.findIndex((m) => m.id === viewMode);
        const el = btnRefs.current[i];
        if (el) setKnob({ x: el.offsetLeft, w: el.offsetWidth });
    }, [viewMode]);

    return (
        <div className="mode-slider" role="group" aria-label="视图模式">
            <div
                className="mode-slider-knob"
                style={{ width: knob.w, transform: `translateX(${knob.x - 3}px)` }}
            />
            {MODES.map((m, i) => (
                <button
                    key={m.id}
                    ref={(el) => { btnRefs.current[i] = el; }}
                    className={`mode-slider-opt${viewMode === m.id ? ' active' : ''}`}
                    onClick={() => setViewMode(m.id)}
                    title={m.title}
                    aria-pressed={viewMode === m.id}
                >
                    <span className="mode-dot" />
                    {m.label}
                </button>
            ))}
        </div>
    );
}
