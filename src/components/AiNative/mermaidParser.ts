/**
 * Mermaid flowchart parser for the chat's lightweight diagram renderer (MermaidBlock).
 *
 * Covers the flowchart subset that both the IDE itself (src/utils/workflowToMermaid.ts) and
 * models commonly write:
 * - header `flowchart TD` / `graph LR` (optional trailing `;`), statements split by newline or `;`
 * - node shapes: `[x]` `("x")` `(["x"])` `(("x"))` `{"x"}` `{{x}}` `[/"x"/]` `[\x\]` `[(x)]` `[[x]]` `>x]`
 * - links: `-->` `---` `-.->` `==>` `--x` `--o`, labels as `-->|x|`, `-- "x" -->`, `-- x -->`,
 *   `-. x .->`, `== x ==>`
 * - chains `A --> B --> C` and groups `A & B --> C`
 * - Unicode (e.g. Chinese) node ids
 * Styling statements (subgraph / end / style / classDef / class / click / linkStyle / direction) are skipped.
 */

export type MermaidNodeShape = 'rect' | 'round' | 'stadium' | 'circle' | 'diamond' | 'parallelogram';

export interface MermaidNode {
    id: string;
    label: string;
    shape: MermaidNodeShape;
}

export interface MermaidEdge {
    from: string;
    to: string;
    label?: string;
    dashed?: boolean;
}

export interface MermaidFlowchart {
    direction: 'TB' | 'LR';
    nodes: MermaidNode[];
    edges: MermaidEdge[];
}

/** Shape openers, longest first so `((` wins over `(` and `[/` over `[`. */
const SHAPES: Array<{ open: string; close: string[]; shape: MermaidNodeShape }> = [
    { open: '(((', close: [')))'], shape: 'circle' },
    { open: '((', close: ['))'], shape: 'circle' },
    { open: '([', close: ['])'], shape: 'stadium' },
    { open: '[[', close: [']]'], shape: 'rect' },
    { open: '[(', close: [')]'], shape: 'rect' },
    { open: '[/', close: ['/]', '\\]'], shape: 'parallelogram' },
    { open: '[\\', close: ['\\]', '/]'], shape: 'parallelogram' },
    { open: '{{', close: ['}}'], shape: 'diamond' },
    { open: '[', close: [']'], shape: 'rect' },
    { open: '(', close: [')'], shape: 'round' },
    { open: '{', close: ['}'], shape: 'diamond' },
    { open: '>', close: [']'], shape: 'rect' },
];

const ID_RE = /^[\p{L}\p{N}_$](?:[\p{L}\p{N}_$.]|-(?=[\p{L}\p{N}_$]))*/u;
/** Plain link, optionally followed by `|label|` */
const PLAIN_LINK_RE = /^<?(?:-{2,}>|-{3,}|={2,}>|={3,}|-\.+->|-\.+-|--[xo]|==[xo])/;
/** Link with the label written inside it: `-- text -->`, `-. text .->`, `== text ==>` */
const TEXT_LINK_RE = /^(--|==|-\.)\s*(?:"([^"]*)"|([^"|]+?))\s*(-{2,}>|-{3,}|\.-+>|\.-+|={2,}>|={3,}|--[xo])/;
const SKIP_STATEMENT_RE = /^(?:subgraph|end|style|classDef|class|click|linkStyle|direction)\b/i;

