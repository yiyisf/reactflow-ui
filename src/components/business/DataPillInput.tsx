import React, { useState, useRef, useMemo, useEffect } from 'react';
import type { BusinessStep, PillToken } from '../../stepmodel/types';
import { ActionRegistry, defaultActionRegistry } from '../../actions/registry';
import { buildPillGroups, describePillRef } from '../../stepmodel/pills';
import { PillPicker } from './PillPicker';
import { useBusinessEditor } from './BusinessEditorContext';
import { CircleAlert, Link, Tag } from 'lucide-react';

export interface DataPillInputProps {
  value: any;
  onChange: (val: any) => void;
  placeholder?: string;
  multiline?: boolean;
  upstreamSteps: BusinessStep[];
  registry?: ActionRegistry;
  /** 工作流全局入参声明；不传时取 StepFlowEditor 提供的上下文 */
  workflowInputParams?: any[];
  disabled?: boolean;
  /** 初始即展开「插入数据」选择面板（例如下拉字段刚切换为动态取值时） */
  defaultShowPicker?: boolean;
  /** 输入框 id（供 <label htmlFor> 关联） */
  id?: string;
  /** 无可见 label 时的无障碍名称 */
  ariaLabel?: string;
  /** 输入有误时描边标红，并通过 aria-describedby 关联错误说明 */
  invalid?: boolean;
  describedBy?: string;
  /** 等宽字体（表达式、脚本） */
  mono?: boolean;
}

const isJsonValue = (v: unknown): v is object => v !== null && typeof v === 'object';

