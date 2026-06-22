import React, { useEffect, useRef, useState } from 'react';
import useWorkflowStore from '../../store/workflowStore';

interface MermaidBlockProps {
    code: string;
}

let mermaidReady = false;
let mermaidInitPromise: Promise<void> | null = null;

async function ensureMermaid(): Promise<typeof import('mermaid').default> {
    const m = (await import('mermaid')).default;
    if (!mermaidReady) {
        if (!mermaidInitPromise) {
            mermaidInitPromise = (async () => {
                m.initialize({
                    startOnLoad: false,
                    // 全局默认主题；具体主题由每个图表的 init 指令按当前 store 主题覆盖
                    theme: 'dark',
                    securityLevel: 'loose',
                    fontFamily: 'var(--font-sans, sans-serif)',
                    flowchart: { curve: 'basis', htmlLabels: true },
                });
                mermaidReady = true;
            })();
        }
        await mermaidInitPromise;
    }
    return m;
}

const MermaidBlock: React.FC<MermaidBlockProps> = ({ code }) => {
    const theme = useWorkflowStore((s) => s.theme);
    const containerRef = useRef<HTMLDivElement>(null);
    const [error, setError] = useState<string | null>(null);
    const idRef = useRef(`mmd-${Math.random().toString(36).slice(2)}`);

    useEffect(() => {
        let cancelled = false;
        setError(null);

        // 跟随 IDE 主题：light → 'default'（浅色），dark → 'dark'。
        // 使用每图表 init 指令覆盖全局配置，避免主题切换时重新初始化全局 mermaid。
        const mermaidTheme = theme === 'light' ? 'default' : 'dark';
        const themedCode = `%%{init: {'theme': '${mermaidTheme}'}}%%\n${code.trim()}`;

        ensureMermaid().then(async (m) => {
            if (cancelled || !containerRef.current) return;
            try {
                const { svg } = await m.render(idRef.current, themedCode);
                if (cancelled || !containerRef.current) return;
                containerRef.current.innerHTML = svg;
                // Make SVG responsive
                const svgEl = containerRef.current.querySelector('svg');
                if (svgEl) {
                    svgEl.style.maxWidth = '100%';
                    svgEl.style.height = 'auto';
                }
            } catch (e: any) {
                if (!cancelled) setError(e?.message ?? 'Mermaid render error');
            }
        }).catch((e: any) => {
            if (!cancelled) setError(e?.message ?? 'Mermaid load error');
        });

        return () => { cancelled = true; };
    }, [code, theme]);

    if (error) {
        return (
            <div style={{
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 6,
                padding: '8px 12px',
                fontSize: 12,
                color: '#f87171',
                margin: '8px 0',
            }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>流程图渲染失败</div>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 11, opacity: 0.8 }}>{code}</pre>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            style={{
                background: 'var(--bg-primary)',
                borderRadius: 8,
                padding: '12px',
                margin: '8px 0',
                overflow: 'auto',
                textAlign: 'center',
            }}
        >
            <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>渲染中...</div>
        </div>
    );
};

export default MermaidBlock;
