/**
 * A small jq interpreter for the in-browser sandbox (JSON_JQ_TRANSFORM).
 *
 * It covers the jq that workflow authors actually write: paths, iteration, pipes, comma, object / array construction,
 * arithmetic and comparison, `and/or/not`, `//`, `if-then-elif-else-end`, `as $x`, `reduce`, string interpolation, optional
 * `?`, and the common builtins (see BUILTINS). Anything outside that raises a JqError that says which syntax is not
 * supported, so the sandbox reports a failure instead of inventing a result.
 */

export class JqError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'JqError';
    }
}

type Json = unknown;
type Env = Record<string, Json>;

// ───────────────────────────── lexer ─────────────────────────────

type Tok =
    | { t: 'num'; v: number }
    | { t: 'str'; parts: (string | Node)[] }
    | { t: 'id'; v: string }
    | { t: 'var'; v: string }
    | { t: 'field'; v: string }
    | { t: 'op'; v: string }
    | { t: 'eof' };

const KEYWORDS = new Set(['if', 'then', 'elif', 'else', 'end', 'as', 'and', 'or', 'reduce', 'foreach', 'try', 'catch', 'def', 'label', 'import', 'include']);

function lex(src: string): Tok[] {
    const out: Tok[] = [];
    let i = 0;
    const isIdStart = (c: string) => /[A-Za-z_]/.test(c);
    const isId = (c: string) => /[A-Za-z0-9_]/.test(c);
    while (i < src.length) {
        const c = src[i];
        if (/\s/.test(c)) { i++; continue; }
        if (c === '#') { while (i < src.length && src[i] !== '\n') i++; continue; }
        if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
            const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i))!;
            out.push({ t: 'num', v: Number(m[0]) });
            i += m[0].length;
            continue;
        }
        if (c === '"') {
            const [parts, end] = lexString(src, i + 1);
            out.push({ t: 'str', parts });
            i = end;
            continue;
        }
        if (c === '$') {
            let j = i + 1;
            if (src.startsWith('__loc__', j)) throw new JqError('不支持 $__loc__');
            while (j < src.length && isId(src[j])) j++;
            if (j === i + 1) throw new JqError(`第 ${i + 1} 个字符：$ 后缺少变量名`);
            out.push({ t: 'var', v: src.slice(i + 1, j) });
            i = j;
            continue;
        }
        if (c === '.' && isIdStart(src[i + 1] ?? '')) {
            let j = i + 1;
            while (j < src.length && isId(src[j])) j++;
            out.push({ t: 'field', v: src.slice(i + 1, j) });
            i = j;
            continue;
        }
        if (isIdStart(c)) {
            let j = i;
            while (j < src.length && (isId(src[j]) || (src[j] === ':' && src[j + 1] === ':'))) j += src[j] === ':' ? 2 : 1;
            out.push({ t: 'id', v: src.slice(i, j) });
            i = j;
            continue;
        }
        const two = src.slice(i, i + 2);
        if (['==', '!=', '<=', '>=', '//', '..', '?/', '|=', '+=', '-=', '*=', '/=', '%='].includes(two)) {
            if (two === '?/') throw new JqError('不支持 ?// 运算符');
            if (two.endsWith('=') && two !== '==' && two !== '!=' && two !== '<=' && two !== '>=') {
                throw new JqError(`不支持赋值运算符 ${two}`);
            }
            out.push({ t: 'op', v: two });
            i += 2;
            continue;
        }
        if ('.|,()[]{}:;+-*/%<>?='.includes(c)) {
            if (c === '=') throw new JqError('不支持赋值运算符 =，比较请用 ==');
            out.push({ t: 'op', v: c });
            i++;
            continue;
        }
        if (c === '@') throw new JqError('不支持 @base64 / @csv 等格式化字符串');
        throw new JqError(`第 ${i + 1} 个字符 "${c}" 无法识别`);
    }
    out.push({ t: 'eof' });
    return out;
}

/** Lex a string literal starting after the opening quote; returns parts (text or parsed interpolation) and end index. */
function lexString(src: string, start: number): [(string | Node)[], number] {
    const parts: (string | Node)[] = [];
    let buf = '';
    let i = start;
    while (i < src.length) {
        const c = src[i];
        if (c === '"') {
            if (buf || parts.length === 0) parts.push(buf);
            return [parts, i + 1];
        }
        if (c === '\\') {
            const n = src[i + 1];
            if (n === '(') {
                // interpolation: find the matching paren, respecting nested strings
                let depth = 1;
                let j = i + 2;
                let inStr = false;
                while (j < src.length && depth > 0) {
                    const d = src[j];
                    if (inStr) {
                        if (d === '\\') j++;
                        else if (d === '"') inStr = false;
                    } else if (d === '"') inStr = true;
                    else if (d === '(') depth++;
                    else if (d === ')') depth--;
                    j++;
                }
                if (depth !== 0) throw new JqError('字符串插值 \\( 缺少右括号');
                if (buf) parts.push(buf);
                buf = '';
                parts.push(parse(src.slice(i + 2, j - 1)));
                i = j;
                continue;
            }
            const esc: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', '"': '"', '\\': '\\', '/': '/' };
            if (n === 'u') {
                buf += String.fromCharCode(parseInt(src.slice(i + 2, i + 6), 16));
                i += 6;
                continue;
            }
            if (!(n in esc)) throw new JqError(`字符串里的转义 \\${n} 无效`);
            buf += esc[n];
            i += 2;
            continue;
        }
        buf += c;
        i++;
    }
    throw new JqError('字符串缺少结尾的引号');
}

