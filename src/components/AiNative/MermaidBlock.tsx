import React, { useMemo } from 'react';
import dagre from 'dagre';
import useWorkflowStore from '../../store/workflowStore';

interface MermaidBlockProps {
    code: string;
}

interface ParsedNode {
    id: string;
    label: string;
    shape: 'rect' | 'round' | 'diamond' | 'stadium';
}

interface ParsedEdge {
    from: string;
    to: string;
    label?: string;
    dashed?: boolean;
}

/**
 * Lightweight zero-bloat Mermaid Flowchart/Graph SVG renderer powered by Dagre.
 * Eliminates ~2.5MB of heavy transitive bundles (cytoscape, katex, etc.) while
 * rendering crisp, theme-aware SVG architecture diagrams in AI chat.
 */
function parseMermaidFlowchart(rawCode: string): {
    direction: 'TB' | 'LR';
    nodes: ParsedNode[];
    edges: ParsedEdge[];
} | null {
    const lines = rawCode
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('%%'));

    if (lines.length === 0) return null;

    const header = lines[0];
    const headerMatch = header.match(/^(?:graph|flowchart)\s+(TB|TD|BT|RL|LR)?/i);
    if (!headerMatch) return null;

    const dirRaw = (headerMatch[1] || 'TD').toUpperCase();
    const direction: 'TB' | 'LR' = dirRaw === 'LR' || dirRaw === 'RL' ? 'LR' : 'TB';

    const nodeMap = new Map<string, ParsedNode>();
    const edges: ParsedEdge[] = [];

    const parseNodeToken = (token: string): string => {
        const trimmed = token.trim();
        // Match ID["Label"] or ID[Label] or ID(Label) or ID{Label} or ID([Label])
        const m =
            trimmed.match(/^([A-Za-z0-9_.-]+)\(\[([^\]]+)\]\)$/) ||
            trimmed.match(/^([A-Za-z0-9_.-]+)\{([^}]+)\}$/) ||
            trimmed.match(/^([A-Za-z0-9_.-]+)\(([^)]+)\)$/) ||
            trimmed.match(/^([A-Za-z0-9_.-]+)\[([^\]]+)\]$/) ||
            trimmed.match(/^([A-Za-z0-9_.-]+)$/);

        if (!m) {
            const fallbackId = trimmed.replace(/[^A-Za-z0-9_.-]/g, '_') || 'node';
            if (!nodeMap.has(fallbackId)) {
                nodeMap.set(fallbackId, { id: fallbackId, label: trimmed, shape: 'rect' });
            }
            return fallbackId;
        }

        const id = m[1];
        const rawLabel = (m[2] || id).replace(/^["']|["']$/g, '');
        let shape: ParsedNode['shape'] = 'rect';
        if (trimmed.includes('{')) shape = 'diamond';
        else if (trimmed.includes('([')) shape = 'stadium';
        else if (trimmed.includes('(')) shape = 'round';

        if (!nodeMap.has(id) || m[2]) {
            nodeMap.set(id, { id, label: rawLabel, shape });
        }
        return id;
    };

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (/^(?:subgraph|end|style|classDef|class|click)\b/i.test(line)) continue;

        // Match edge patterns: A -->|label| B, A -- label --> B, A -.-> B, A --> B
        const edgeMatch =
            line.match(/^(.+?)\s*(-+>|-\.-+>|=+>)\s*(?:\|([^|]+)\|)?\s*(.+)$/) ||
            line.match(/^(.+?)\s*--\s*([^-]+?)\s*-->\s*(.+)$/);

        if (edgeMatch) {
            let leftToken: string;
            let rightToken: string;
            let label: string | undefined;
            let dashed = false;

            if (edgeMatch.length === 5) {
                leftToken = edgeMatch[1];
                dashed = edgeMatch[2].includes('.');
                label = edgeMatch[3]?.trim();
                rightToken = edgeMatch[4];
            } else {
                leftToken = edgeMatch[1];
                label = edgeMatch[2]?.trim();
                rightToken = edgeMatch[3];
            }

            const fromId = parseNodeToken(leftToken);
            const toId = parseNodeToken(rightToken);
            edges.push({ from: fromId, to: toId, label, dashed });
        } else {
            parseNodeToken(line);
        }
    }

    if (nodeMap.size === 0) return null;
    return {
        direction,
        nodes: Array.from(nodeMap.values()),
        edges,
    };
}

const MermaidBlock: React.FC<MermaidBlockProps> = ({ code }) => {
    const theme = useWorkflowStore((s) => s.theme);

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
            const width = Math.max(Math.min(n.label.length * 9 + 28, 200), 88);
            const height = n.shape === 'diamond' ? 46 : 36;
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

    const isLight = theme === 'light';
    const nodeFill = isLight ? '#f8fafc' : '#1e293b';
    const nodeStroke = isLight ? '#6366f1' : '#818cf8';
    const textFill = isLight ? '#0f172a' : '#f8fafc';
    const edgeStroke = isLight ? '#64748b' : '#94a3b8';

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
                        <path d="M 0 1 L 10 5 L 0 9 z" fill={edgeStroke} />
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
                                stroke={edgeStroke}
                                strokeWidth={1.6}
                                strokeDasharray={e.dashed ? '4,4' : undefined}
                                markerEnd="url(#mmd-arrow)"
                            />
                            {e.label && mid && (
                                <text
                                    x={mid.x}
                                    y={mid.y - 5}
                                    textAnchor="middle"
                                    fill={textFill}
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
                {layout.nodes.map((n) => {
                    const rx = n.shape === 'stadium' ? 18 : n.shape === 'round' ? 8 : 5;
                    return (
                        <g key={n.id} transform={`translate(${n.x - n.width / 2}, ${n.y - n.height / 2})`}>
                            <rect
                                width={n.width}
                                height={n.height}
                                rx={rx}
                                fill={nodeFill}
                                stroke={nodeStroke}
                                strokeWidth={1.5}
                            />
                            <text
                                x={n.width / 2}
                                y={n.height / 2 + 4}
                                textAnchor="middle"
                                fill={textFill}
                                fontSize={11}
                                fontWeight={600}
                                fontFamily="sans-serif"
                            >
                                {n.label}
                            </text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
};

export default MermaidBlock;