function tryParseJson(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export const DataPillInput: React.FC<DataPillInputProps> = ({
  value,
  onChange,
  placeholder,
  multiline = false,
  upstreamSteps,
  registry = defaultActionRegistry,
  workflowInputParams,
  disabled = false,
  defaultShowPicker = false,
  id,
  ariaLabel,
  invalid = false,
  describedBy,
  mono = false,
}) => {
  const ctx = useBusinessEditor();
  const inputParams = workflowInputParams ?? ctx.workflowInputParams;
  const [showPicker, setShowPicker] = useState(defaultShowPicker);
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  // 对象 / 数组入参：以 JSON 文本编辑，合法时按对象保存（不再显示成 "[object Object]"）
  const [jsonMode] = useState(() => isJsonValue(value));
  const [jsonDraft, setJsonDraft] = useState(() => (isJsonValue(value) ? JSON.stringify(value, null, 2) : ''));
  const [jsonError, setJsonError] = useState<string | null>(null);

  // 外部值变化（撤销、AI 修改）时同步 JSON 草稿；自己输入引起的变化不覆盖草稿（避免光标跳动）
  useEffect(() => {
    if (!jsonMode) return;
    const parsed = tryParseJson(jsonDraft);
    const current = parsed.ok ? parsed.value : jsonDraft;
    if (JSON.stringify(current) !== JSON.stringify(value)) {
      setJsonDraft(isJsonValue(value) ? JSON.stringify(value, null, 2) : String(value ?? ''));
      setJsonError(null);
    }
    // 只在外部值变化时比较
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, jsonMode]);

  const strValue = jsonMode ? jsonDraft : value !== undefined && value !== null ? String(value) : '';

  const emit = (text: string) => {
    if (!jsonMode) {
      onChange(text);
      return;
    }
    setJsonDraft(text);
    const parsed = tryParseJson(text);
    if (parsed.ok && isJsonValue(parsed.value)) {
      setJsonError(null);
      onChange(parsed.value);
    } else {
      // 不是合法 JSON 时按文本保存（可含数据胶囊），并提示
      setJsonError(parsed.ok ? '需要是 JSON 对象或数组' : parsed.error);
      onChange(text);
    }
  };

  const groups = useMemo(
    () => buildPillGroups(upstreamSteps, registry, inputParams),
    [upstreamSteps, registry, inputParams]
  );

  // 解析 ${...} 引用，翻译成可读标签
  const pillTokens = useMemo(() => {
    const tokens: { raw: string; ref: string; label: string }[] = [];
    for (const match of strValue.matchAll(/\$\{([^}]+)\}/g)) {
      const ref = match[1].trim();
      tokens.push({ raw: match[0], ref, label: describePillRef(ref, groups) });
    }
    return tokens;
  }, [strValue, groups]);

  const handleSelectPill = (pill: PillToken) => {
    const tokenStr = `\${${pill.rawRef}}`;
    const input = inputRef.current;
    if (input) {
      const start = input.selectionStart ?? strValue.length;
      const end = input.selectionEnd ?? strValue.length;
      emit(strValue.substring(0, start) + tokenStr + strValue.substring(end));
      setTimeout(() => {
        input.focus();
        input.setSelectionRange(start + tokenStr.length, start + tokenStr.length);
      }, 0);
    } else {
      emit(strValue ? `${strValue} ${tokenStr}` : tokenStr);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // @ 只用于唤起选择面板，不写进值里
    if (e.key === '@' && !disabled) {
      e.preventDefault();
      setShowPicker(true);
    }
  };

  const errorId = id ? `${id}-json-error` : undefined;
  const describedByIds = [describedBy, jsonError ? errorId : undefined].filter(Boolean).join(' ') || undefined;
  const fieldStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: 'var(--text-primary)',
    fontSize: 13,
    fontFamily: mono || jsonMode ? 'var(--cm-font-mono, monospace)' : 'inherit',
  };
  const isMultiline = multiline || jsonMode;

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        width: '100%',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: isMultiline ? 'flex-start' : 'center',
          gap: 6,
          background: 'var(--bg-secondary)',
          border: `1px solid ${invalid || jsonError ? 'var(--cm-status-failed)' : 'var(--border-secondary)'}`,
          borderRadius: 6,
          padding: '4px 8px',
          transition: 'border-color 0.15s ease',
        }}
      >
        {isMultiline ? (
          <textarea
            ref={inputRef}
            id={id}
            aria-label={ariaLabel}
            aria-invalid={invalid || !!jsonError || undefined}
            aria-describedby={describedByIds}
            disabled={disabled}
            value={strValue}
            placeholder={placeholder || '输入内容，或按 @ 插入上游数据胶囊…'}
            rows={jsonMode ? Math.min(8, Math.max(3, strValue.split('\n').length)) : 3}
            onChange={(e) => emit(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5 }}
          />
        ) : (
          <input
            ref={inputRef}
            id={id}
            aria-label={ariaLabel}
            aria-invalid={invalid || undefined}
            aria-describedby={describedByIds}
            type="text"
            disabled={disabled}
            value={strValue}
            placeholder={placeholder || '输入内容，或按 @ 插入数据胶囊…'}
            onChange={(e) => emit(e.target.value)}
            onKeyDown={handleKeyDown}
            style={fieldStyle}
          />
        )}

        <button
          type="button"
          disabled={disabled}
          onClick={() => setShowPicker(!showPicker)}
          aria-expanded={showPicker}
          title="选择并插入上游数据胶囊（也可按 @）"
          style={{
            background: showPicker ? 'var(--cm-data-tint)' : 'var(--bg-tertiary)',
            color: showPicker ? 'var(--cm-data)' : 'var(--text-secondary)',
            border: `1px solid ${showPicker ? 'var(--cm-data)' : 'var(--border-primary)'}`,
            borderRadius: 4,
            padding: '2px 8px',
            fontSize: 11,
            cursor: disabled ? 'not-allowed' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            flexShrink: 0,
            transition: 'all 0.15s ease',
          }}
        >
          <Tag size={14} strokeWidth={1.75} aria-hidden="true" />
          <span>插入数据</span>
        </button>
      </div>

      {jsonError && (
        <div id={errorId} style={{ fontSize: 11, color: 'var(--cm-status-failed)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <CircleAlert size={14} strokeWidth={1.75} aria-hidden="true" />
          JSON 格式有误（{jsonError}）：修正后按对象保存，否则按文本保存
        </div>
      )}

      {pillTokens.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', padding: '2px 2px' }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>已引用数据:</span>
          {pillTokens.map((t, idx) => (
            <span
              key={`${t.ref}_${idx}`}
              style={{
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 12,
                background: 'var(--cm-data-tint)',
                color: 'var(--cm-data)',
                border: '1px solid color-mix(in srgb, var(--cm-data) 35%, transparent)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontWeight: 500,
              }}
              title={`原始引用表达式: ${t.raw}`}
            >
              <Link size={14} strokeWidth={1.75} aria-hidden="true" />
              <span>{t.label}</span>
            </span>
          ))}
        </div>
      )}

      {showPicker && (
        <PillPicker
          upstreamSteps={upstreamSteps}
          workflowInputParams={inputParams}
          registry={registry}
          onSelect={handleSelectPill}
          onClose={() => {
            setShowPicker(false);
            inputRef.current?.focus();
          }}
        />
      )}
    </div>
  );
};