// ───────────────────────────── parser ─────────────────────────────

type Node =
    | { k: 'identity' }
    | { k: 'recurse' }
    | { k: 'lit'; v: Json }
    | { k: 'str'; parts: (string | Node)[] }
    | { k: 'var'; name: string }
    | { k: 'index'; target: Node; key: Node }
    | { k: 'slice'; target: Node; from: Node | null; to: Node | null }
    | { k: 'iterate'; target: Node }
    | { k: 'optional'; body: Node }
    | { k: 'pipe'; left: Node; right: Node }
    | { k: 'comma'; left: Node; right: Node }
    | { k: 'bin'; op: string; left: Node; right: Node }
    | { k: 'neg'; body: Node }
    | { k: 'array'; body: Node | null }
    | { k: 'object'; entries: { key: Node; value: Node | null }[] }
    | { k: 'if'; cond: Node; then: Node; elifs: { cond: Node; then: Node }[]; else: Node | null }
    | { k: 'as'; source: Node; name: string; body: Node }
    | { k: 'reduce'; source: Node; name: string; init: Node; update: Node }
    | { k: 'call'; name: string; args: Node[] };

function parse(src: string): Node {
    const toks = lex(src);
    let p = 0;
    const peek = () => toks[p];
    const isOp = (v: string) => peek().t === 'op' && (peek() as { v: string }).v === v;
    const isId = (v: string) => peek().t === 'id' && (peek() as { v: string }).v === v;
    const expectOp = (v: string) => {
        if (!isOp(v)) throw new JqError(`语法错误：这里应该是 "${v}"`);
        p++;
    };
    const expectId = (v: string) => {
        if (!isId(v)) throw new JqError(`语法错误：这里应该是 "${v}"`);
        p++;
    };

    function parsePipe(): Node {
        let left = parseComma();
        if (isId('as')) {
            p++;
            const v = peek();
            if (v.t !== 'var') throw new JqError('as 后面应是 $变量');
            p++;
            expectOp('|');
            return { k: 'as', source: left, name: v.v, body: parsePipe() };
        }
        while (isOp('|')) {
            p++;
            left = { k: 'pipe', left, right: parsePipeRhs() };
        }
        return left;
    }
    // right side of a pipe may itself bind variables: `.a as $x | ...`
    function parsePipeRhs(): Node {
        const left = parseComma();
        if (isId('as')) {
            p++;
            const v = peek();
            if (v.t !== 'var') throw new JqError('as 后面应是 $变量');
            p++;
            expectOp('|');
            return { k: 'as', source: left, name: v.v, body: parsePipe() };
        }
        return left;
    }
    function parseComma(): Node {
        let left = parseAlt();
        while (isOp(',')) {
            p++;
            left = { k: 'comma', left, right: parseAlt() };
        }
        return left;
    }
    function parseAlt(): Node {
        let left = parseOr();
        while (isOp('//')) {
            p++;
            left = { k: 'bin', op: '//', left, right: parseOr() };
        }
        return left;
    }
    function parseOr(): Node {
        let left = parseAnd();
        while (isId('or')) {
            p++;
            left = { k: 'bin', op: 'or', left, right: parseAnd() };
        }
        return left;
    }
    function parseAnd(): Node {
        let left = parseCmp();
        while (isId('and')) {
            p++;
            left = { k: 'bin', op: 'and', left, right: parseCmp() };
        }
        return left;
    }
    function parseCmp(): Node {
        const left = parseAdd();
        for (const op of ['==', '!=', '<=', '>=', '<', '>']) {
            if (isOp(op)) {
                p++;
                return { k: 'bin', op, left, right: parseAdd() };
            }
        }
        return left;
    }
    function parseAdd(): Node {
        let left = parseMul();
        while (isOp('+') || isOp('-')) {
            const op = (toks[p++] as { v: string }).v;
            left = { k: 'bin', op, left, right: parseMul() };
        }
        return left;
    }
    function parseMul(): Node {
        let left = parseUnary();
        while (isOp('*') || isOp('/') || isOp('%')) {
            const op = (toks[p++] as { v: string }).v;
            left = { k: 'bin', op, left, right: parseUnary() };
        }
        return left;
    }
    function parseUnary(): Node {
        if (isOp('-')) {
            p++;
            return { k: 'neg', body: parseUnary() };
        }
        return parsePostfix(parsePrimary());
    }
    function parsePostfix(node: Node): Node {
        for (;;) {
            const t = peek();
            if (t.t === 'field') {
                p++;
                node = { k: 'index', target: node, key: { k: 'lit', v: t.v } };
            } else if (isOp('.') && toks[p + 1].t === 'str') {
                p++;
                const s = toks[p++] as { parts: (string | Node)[] };
                node = { k: 'index', target: node, key: { k: 'str', parts: s.parts } };
            } else if (isOp('.') && toks[p + 1].t === 'op' && (toks[p + 1] as { v: string }).v === '[') {
                p++;
            } else if (isOp('[')) {
                p++;
                if (isOp(']')) {
                    p++;
                    node = { k: 'iterate', target: node };
                } else if (isOp(':')) {
                    p++;
                    const to = parsePipe();
                    expectOp(']');
                    node = { k: 'slice', target: node, from: null, to };
                } else {
                    const key = parsePipe();
                    if (isOp(':')) {
                        p++;
                        const to = isOp(']') ? null : parsePipe();
                        expectOp(']');
                        node = { k: 'slice', target: node, from: key, to };
                    } else {
                        expectOp(']');
                        node = { k: 'index', target: node, key };
                    }
                }
            } else if (isOp('?')) {
                p++;
                node = { k: 'optional', body: node };
            } else {
                return node;
            }
        }
    }
    function parsePrimary(): Node {
        const t = peek();
        if (t.t === 'num') { p++; return { k: 'lit', v: t.v }; }
        if (t.t === 'str') { p++; return { k: 'str', parts: t.parts }; }
        if (t.t === 'var') { p++; return { k: 'var', name: t.v }; }
        if (t.t === 'field') { p++; return { k: 'index', target: { k: 'identity' }, key: { k: 'lit', v: t.v } }; }
        if (t.t === 'op') {
            if (t.v === '.') {
                p++;
                if (peek().t === 'str') {
                    const s = toks[p++] as { parts: (string | Node)[] };
                    return { k: 'index', target: { k: 'identity' }, key: { k: 'str', parts: s.parts } };
                }
                return { k: 'identity' };
            }
            if (t.v === '..') { p++; return { k: 'recurse' }; }
            if (t.v === '(') {
                p++;
                const e = parsePipe();
                expectOp(')');
                return e;
            }
            if (t.v === '[') {
                p++;
                if (isOp(']')) { p++; return { k: 'array', body: null }; }
                const e = parsePipe();
                expectOp(']');
                return { k: 'array', body: e };
            }
            if (t.v === '{') {
                p++;
                return parseObject();
            }
        }
        if (t.t === 'id') {
            if (t.v === 'true' || t.v === 'false' || t.v === 'null') {
                p++;
                return { k: 'lit', v: t.v === 'null' ? null : t.v === 'true' };
            }
            if (t.v === 'if') return parseIf();
            if (t.v === 'reduce') return parseReduce();
            if (KEYWORDS.has(t.v)) throw new JqError(`不支持 ${t.v} 语法`);
            p++;
            const args: Node[] = [];
            if (isOp('(')) {
                p++;
                args.push(parsePipe());
                while (isOp(';')) {
                    p++;
                    args.push(parsePipe());
                }
                expectOp(')');
            }
            return { k: 'call', name: t.v, args };
        }
        if (t.t === 'eof') throw new JqError('表达式不完整');
        throw new JqError(`语法错误：意外的 "${(t as { v?: string }).v ?? t.t}"`);
    }
    function parseObject(): Node {
        const entries: { key: Node; value: Node | null }[] = [];
        while (!isOp('}')) {
            const t = peek();
            let key: Node;
            let shorthand: Node | null = null;
            if (t.t === 'id' || t.t === 'field') {
                p++;
                const name = t.t === 'field' ? t.v : t.v;
                key = { k: 'lit', v: name };
                shorthand = { k: 'index', target: { k: 'identity' }, key: { k: 'lit', v: name } };
            } else if (t.t === 'var') {
                p++;
                key = { k: 'lit', v: t.v };
                shorthand = { k: 'var', name: t.v };
            } else if (t.t === 'str') {
                p++;
                key = { k: 'str', parts: t.parts };
                shorthand = { k: 'index', target: { k: 'identity' }, key };
            } else if (t.t === 'num') {
                throw new JqError('对象的键不能是数字');
            } else if (isOp('(')) {
                p++;
                key = parsePipe();
                expectOp(')');
            } else {
                throw new JqError('对象构造语法错误');
            }
            let value: Node | null = shorthand;
            if (isOp(':')) {
                p++;
                value = parseAlt();
            } else if (!shorthand) {
                throw new JqError('对象的计算键后面需要 ": 值"');
            }
            entries.push({ key, value });
            if (isOp(',')) p++;
            else break;
        }
        expectOp('}');
        return { k: 'object', entries };
    }
    function parseIf(): Node {
        expectId('if');
        const cond = parsePipe();
        expectId('then');
        const then = parsePipe();
        const elifs: { cond: Node; then: Node }[] = [];
        while (isId('elif')) {
            p++;
            const c = parsePipe();
            expectId('then');
            elifs.push({ cond: c, then: parsePipe() });
        }
        let els: Node | null = null;
        if (isId('else')) {
            p++;
            els = parsePipe();
        }
        expectId('end');
        return { k: 'if', cond, then, elifs, else: els };
    }
    function parseReduce(): Node {
        expectId('reduce');
        const source = parsePostfix(parsePrimary());
        expectId('as');
        const v = peek();
        if (v.t !== 'var') throw new JqError('reduce ... as 后面应是 $变量');
        p++;
        expectOp('(');
        const init = parsePipe();
        expectOp(';');
        const update = parsePipe();
        expectOp(')');
        return { k: 'reduce', source, name: v.v, init, update };
    }

    const node = parsePipe();
    if (peek().t !== 'eof') throw new JqError('表达式在末尾有多余内容');
    return node;
}

