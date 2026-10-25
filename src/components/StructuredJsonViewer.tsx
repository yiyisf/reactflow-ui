import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface StructuredJsonViewerProps {
  data: any;
  /** Optional taskReferenceName to generate `${taskRef.output.xxx}` expressions on hover */
  taskReferenceName?: string;
  /** Either 'output' or 'input' (or 'workflow.input') for expression path generation */
  expressionScope?: 'output' | 'input' | 'workflow.input';
  maxHeight?: string;
}

interface TreeNodeProps {
  keyName?: string | number;
  value: any;
  path: string;
  depth: number;
  defaultExpanded: boolean;
  forceExpandAll: boolean | null;
  searchQuery: string;
  onCopyExpr: (expr: string) => void;
  copiedPath: string | null;
  buildExpr: (path: string) => string | null;
}

const TreeNode: React.FC<TreeNodeProps> = ({
  keyName,
  value,
  path,
  depth,
  defaultExpanded,
  forceExpandAll,
  searchQuery,
  onCopyExpr,
  copiedPath,
  buildExpr,
}) => {
  const isObject = value !== null && typeof value === 'object';
  const isArray = Array.isArray(value);
  const [localExpanded, setLocalExpanded] = useState(defaultExpanded);

  const expanded = forceExpandAll !== null ? forceExpandAll : localExpanded;
  const expr = buildExpr(path);

  const matchesSearch = useMemo(() => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    if (keyName !== undefined && String(keyName).toLowerCase().includes(q)) return true;
    try {
      return JSON.stringify(value).toLowerCase().includes(q);
    } catch {
      return false;
    }
  }, [keyName, value, searchQuery]);

  if (!matchesSearch) return null;

  if (!isObject) {
    let valColor = 'var(--text-primary)';
    let formattedVal = String(value);
    if (typeof value === 'string') {
      valColor = 'var(--cm-status-success)';
      formattedVal = `"${value}"`;
    } else if (typeof value === 'number') {
      valColor = 'var(--cm-status-warning)';
    } else if (typeof value === 'boolean') {
      valColor = 'var(--cm-cat-human)';
    } else if (value === null || value === undefined) {
      valColor = 'var(--text-muted)';
      formattedVal = 'null';
    }

    return (
      <div
        className="sjson-row"
        style={{
          paddingLeft: `${depth * 14}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '6px',
          paddingTop: '2px',
          paddingBottom: '2px',
          borderRadius: '4px',
          fontSize: '12px',
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        }}
      >
        <div style={{ wordBreak: 'break-all', lineHeight: 1.45 }}>
          {keyName !== undefined && (
            <span style={{ color: 'var(--color-accent)' }}>
              {typeof keyName === 'number' ? `[${keyName}]` : `"${keyName}"`}
              <span style={{ color: 'var(--text-muted)' }}>: </span>
            </span>
          )}
          <span style={{ color: valColor }}>{formattedVal}</span>
        </div>
        {expr && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCopyExpr(expr);
            }}
            title={`复制表达式 ${expr}`}
            style={{
              flexShrink: 0,
              fontSize: '10px',
              padding: '1px 6px',
              borderRadius: '4px',
              border: '1px solid color-mix(in srgb, var(--cm-data) 30%, transparent)',
              background:
                copiedPath === expr ? 'color-mix(in srgb, var(--cm-status-success) 20%, transparent)' : 'color-mix(in srgb, var(--cm-data) 8%, transparent)',
              color: copiedPath === expr ? 'var(--cm-status-success)' : 'var(--cm-data)',
              cursor: 'pointer',
              opacity: 0.85,
              fontFamily: 'inherit',
            }}
          >
            {copiedPath === expr ? '已复制' : '${} 引用'}
          </button>
        )}
      </div>
    );
  }

  const entries = isArray
    ? (value as any[]).map((v, i) => [i, v] as const)
    : Object.entries(value as Record<string, any>);
  const bracketOpen = isArray ? '[' : '{';
  const bracketClose = isArray ? ']' : '}';
  const summaryLabel = isArray ? `${entries.length} items` : `${entries.length} keys`;

  return (
    <div>
      <div
        onClick={() => setLocalExpanded(!expanded)}
        style={{
          paddingLeft: `${depth * 14}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '6px',
          paddingTop: '2px',
          paddingBottom: '2px',
          cursor: 'pointer',
          userSelect: 'none',
          fontSize: '12px',
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ color: 'var(--text-muted)', width: '10px', display: 'inline-flex' }}>
            {expanded ? <ChevronDown size={10} strokeWidth={1.75} aria-hidden="true" /> : <ChevronRight size={10} strokeWidth={1.75} aria-hidden="true" />}
          </span>
          {keyName !== undefined && (
            <span style={{ color: 'var(--color-accent)' }}>
              {typeof keyName === 'number' ? `[${keyName}]` : `"${keyName}"`}
              <span style={{ color: 'var(--text-muted)' }}>: </span>
            </span>
          )}
          <span style={{ color: 'var(--text-muted)' }}>
            {bracketOpen}
            {!expanded && (
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', margin: '0 4px' }}>
                {summaryLabel}
              </span>
            )}
            {!expanded && bracketClose}
          </span>
        </div>
        {expr && path && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCopyExpr(expr);
            }}
            title={`复制对象引用 ${expr}`}
            style={{
              flexShrink: 0,
              fontSize: '10px',
              padding: '1px 6px',
              borderRadius: '4px',
              border: '1px solid color-mix(in srgb, var(--cm-data) 25%, transparent)',
              background:
                copiedPath === expr ? 'color-mix(in srgb, var(--cm-status-success) 20%, transparent)' : 'color-mix(in srgb, var(--cm-data) 6%, transparent)',
              color: copiedPath === expr ? 'var(--cm-status-success)' : 'var(--cm-data)',
              cursor: 'pointer',
              opacity: 0.75,
              fontFamily: 'inherit',
            }}
          >
            {copiedPath === expr ? '已复制' : '${} 引用'}
          </button>
        )}
      </div>

      {expanded && (
        <div>
          {entries.map(([k, v]) => {
            const childPath =
              typeof k === 'number'
                ? `${path}[${k}]`
                : path
                ? `${path}.${k}`
                : String(k);
            return (
              <TreeNode
                key={String(k)}
                keyName={k}
                value={v}
                path={childPath}
                depth={depth + 1}
                defaultExpanded={depth < 1}
                forceExpandAll={forceExpandAll}
                searchQuery={searchQuery}
                onCopyExpr={onCopyExpr}
                copiedPath={copiedPath}
                buildExpr={buildExpr}
              />
            );
          })}
          <div
            style={{
              paddingLeft: `${depth * 14 + 14}px`,
              color: 'var(--text-muted)',
              fontSize: '12px',
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            }}
          >
            {bracketClose}
          </div>
        </div>
      )}
    </div>
  );
};