const cleanLabel = (raw: string): string =>
    raw
        .trim()
        .replace(/^["'`]|["'`]$/g, '')
        .replace(/<br\s*\/?>/gi, ' ')
        .trim();

/** Splits on `;` / newline, ignoring separators inside quotes or brackets. */
function splitStatements(code: string): string[] {
    const out: string[] = [];
    let cur = '';
    let quote = false;
    let depth = 0;
    for (const ch of code) {
        if (ch === '"') quote = !quote;
        if (!quote) {
            if (ch === '[' || ch === '(' || ch === '{') depth++;
            else if ((ch === ']' || ch === ')' || ch === '}') && depth > 0) depth--;
        }
        if (!quote && depth === 0 && (ch === ';' || ch === '\n')) {
            out.push(cur);
            cur = '';
            continue;
        }
        if (ch === '\n') {
            // a newline inside an unbalanced bracket still ends the statement (malformed input)
            out.push(cur);
            cur = '';
            quote = false;
            depth = 0;
            continue;
        }
        cur += ch;
    }
    out.push(cur);
    return out.map(s => s.trim()).filter(s => s && !s.startsWith('%%'));
}

export function parseMermaidFlowchart(rawCode: string): MermaidFlowchart | null {
    const statements = splitStatements(rawCode ?? '');
    if (statements.length === 0) return null;

    const headerMatch = statements[0].match(/^(?:graph|flowchart)(?:\s+(TB|TD|BT|RL|LR))?\s*$/i);
    if (!headerMatch) return null;
    const dirRaw = (headerMatch[1] || 'TD').toUpperCase();
    const direction: 'TB' | 'LR' = dirRaw === 'LR' || dirRaw === 'RL' ? 'LR' : 'TB';

    const nodeMap = new Map<string, MermaidNode>();
    const edges: MermaidEdge[] = [];

    const declare = (id: string, label: string | undefined, shape: MermaidNodeShape | undefined) => {
        const existing = nodeMap.get(id);
        if (!existing) {
            nodeMap.set(id, { id, label: label ?? id, shape: shape ?? 'rect' });
        } else if (label !== undefined || shape !== undefined) {
            // later full declarations win over earlier bare references
            nodeMap.set(id, { id, label: label ?? existing.label, shape: shape ?? existing.shape });
        }
    };

    for (let si = 1; si < statements.length; si++) {
        const stmt = statements[si];
        if (SKIP_STATEMENT_RE.test(stmt)) continue;

        let pos = 0;
        const skipWs = () => { while (pos < stmt.length && /\s/.test(stmt[pos])) pos++; };

        /** Parses `id`, `id[label]`, … at pos; returns the id or null. */
        const parseNode = (): string | null => {
            skipWs();
            const idMatch = stmt.slice(pos).match(ID_RE);
            if (!idMatch) return null;
            const id = idMatch[0];
            pos += id.length;
            let label: string | undefined;
            let shape: MermaidNodeShape | undefined;
            const rest = stmt.slice(pos);
            const opener = SHAPES.find(s => rest.startsWith(s.open));
            if (opener) {
                let p = pos + opener.open.length;
                let text = '';
                // quoted label: read to the closing quote first (it may contain closer characters)
                const afterOpen = stmt.slice(p);
                const quoted = afterOpen.match(/^\s*"([^"]*)"\s*/);
                if (quoted) {
                    text = quoted[1];
                    p += quoted[0].length;
                }
                let closeAt = -1;
                let closer = '';
                for (const c of opener.close) {
                    const at = stmt.indexOf(c, p);
                    if (at >= 0 && (closeAt < 0 || at < closeAt)) { closeAt = at; closer = c; }
                }
                if (closeAt < 0) {
                    // unterminated shape — treat the remainder as the label
                    text = text || stmt.slice(p);
                    pos = stmt.length;
                } else {
                    if (!quoted) text = stmt.slice(p, closeAt);
                    pos = closeAt + closer.length;
                }
                label = cleanLabel(text);
                shape = opener.shape;
            }
            // `:::className` suffix
            const cls = stmt.slice(pos).match(/^:::[\w-]+/);
            if (cls) pos += cls[0].length;
            declare(id, label, shape);
            return id;
        };

        const parseGroup = (): string[] => {
            const ids: string[] = [];
            const first = parseNode();
            if (!first) return ids;
            ids.push(first);
            for (;;) {
                skipWs();
                if (stmt[pos] !== '&') break;
                pos++;
                const next = parseNode();
                if (!next) break;
                ids.push(next);
            }
            return ids;
        };

        /** Parses a link at pos; returns its label/dashed or null when there is none. */
        const parseLink = (): { label?: string; dashed: boolean } | null => {
            skipWs();
            const rest = stmt.slice(pos);
            const plain = rest.match(PLAIN_LINK_RE);
            if (plain) {
                pos += plain[0].length;
                const dashed = plain[0].includes('.');
                skipWs();
                const pipe = stmt.slice(pos).match(/^\|([^|]*)\|/);
                if (pipe) {
                    pos += pipe[0].length;
                    const label = cleanLabel(pipe[1]);
                    return { label: label || undefined, dashed };
                }
                return { dashed };
            }
            const text = rest.match(TEXT_LINK_RE);
            if (text) {
                pos += text[0].length;
                const label = cleanLabel(text[2] ?? text[3] ?? '');
                return { label: label || undefined, dashed: text[1] === '-.' || text[4].includes('.') };
            }
            return null;
        };

        let left = parseGroup();
        if (left.length === 0) continue;
        for (;;) {
            const link = parseLink();
            if (!link) break;
            const right = parseGroup();
            if (right.length === 0) break;
            for (const from of left) {
                for (const to of right) {
                    edges.push({ from, to, label: link.label, dashed: link.dashed || undefined });
                }
            }
            left = right;
        }
    }

    if (nodeMap.size === 0) return null;
    return { direction, nodes: Array.from(nodeMap.values()), edges };
}