// ───────────────────────────── evaluation ─────────────────────────────

const typeName = (v: Json): string =>
    v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'object' ? 'object' : typeof v === 'number' ? 'number' : typeof v === 'string' ? 'string' : 'boolean';

const truthy = (v: Json) => v !== null && v !== false && v !== undefined;

const ORDER: Record<string, number> = { null: 0, boolean: 1, number: 2, string: 3, array: 4, object: 5 };

function compare(a: Json, b: Json): number {
    const ta = typeName(a);
    const tb = typeName(b);
    if (ta !== tb) {
        if (ta === 'boolean' && tb === 'boolean') return 0;
        return ORDER[ta] - ORDER[tb];
    }
    switch (ta) {
        case 'null': return 0;
        case 'boolean': return (a ? 1 : 0) - (b ? 1 : 0);
        case 'number': return (a as number) - (b as number);
        case 'string': return (a as string) < (b as string) ? -1 : (a as string) > (b as string) ? 1 : 0;
        case 'array': {
            const x = a as Json[];
            const y = b as Json[];
            for (let i = 0; i < Math.min(x.length, y.length); i++) {
                const c = compare(x[i], y[i]);
                if (c) return c;
            }
            return x.length - y.length;
        }
        default: {
            const x = a as Record<string, Json>;
            const y = b as Record<string, Json>;
            const kx = Object.keys(x).sort();
            const ky = Object.keys(y).sort();
            const c = compare(kx, ky);
            if (c) return c;
            for (const k of kx) {
                const d = compare(x[k], y[k]);
                if (d) return d;
            }
            return 0;
        }
    }
}

