/**
 * curl 命令 → ImportedOperation[]（恒为 0 或 1 个接口）。
 * 支持：-X、-H（多个）、-d / --data / --data-raw / --data-binary、-u、--url、-G、行尾 `\` 续行、
 * 单引号 / 双引号 / `$'…'`（浏览器「复制为 cURL」）。不执行任何命令。
 */

import type { ImportedBody, ImportedOperation, ImportedParam, ParseResult } from './types';
import { collectWarnings, dropContentHeaders, findHeader, finishOperation, queryParamsFromString, schemaWithDefaults } from './common';
import { inputPlaceholder, isSensitiveName } from './sensitive';
import { safeDecode, slugify, splitUrl } from './util';

/** 把命令行切成 token（兼容续行与常见引号写法） */
export function tokenizeCurl(input: string): string[] {
    const text = input.replace(/\\\r?\n/g, ' ');
    const tokens: string[] = [];
    let cur = '';
    let has = false;
    let i = 0;
    const push = () => {
        if (has) tokens.push(cur);
        cur = '';
        has = false;
    };
    while (i < text.length) {
        const ch = text[i];
        if (/\s/.test(ch)) {
            push();
            i++;
        } else if (ch === "'") {
            has = true;
            const end = text.indexOf("'", i + 1);
            const stop = end < 0 ? text.length : end;
            cur += text.slice(i + 1, stop);
            i = stop + 1;
        } else if (ch === '$' && text[i + 1] === "'") {
            // ANSI-C 引号：支持常见转义
            has = true;
            i += 2;
            while (i < text.length && text[i] !== "'") {
                if (text[i] === '\\' && i + 1 < text.length) {
                    const n = text[i + 1];
                    const map: Record<string, string> = { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"' };
                    if (n === 'u' && /^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) {
                        cur += String.fromCharCode(parseInt(text.slice(i + 2, i + 6), 16));
                        i += 6;
                        continue;
                    }
                    if (n === 'x' && /^[0-9a-fA-F]{2}$/.test(text.slice(i + 2, i + 4))) {
                        cur += String.fromCharCode(parseInt(text.slice(i + 2, i + 4), 16));
                        i += 4;
                        continue;
                    }
                    cur += map[n] ?? n;
                    i += 2;
                } else {
                    cur += text[i];
                    i++;
                }
            }
            i++;
        } else if (ch === '"') {
            has = true;
            i++;
            while (i < text.length && text[i] !== '"') {
                if (text[i] === '\\' && i + 1 < text.length && '"\\$`'.includes(text[i + 1])) {
                    cur += text[i + 1];
                    i += 2;
                } else {
                    cur += text[i];
                    i++;
                }
            }
            i++;
        } else if (ch === '\\' && i + 1 < text.length) {
            has = true;
            cur += text[i + 1];
            i += 2;
        } else {
            has = true;
            cur += ch;
            i++;
        }
    }
    push();
    return tokens;
}

const LONG_VALUE_FLAGS = new Set([
    '--request', '--header', '--data', '--data-raw', '--data-binary', '--data-ascii', '--data-urlencode', '--json',
    '--user', '--url', '--cookie', '--user-agent', '--output', '--max-time', '--connect-timeout', '--referer',
    '--proxy', '--form', '--cert', '--key', '--cacert', '--retry', '--write-out', '--upload-file', '--resolve',
]);
const SHORT_VALUE_FLAGS = new Set(['X', 'H', 'd', 'u', 'b', 'A', 'e', 'F', 'o', 'm', 'x', 'w', 'E', 'T']);

/** 提示用的 curl 示例（对话框 placeholder 使用） */
export const CURL_SAMPLE = `curl -X POST 'https://api.example.com/v1/tickets' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer <token>' \\
  -d '{"title":"磁盘告警","priority":"high"}'`;

/** 解析一条 curl 命令 */
export function parseCurl(command: string): ParseResult {
    try {
        let tokens = tokenizeCurl(String(command ?? ''));
        while (tokens.length > 0 && (tokens[0] === '$' || tokens[0] === 'sudo')) tokens = tokens.slice(1);
        if (tokens.length === 0 || tokens[0] !== 'curl') {
            return { ok: false, format: 'curl', error: '不是 curl 命令（应以 curl 开头）' };
        }

        const warnings: string[] = [];
        const headers: Record<string, string> = {};
        const dataParts: string[] = [];
        // 用对象承载状态：闭包内赋值不会被 TS 的流分析当作常量折叠
        const st = {
            method: undefined as string | undefined,
            url: undefined as string | undefined,
            useGet: false,
            head: false,
            basicAuth: false,
            cookie: false,
            unsupportedBody: undefined as string | undefined,
        };

        const takeData = (value: string, flag: string) => {
            if (flag === '--data-urlencode') {
                st.unsupportedBody = '--data-urlencode';
                return;
            }
            if (value.startsWith('@')) {
                st.unsupportedBody = `${flag} ${value}（读取本地文件）`;
                return;
            }
            dataParts.push(value);
        };

        const handle = (flag: string, value: string | undefined) => {
            switch (flag) {
                case '-X': case '--request':
                    if (value) st.method = value.toUpperCase();
                    break;
                case '-H': case '--header': {
                    if (!value) break;
                    const at = value.indexOf(':');
                    if (at > 0) headers[value.slice(0, at).trim()] = value.slice(at + 1).trim();
                    break;
                }
                case '-d': case '--data': case '--data-raw': case '--data-binary': case '--data-ascii': case '--data-urlencode':
                    if (value !== undefined) takeData(value, flag.length === 2 ? '-d' : flag);
                    break;
                case '--json':
                    if (value !== undefined) takeData(value, '--json');
                    if (!findHeader(headers, 'content-type')) headers['Content-Type'] = 'application/json';
                    break;
                case '-u': case '--user':
                    st.basicAuth = true;
                    break;
                case '-b': case '--cookie':
                    st.cookie = true;
                    break;
                case '--url':
                    if (value) st.url = value;
                    break;
                case '-F': case '--form':
                    st.unsupportedBody = '表单上传（-F）';
                    break;
                default:
                    break;
            }
        };

        for (let i = 1; i < tokens.length; i++) {
            const t = tokens[i];
            if (t === '-G' || t === '--get') {
                st.useGet = true;
            } else if (t === '-I' || t === '--head') {
                st.head = true;
            } else if (t.startsWith('--')) {
                const eq = t.indexOf('=');
                const name = eq > 0 ? t.slice(0, eq) : t;
                if (LONG_VALUE_FLAGS.has(name)) {
                    const value = eq > 0 ? t.slice(eq + 1) : tokens[++i];
                    handle(name, value);
                }
            } else if (t.startsWith('-') && t.length > 1) {
                const letter = t[1];
                if (SHORT_VALUE_FLAGS.has(letter)) {
                    const value = t.length > 2 ? t.slice(2) : tokens[++i];
                    handle(`-${letter}`, value);
                } else if (t.slice(1).includes('G')) {
                    st.useGet = true;
                } else if (t.slice(1).includes('I')) {
                    st.head = true;
                }
                // 其余（-s -S -L -k -v -i …）不影响请求内容
            } else if (st.url === undefined) {
                st.url = t;
            }
        }

        let url = st.url;
        if (!url) return { ok: false, format: 'curl', error: 'curl 命令里没有找到 URL' };

        // URL 补全协议、剥离 userinfo
        if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url) && !url.startsWith('${')) {
            url = `http://${url}`;
            warnings.push('URL 没有协议，已按 http:// 处理，请核对');
        }
        const userinfo = /^([a-z][a-z0-9+.-]*:\/\/)([^/@\s]*)@/i.exec(url);
        if (userinfo) {
            url = url.replace(userinfo[0], userinfo[1]);
            st.basicAuth = true;
        }

        if (st.basicAuth) headers.Authorization = '';
        if (st.cookie && !findHeader(headers, 'cookie')) headers.Cookie = '';

        const parts = splitUrl(url);
        const params: ImportedParam[] = queryParamsFromString(parts.query, warnings);

        // ── 请求体 ──
        let body: ImportedBody | undefined;
        const dataText = dataParts.join('&');
        if (st.unsupportedBody) warnings.push(`${st.unsupportedBody} 暂不支持，请求体已忽略`);
        if (st.useGet && dataText) {
            params.push(...queryParamsFromString(dataText, warnings));
        } else if (dataText.trim()) {
            const ct = findHeader(headers, 'content-type');
            let parsed: unknown;
            let isJson = false;
            try {
                parsed = JSON.parse(dataText);
                isJson = parsed !== null && typeof parsed === 'object';
            } catch {
                isJson = false;
            }
            if (isJson) {
                body = { contentType: ct || 'application/json', schema: schemaWithDefaults(parsed, warnings) };
            } else {
                const contentType = ct || 'application/x-www-form-urlencoded';
                body = { contentType, schema: { type: 'string', default: maskFormSecrets(dataText, contentType, warnings) } };
            }
        }

        const resolvedMethod = st.method ?? (st.head ? 'HEAD' : body && !st.useGet ? 'POST' : 'GET');
        const op: ImportedOperation = finishOperation({
            id: `${resolvedMethod.toLowerCase()}_${slugify(parts.path)}`,
            method: resolvedMethod,
            baseUrl: parts.baseUrl,
            path: parts.path,
            tags: [],
            params,
            headers: dropContentHeaders(headers),
            body,
            warnings,
        });
        return { ok: true, format: 'curl', operations: [op], warnings: collectWarnings([op]) };
    } catch (e) {
        return { ok: false, format: 'curl', error: `curl 解析失败：${e instanceof Error ? e.message : String(e)}` };
    }
}

/** 表单体里敏感字段（password=…）的值替换为占位 */
function maskFormSecrets(text: string, contentType: string, warnings: string[]): string {
    if (!/x-www-form-urlencoded/i.test(contentType)) return text;
    return text
        .split('&')
        .map((pair) => {
            const eq = pair.indexOf('=');
            if (eq <= 0) return pair;
            const name = safeDecode(pair.slice(0, eq));
            if (isSensitiveName(name) && !pair.slice(eq + 1).includes('${')) {
                warnings.push(`请求体字段 ${name} 疑似敏感信息，已替换为 ${inputPlaceholder(name)}`);
                return `${pair.slice(0, eq)}=${inputPlaceholder(name)}`;
            }
            return pair;
        })
        .join('&');
}
