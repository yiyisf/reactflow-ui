import React, { useMemo } from 'react';
import dagre from 'dagre';
import { parseMermaidFlowchart, type MermaidNodeShape } from './mermaidParser';

interface MermaidBlockProps {
    code: string;
}

/**
 * Lightweight zero-bloat Mermaid Flowchart/Graph SVG renderer powered by Dagre.
 * Eliminates ~2.5MB of heavy transitive bundles (cytoscape, katex, etc.) while
 * rendering crisp, theme-aware SVG architecture diagrams in AI chat.
 * Parsing lives in ./mermaidParser.ts (unit-tested against workflowToMermaid output).
 */

/** Node outline per Mermaid shape (diamond for SWITCH, circle for TERMINATE / merge, parallelogram for FORK). */
function renderShape(shape: MermaidNodeShape, w: number, h: number, style: React.CSSProperties): React.ReactNode {
    switch (shape) {
        case 'diamond':
            return <polygon points={`${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`} style={style} strokeWidth={1.5} />;
        case 'circle':
            return <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} style={style} strokeWidth={1.5} />;
        case 'parallelogram': {
            const skew = Math.min(14, w / 6);
            return <polygon points={`${skew},0 ${w},0 ${w - skew},${h} 0,${h}`} style={style} strokeWidth={1.5} />;
        }
        default: {
            const rx = shape === 'stadium' ? h / 2 : shape === 'round' ? 8 : 5;
            return <rect width={w} height={h} rx={rx} style={style} strokeWidth={1.5} />;
        }
    }
}

const MermaidBlock: React.FC<MermaidBlockProps> = ({ code }) => {

    const layout = useMemo(() => {
        const parsed = parseMermaidFlowchart(code);
        if (!parsed) return null;

        const g = new dagre.graphlib.Graph();
        g.setGraph({
            rankdir: parsed.direction,
            nodesep: 32,
            ranksep: 44,
            marginx: 16,
            marginy: 16,
        });
        g.setDefaultEdgeLabel(() => ({}));

        parsed.nodes.forEach((n) => {
            const textWidth = Math.max(Math.min(n.label.length * 9 + 28, 200), 88);
            // diamonds / circles / parallelograms need extra room so the label stays inside the outline
            const width = n.shape === 'diamond' ? textWidth + 36
                : n.shape === 'circle' ? (n.label ? Math.max(textWidth, 64) : 24)
                    : n.shape === 'parallelogram' ? textWidth + 20
                        : textWidth;
            const height = n.shape === 'diamond' ? 52 : n.shape === 'circle' ? (n.label ? 44 : 24) : 36;
            g.setNode(n.id, { label: n.label, width, height, shape: n.shape });
        });

        parsed.edges.forEach((e) => {
            g.setEdge(e.from, e.to, { label: e.label, dashed: e.dashed });
        });

        dagre.layout(g);

        const positionedNodes = parsed.nodes.map((n) => {
            const nodeWithPos = g.node(n.id);
            return {
                ...n,
                x: nodeWithPos.x,
                y: nodeWithPos.y,
                width: nodeWithPos.width,
                height: nodeWithPos.height,
            };
        });

        const positionedEdges = parsed.edges.map((e, idx) => {
            const edgeData = g.edge(e.from, e.to);
            return {
                ...e,
                id: `e-${idx}`,
                points: edgeData?.points || [],
            };
        });

        const graphInfo = g.graph();
        return {
            width: Math.max((graphInfo.width || 300) + 32, 220),
            height: Math.max((graphInfo.height || 160) + 32, 100),
            nodes: positionedNodes,
            edges: positionedEdges,
        };
    }, [code]);

    if (!layout) {
        return (
            <pre
                style={{
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: 8,
                    padding: '10px 12px',
                    fontSize: 11,
                    fontFamily: 'monospace',
                    color: 'var(--text-primary)',
                    overflowX: 'auto',
                    margin: '8px 0',
                }}
            >
                {code}
            </pre>
        );
    }

    // Theme-aware through the surrounding [data-mode] root; CSS properties (not SVG attributes) so var() resolves everywhere.
    const nodeStyle = { fill: 'var(--cm-surface-2)', stroke: 'var(--cm-ai)' };
    const textStyle = { fill: 'var(--cm-text-primary)' };
    const edgeStyle = { stroke: 'var(--cm-text-muted)' };

    return (
        <div
            style={{
                background: 'var(--bg-primary)',
                borderRadius: 8,
                padding: '12px',
                margin: '8px 0',
                overflow: 'auto',
                textAlign: 'center',
                border: '1px solid var(--border-primary)',
            }}
        >
            <svg
                width={layout.width}
                height={layout.height}
                viewBox={`0 0 ${layout.width} ${layout.height}`}
                style={{ maxWidth: '100%', height: 'auto' }}
            >
                <defs>
                    <marker
                        id="mmd-arrow"
                        viewBox="0 0 10 10"
                        refX="8"
                        refY="5"
                        markerWidth="6"
                        markerHeight="6"
                        orient="auto-start-reverse"
                    >
                        <path d="M 0 1 L 10 5 L 0 9 z" style={{ fill: edgeStyle.stroke }} />
                    </marker>
                </defs>

                {/* Edges */}
                {layout.edges.map((e) => {
                    if (e.points.length < 2) return null;
                    const d = e.points
                        .map((pt: { x: number; y: number }, i: number) =>
                            `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`
                        )
                        .join(' ');
                    const mid = e.points[Math.floor(e.points.length / 2)];
                    return (
                        <g key={e.id}>
                            <path
                                d={d}
                                fill="none"
                                style={edgeStyle}
                                strokeWidth={1.6}
                                strokeDasharray={e.dashed ? '4,4' : undefined}
                                markerEnd="url(#mmd-arrow)"
                            />
                            {e.label && mid && (
                                <text
                                    x={mid.x}
                                    y={mid.y - 5}
                                    textAnchor="middle"
                                    style={textStyle}
                                    fontSize={10}
                                    fontFamily="sans-serif"
                                >
                                    {e.label}
                                </text>
                            )}
                        </g>
                    );
                })}

                {/* Nodes */}
                {layout.nodes.map((n) => (
                    <g key={n.id} transform={`translate(${n.x - n.width / 2}, ${n.y - n.height / 2})`}>
                        {renderShape(n.shape, n.width, n.height, nodeStyle)}
                        {n.label && (
                            <text
                                x={n.width / 2}
                                y={n.height / 2 + 4}
                                textAnchor="middle"
                                style={textStyle}
                                fontSize={11}
                                fontWeight={600}
                                fontFamily="sans-serif"
                            >
                                {n.label}
                            </text>
                        )}
                    </g>
                ))}
            </svg>
        </div>
    );
};

export default MermaidBlock;