const equal = (a: Json, b: Json) => compare(a, b) === 0;
const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

function deepMerge(a: Record<string, Json>, b: Record<string, Json>): Record<string, Json> {
    const out: Record<string, Json> = { ...a };
    for (const [k, v] of Object.entries(b)) {
        const cur = out[k];
        out[k] =
            cur && v && typeName(cur) === 'object' && typeName(v) === 'object'
                ? deepMerge(cur as Record<string, Json>, v as Record<string, Json>)
                : v;
    }
    return out;
}

function arith(op: string, a: Json, b: Json): Json {
    const ta = typeName(a);
    const tb = typeName(b);
    switch (op) {
        case '+':
            if (a === null) return b;
            if (b === null) return a;
            if (ta === 'number' && tb === 'number') return (a as number) + (b as number);
            if (ta === 'string' && tb === 'string') return (a as string) + (b as string);
            if (ta === 'array' && tb === 'array') return [...(a as Json[]), ...(b as Json[])];
            if (ta === 'object' && tb === 'object') return { ...(a as object), ...(b as object) };
            break;
        case '-':
            if (ta === 'number' && tb === 'number') return (a as number) - (b as number);
            if (ta === 'array' && tb === 'array') return (a as Json[]).filter((x) => !(b as Json[]).some((y) => equal(x, y)));
            break;
        case '*':
            if (ta === 'number' && tb === 'number') return (a as number) * (b as number);
            if (ta === 'object' && tb === 'object') return deepMerge(a as Record<string, Json>, b as Record<string, Json>);
            if (ta === 'string' && tb === 'number') return (b as number) > 0 ? (a as string).repeat(Math.floor(b as number)) : null;
            break;
        case '/':
            if (ta === 'number' && tb === 'number') {
                if (b === 0) throw new JqError('除数为 0');
                return (a as number) / (b as number);
            }
            if (ta === 'string' && tb === 'string') return (a as string).split(b as string);
            break;
        case '%':
            if (ta === 'number' && tb === 'number') {
                if (Math.trunc(b as number) === 0) throw new JqError('取模的除数为 0');
                return Math.trunc(a as number) % Math.trunc(b as number);
            }
            break;
    }
    throw new JqError(`${ta} 和 ${tb} 不能做 ${op} 运算`);
}