export const StructuredJsonViewer: React.FC<StructuredJsonViewerProps> = ({
  data,
  taskReferenceName,
  expressionScope = 'output',
  maxHeight = '420px',
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [forceExpandAll, setForceExpandAll] = useState<boolean | null>(null);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [rawMode, setRawMode] = useState(false);

  const buildExpr = (path: string): string | null => {
    if (!path) return null;
    if (expressionScope === 'workflow.input') {
      return `\${workflow.input.${path}}`;
    }
    if (!taskReferenceName) return null;
    return `\${${taskReferenceName}.${expressionScope}.${path}}`;
  };

  const handleCopyExpr = (expr: string) => {
    navigator.clipboard.writeText(expr);
    setCopiedPath(expr);
    setTimeout(() => setCopiedPath(null), 1600);
  };

  const isEmpty =
    data === null ||
    data === undefined ||
    (typeof data === 'object' && Object.keys(data).length === 0);

  if (isEmpty) {
    return (
      <div
        style={{
          padding: '20px',
          textAlign: 'center',
          color: 'var(--text-secondary)',
          fontSize: '12px',
          background: 'color-mix(in srgb, var(--cm-surface-1) 35%, transparent)',
          borderRadius: '8px',
          border: '1px solid var(--border-primary)',
        }}
      >
        暂无数据 (Empty Payload)
      </div>
    );
  }

  return (
    <div
      style={{
        borderRadius: '8px',
        border: '1px solid var(--border-primary)',
        background: 'var(--cm-overlay)',
        overflow: 'hidden',
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 10px',
          borderBottom: '1px solid var(--border-primary)',
          background: 'var(--cm-overlay)',
        }}
      >
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="检索字段名或值..."
          style={{
            flex: 1,
            padding: '4px 8px',
            borderRadius: '5px',
            border: '1px solid var(--border-primary)',
            background: 'var(--cm-overlay)',
            color: 'var(--text-primary)',
            fontSize: '11px',
            outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={() => setForceExpandAll(true)}
          style={{
            fontSize: '10px',
            padding: '3px 7px',
            borderRadius: '4px',
            border: '1px solid var(--border-primary)',
            background: 'transparent',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          全部展开
        </button>
        <button
          type="button"
          onClick={() => setForceExpandAll(false)}
          style={{
            fontSize: '10px',
            padding: '3px 7px',
            borderRadius: '4px',
            border: '1px solid var(--border-primary)',
            background: 'transparent',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          折叠
        </button>
        <button
          type="button"
          onClick={() => setRawMode(!rawMode)}
          style={{
            fontSize: '10px',
            padding: '3px 7px',
            borderRadius: '4px',
            border: '1px solid var(--border-primary)',
            background: rawMode ? 'color-mix(in srgb, var(--cm-data) 18%, transparent)' : 'transparent',
            color: rawMode ? 'var(--cm-data)' : 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          {rawMode ? '树形视图' : 'RAW'}
        </button>
      </div>

      {/* Body */}
      <div
        style={{
          padding: '10px 12px',
          maxHeight,
          overflowY: 'auto',
          overflowX: 'auto',
        }}
      >
        {rawMode ? (
          <pre
            style={{
              margin: 0,
              fontSize: '11px',
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              color: 'var(--text-primary)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {JSON.stringify(data, null, 2)}
          </pre>
        ) : (
          <TreeNode
            value={data}
            path=""
            depth={0}
            defaultExpanded={true}
            forceExpandAll={forceExpandAll}
            searchQuery={searchQuery}
            onCopyExpr={handleCopyExpr}
            copiedPath={copiedPath}
            buildExpr={buildExpr}
          />
        )}
      </div>
    </div>
  );
};

export default StructuredJsonViewer;