function index(target: Json, key: Json): Json {
    if (target === null) return null;
    if (typeof key === 'string') {
        if (typeName(target) !== 'object') throw new JqError(`不能用字符串 "${key}" 索引 ${typeName(target)}`);
        const v = (target as Record<string, Json>)[key];
        return v === undefined ? null : v;
    }
    if (typeof key === 'number') {
        if (!Array.isArray(target)) throw new JqError(`不能用数字索引 ${typeName(target)}`);
        const i = Math.floor(key) < 0 ? target.length + Math.floor(key) : Math.floor(key);
        return target[i] === undefined ? null : target[i];
    }
    throw new JqError(`不能用 ${typeName(key)} 作为索引`);
}

function iterate(v: Json): Json[] {
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') return Object.values(v as Record<string, Json>);
    throw new JqError(`不能遍历 ${typeName(v)}（.[] 只能用于数组或对象）`);
}

function length(v: Json): number {
    switch (typeName(v)) {
        case 'null': return 0;
        case 'boolean': throw new JqError('boolean 没有长度');
        case 'number': return Math.abs(v as number);
        case 'string': return [...(v as string)].length;
        case 'array': return (v as Json[]).length;
        default: return Object.keys(v as object).length;
    }
}

const toStr = (v: Json) => (typeof v === 'string' ? v : JSON.stringify(v));

function contains(a: Json, b: Json): boolean {
    const ta = typeName(a);
    if (ta !== typeName(b)) throw new JqError(`${ta} 与 ${typeName(b)} 不能做 contains`);
    if (ta === 'string') return (a as string).includes(b as string);
    if (ta === 'array') return (b as Json[]).every((y) => (a as Json[]).some((x) => contains(x, y) || equal(x, y)));
    if (ta === 'object') {
        return Object.entries(b as Record<string, Json>).every(
            ([k, v]) => k in (a as object) && contains((a as Record<string, Json>)[k], v),
        );
    }
    return equal(a, b);
}

/** Evaluate a node against one input; returns every output. */
function ev(n: Node, input: Json, env: Env): Json[] {
    switch (n.k) {
        case 'identity':
            return [input];
        case 'recurse': {
            const out: Json[] = [];
            const walk = (v: Json) => {
                out.push(v);
                if (v && typeof v === 'object') for (const c of iterate(v)) walk(c);
            };
            walk(input);
            return out;
        }
        case 'lit':
            return [n.v];
        case 'str': {
            let results = [''];
            for (const part of n.parts) {
                if (typeof part === 'string') {
                    results = results.map((r) => r + part);
                } else {
                    const vals = ev(part, input, env);
                    results = results.flatMap((r) => vals.map((v) => r + toStr(v)));
                }
            }
            return results;
        }
        case 'var':
            if (!(n.name in env)) throw new JqError(`变量 $${n.name} 未定义`);
            return [env[n.name]];
        case 'index':
            return ev(n.target, input, env).flatMap((t) => ev(n.key, input, env).map((k) => index(t, k)));
        case 'slice':
            return ev(n.target, input, env).map((t) => {
                if (t === null) return null;
                const from = n.from ? (ev(n.from, input, env)[0] as number) : 0;
                const to = n.to ? (ev(n.to, input, env)[0] as number) : undefined;
                if (typeof t === 'string' || Array.isArray(t)) return t.slice(from ?? 0, to ?? undefined);
                throw new JqError(`不能切片 ${typeName(t)}`);
            });
        case 'iterate':
            return ev(n.target, input, env).flatMap(iterate);
        case 'optional':
            try {
                return ev(n.body, input, env);
            } catch (e) {
                if (e instanceof JqError && !String(e.message).startsWith('不支持')) return [];
                throw e;
            }
        case 'pipe':
            return ev(n.left, input, env).flatMap((v) => ev(n.right, v, env));
        case 'comma':
            return [...ev(n.left, input, env), ...ev(n.right, input, env)];
        case 'neg':
            return ev(n.body, input, env).map((v) => {
                if (typeof v !== 'number') throw new JqError(`不能对 ${typeName(v)} 取负`);
                return -v;
            });
        case 'bin': {
            if (n.op === 'and' || n.op === 'or') {
                return ev(n.left, input, env).flatMap((l) => {
                    if (n.op === 'and' && !truthy(l)) return [false];
                    if (n.op === 'or' && truthy(l)) return [true];
                    return ev(n.right, input, env).map((r) => truthy(r));
                });
            }
            if (n.op === '//') {
                let left: Json[] = [];
                try {
                    left = ev(n.left, input, env).filter(truthy);
                } catch (e) {
                    if (!(e instanceof JqError)) throw e;
                }
                return left.length ? left : ev(n.right, input, env);
            }
            const rights = ev(n.right, input, env);
            const lefts = ev(n.left, input, env);
            const out: Json[] = [];
            for (const r of rights) {
                for (const l of lefts) {
                    switch (n.op) {
                        case '==': out.push(equal(l, r)); break;
                        case '!=': out.push(!equal(l, r)); break;
                        case '<': out.push(compare(l, r) < 0); break;
                        case '<=': out.push(compare(l, r) <= 0); break;
                        case '>': out.push(compare(l, r) > 0); break;
                        case '>=': out.push(compare(l, r) >= 0); break;
                        default: out.push(arith(n.op, l, r));
                    }
                }
            }
            return out;
        }
        case 'array':
            return [n.body ? ev(n.body, input, env) : []];
        case 'object': {
            let objs: Record<string, Json>[] = [{}];
            for (const e of n.entries) {
                const keys = ev(e.key, input, env);
                const vals = e.value ? ev(e.value, input, env) : [];
                const next: Record<string, Json>[] = [];
                for (const o of objs) {
                    for (const k of keys) {
                        if (typeof k !== 'string') throw new JqError(`对象的键必须是字符串，得到 ${typeName(k)}`);
                        for (const v of vals) next.push({ ...o, [k]: v });
                    }
                }
                objs = next;
            }
            return objs;
        }
        case 'if':
            return ev(n.cond, input, env).flatMap((c) => {
                if (truthy(c)) return ev(n.then, input, env);
                for (const el of n.elifs) {
                    const cs = ev(el.cond, input, env);
                    if (cs.some(truthy)) return ev(el.then, input, env);
                }
                return n.else ? ev(n.else, input, env) : [input];
            });
        case 'as':
            return ev(n.source, input, env).flatMap((v) => ev(n.body, input, { ...env, [n.name]: v }));
        case 'reduce': {
            let acc = ev(n.init, input, env);
            for (const item of ev(n.source, input, env)) {
                acc = acc.flatMap((a) => ev(n.update, a, { ...env, [n.name]: item }));
            }
            return acc;
        }
        case 'call':
            return callBuiltin(n.name, n.args, input, env);
    }
}

const one = (n: Node, input: Json, env: Env): Json => {
    const v = ev(n, input, env);
    if (v.length !== 1) throw new JqError('参数必须恰好产生一个值');
    return v[0];
};

const needType = (v: Json, t: string, fn: string) => {
    if (typeName(v) !== t) throw new JqError(`${fn} 需要 ${t}，得到 ${typeName(v)}`);
};

function sortedBy(arr: Json[], keyOf: (v: Json) => Json): Json[] {
    return arr
        .map((v, i) => ({ v, k: keyOf(v), i }))
        .sort((a, b) => compare(a.k, b.k) || a.i - b.i)
        .map((x) => x.v);
}

/** Builtins: name/arity → implementation. */
function callBuiltin(name: string, args: Node[], input: Json, env: Env): Json[] {
    const sig = `${name}/${args.length}`;
    const arr = (fn: string) => {
        needType(input, 'array', fn);
        return input as Json[];
    };
    switch (sig) {
        case 'empty/0': return [];
        case 'not/0': return [!truthy(input)];
        case 'error/0': throw new JqError(toStr(input));
        case 'error/1': throw new JqError(toStr(one(args[0], input, env)));
        case 'length/0': return [length(input)];
        case 'type/0': return [typeName(input)];
        case 'keys/0':
        case 'keys_unsorted/0':
            if (Array.isArray(input)) return [input.map((_, i) => i)];
            needType(input, 'object', name);
            return [name === 'keys' ? Object.keys(input as object).sort() : Object.keys(input as object)];
        case 'values/0': return input === null ? [] : [input];
        case 'has/1': {
            const k = one(args[0], input, env);
            if (Array.isArray(input)) return [typeof k === 'number' && k >= 0 && k < input.length];
            needType(input, 'object', 'has');
            return [Object.prototype.hasOwnProperty.call(input, k as string)];
        }
        case 'in/1': {
            const o = one(args[0], input, env);
            return callBuiltin('has', [{ k: 'lit', v: input }], o, env);
        }
        case 'map/1': return [arr('map').flatMap((v) => ev(args[0], v, env))];
        case 'map_values/1': {
            if (Array.isArray(input)) return [input.map((v) => ev(args[0], v, env)[0]).filter((v) => v !== undefined)];
            needType(input, 'object', 'map_values');
            const out: Record<string, Json> = {};
            for (const [k, v] of Object.entries(input as Record<string, Json>)) {
                const r = ev(args[0], v, env);
                if (r.length) out[k] = r[0];
            }
            return [out];
        }
        case 'select/1': return ev(args[0], input, env).some(truthy) ? [input] : [];
        case 'recurse/0': return ev({ k: 'recurse' }, input, env);
        case 'add/0': {
            const items = iterate(input);
            return [items.reduce((a: Json, b) => (a === undefined ? b : arith('+', a, b)), undefined as Json) ?? null];
        }
        case 'any/0': return [iterate(input).some(truthy)];
        case 'all/0': return [iterate(input).every(truthy)];
        case 'any/1': return [iterate(input).some((v) => ev(args[0], v, env).some(truthy))];
        case 'all/1': return [iterate(input).every((v) => ev(args[0], v, env).every(truthy))];
        case 'range/1': {
            const n = one(args[0], input, env) as number;
            return Array.from({ length: Math.max(0, Math.ceil(n)) }, (_, i) => i);
        }
        case 'range/2': {
            const a = one(args[0], input, env) as number;
            const b = one(args[1], input, env) as number;
            const out: number[] = [];
            for (let i = a; i < b; i++) out.push(i);
            return out;
        }
        case 'floor/0': needType(input, 'number', 'floor'); return [Math.floor(input as number)];
        case 'ceil/0': needType(input, 'number', 'ceil'); return [Math.ceil(input as number)];
        case 'round/0': needType(input, 'number', 'round'); return [Math.round(input as number)];
        case 'sqrt/0': needType(input, 'number', 'sqrt'); return [Math.sqrt(input as number)];
        case 'fabs/0':
        case 'abs/0': needType(input, 'number', name); return [Math.abs(input as number)];
        case 'tostring/0': return [toStr(input)];
        case 'tonumber/0': {
            if (typeof input === 'number') return [input];
            const n = Number(input);
            if (typeof input !== 'string' || input.trim() === '' || Number.isNaN(n)) throw new JqError(`无法把 ${toStr(input)} 转成数字`);
            return [n];
        }
        case 'tojson/0': return [JSON.stringify(input)];
        case 'fromjson/0':
            needType(input, 'string', 'fromjson');
            try {
                return [JSON.parse(input as string)];
            } catch {
                throw new JqError(`fromjson 解析失败：${input as string}`);
            }
        case 'ascii_downcase/0': needType(input, 'string', name); return [(input as string).toLowerCase()];
        case 'ascii_upcase/0': needType(input, 'string', name); return [(input as string).toUpperCase()];
        case 'ltrimstr/1': {
            const s = one(args[0], input, env);
            return [typeof input === 'string' && typeof s === 'string' && input.startsWith(s) ? input.slice(s.length) : input];
        }
        case 'rtrimstr/1': {
            const s = one(args[0], input, env);
            return [typeof input === 'string' && typeof s === 'string' && s && input.endsWith(s) ? input.slice(0, -s.length) : input];
        }
        case 'trim/0': needType(input, 'string', 'trim'); return [(input as string).trim()];
        case 'startswith/1': needType(input, 'string', name); return [(input as string).startsWith(one(args[0], input, env) as string)];
        case 'endswith/1': needType(input, 'string', name); return [(input as string).endsWith(one(args[0], input, env) as string)];
        case 'split/1': needType(input, 'string', 'split'); return [(input as string).split(one(args[0], input, env) as string)];
        case 'join/1': {
            const sep = one(args[0], input, env) as string;
            return [arr('join').map((v) => (v === null ? '' : typeof v === 'object' ? (() => { throw new JqError('join 只能连接字符串、数字与布尔值'); })() : String(v))).join(sep)];
        }
        case 'test/1':
        case 'test/2': {
            needType(input, 'string', 'test');
            const re = one(args[0], input, env) as string;
            const flags = args[1] ? (one(args[1], input, env) as string).replace(/[^gimsuy]/g, '') : '';
            return [new RegExp(re, flags.replace('g', '')).test(input as string)];
        }
        case 'sub/2':
        case 'gsub/2': {
            needType(input, 'string', name);
            const re = new RegExp(one(args[0], input, env) as string, name === 'gsub' ? 'g' : '');
            return [(input as string).replace(re, one(args[1], input, env) as string)];
        }
        case 'contains/1': return [contains(input, one(args[0], input, env))];
        case 'inside/1': return [contains(one(args[0], input, env), input)];
        case 'sort/0': return [sortedBy(arr('sort'), (v) => v)];
        case 'sort_by/1': return [sortedBy(arr('sort_by'), (v) => ev(args[0], v, env))];
        case 'group_by/1': {
            const sorted = sortedBy(arr('group_by'), (v) => ev(args[0], v, env));
            const groups: Json[][] = [];
            let lastKey: Json = undefined;
            for (const v of sorted) {
                const k = ev(args[0], v, env);
                if (groups.length && equal(k, lastKey)) groups[groups.length - 1].push(v);
                else groups.push([v]);
                lastKey = k;
            }
            return [groups];
        }
        case 'unique/0':
        case 'unique_by/1': {
            const keyOf = (v: Json) => (args[0] ? ev(args[0], v, env) : v);
            const sorted = sortedBy(arr(name), keyOf);
            const out: Json[] = [];
            let lastKey: Json = undefined;
            for (const v of sorted) {
                const k = keyOf(v);
                if (!out.length || !equal(k, lastKey)) out.push(v);
                lastKey = k;
            }
            return [out];
        }
        case 'min/0':
        case 'max/0':
        case 'min_by/1':
        case 'max_by/1': {
            const a = arr(name);
            if (!a.length) return [null];
            const keyOf = (v: Json) => (args[0] ? ev(args[0], v, env) : v);
            const sorted = sortedBy(a, keyOf);
            return [name.startsWith('min') ? sorted[0] : sorted[sorted.length - 1]];
        }
        case 'reverse/0':
            if (typeof input === 'string') return [[...input].reverse().join('')];
            return [input === null ? [] : [...arr('reverse')].reverse()];
        case 'first/0': return [index(input, 0)];
        case 'last/0': return [index(input, -1)];
        case 'first/1': return ev(args[0], input, env).slice(0, 1);
        case 'last/1': return ev(args[0], input, env).slice(-1);
        case 'limit/2': {
            const n = one(args[0], input, env) as number;
            return n <= 0 ? [] : ev(args[1], input, env).slice(0, n);
        }
        case 'nth/1': return [index(input, one(args[0], input, env))];
        case 'flatten/0':
        case 'flatten/1': {
            const depth = args[0] ? (one(args[0], input, env) as number) : 1e9;
            const flat = (a: Json[], d: number): Json[] => a.flatMap((v) => (Array.isArray(v) && d > 0 ? flat(v, d - 1) : [v]));
            return [flat(arr('flatten'), depth)];
        }
        case 'to_entries/0':
            needType(input, 'object', 'to_entries');
            return [Object.entries(input as Record<string, Json>).map(([key, value]) => ({ key, value }))];
        case 'from_entries/0': {
            const out: Record<string, Json> = {};
            for (const e of arr('from_entries') as Record<string, Json>[]) {
                const k = e.key ?? e.k ?? e.name ?? e.Name ?? e.Key ?? e.K;
                out[typeof k === 'string' ? k : JSON.stringify(k)] = 'value' in e ? e.value : e.v ?? e.Value ?? null;
            }
            return [out];
        }
        case 'with_entries/1': {
            const entries = callBuiltin('to_entries', [], input, env)[0] as Json[];
            const mapped = entries.flatMap((e) => ev(args[0], e, env));
            return callBuiltin('from_entries', [], mapped, env);
        }
        case 'tostream/0':
        case 'paths/0':
        case 'getpath/1':
        case 'setpath/2':
        case 'del/1':
        case 'path/1':
        case 'env/0':
        case 'input/0':
        case 'inputs/0':
        case 'now/0':
            throw new JqError(`不支持 ${name}（沙箱只实现了常用的 jq 子集）`);
        case 'isnull/0': return [input === null];
        case 'arrays/0': return Array.isArray(input) ? [input] : [];
        case 'objects/0': return typeName(input) === 'object' ? [input] : [];
        case 'strings/0': return typeof input === 'string' ? [input] : [];
        case 'numbers/0': return typeof input === 'number' ? [input] : [];
        case 'booleans/0': return typeof input === 'boolean' ? [input] : [];
        case 'nulls/0': return input === null ? [input] : [];
        case 'iterables/0': return Array.isArray(input) || typeName(input) === 'object' ? [input] : [];
        case 'scalars/0': return Array.isArray(input) || typeName(input) === 'object' ? [] : [input];
        case 'indices/1':
        case 'index/1':
        case 'rindex/1': {
            const t = one(args[0], input, env);
            let idx: number[] = [];
            if (typeof input === 'string' && typeof t === 'string' && t) {
                for (let i = input.indexOf(t); i >= 0; i = input.indexOf(t, i + 1)) idx.push(i);
            } else if (Array.isArray(input)) {
                idx = input.map((v, i) => (equal(v, t) ? i : -1)).filter((i) => i >= 0);
            } else if (input === null) return [null];
            if (name === 'indices') return [idx];
            if (!idx.length) return [null];
            return [name === 'index' ? idx[0] : idx[idx.length - 1]];
        }
        case 'tojson/1':
        case 'ascii/0':
            break;
    }
    throw new JqError(`不支持函数 ${name}${args.length ? `/${args.length}` : ''}（沙箱只实现了常用的 jq 子集）`);
}

/** Run a jq program against one input. Returns all outputs; throws JqError on syntax / runtime errors. */
export function runJq(query: string, input: unknown): unknown[] {
    const program = parse(query);
    return ev(program, clone(input), {}).map(clone);
}
