import React, { useState, useRef, useMemo } from 'react';
import type { BusinessStep, PillToken } from '../../stepmodel/types';
import { ActionRegistry, defaultActionRegistry } from '../../actions/registry';
import { PillPicker } from './PillPicker';

export interface DataPillInputProps {
  value: any;
  onChange: (val: any) => void;
  placeholder?: string;
  multiline?: boolean;
  upstreamSteps: BusinessStep[];
  registry?: ActionRegistry;
  workflowInputParams?: any[];
  disabled?: boolean;
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
}) => {
  const [showPicker, setShowPicker] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  const strValue = value !== undefined && value !== null ? String(value) : '';

  // Parse ${...} tokens to find human labels
  const pillTokens = useMemo(() => {
    const matches = strValue.matchAll(/\$\{([^}]+)\}/g);
    const tokens: { raw: string; ref: string; label: string }[] = [];

    for (const match of matches) {
      const full = match[0];
      const ref = match[1].trim();
      let label = ref;

      // Look up in upstream steps
      for (const step of upstreamSteps) {
        if (ref.startsWith(`${step.taskReferenceName}.output`)) {
          const action = registry.getAction(step.actionId);
          const fieldKey = ref.replace(`${step.taskReferenceName}.output.`, '');
          const out = action?.outputs.find((o) => o.key === fieldKey);
          if (out) {
            label = `${step.name || action?.name || step.taskReferenceName} · ${out.label}`;
          } else {
            label = `${step.name || step.taskReferenceName} 输出`;
          }
          break;
        }
      }

      if (ref.startsWith('workflow.input.')) {
        label = `全局入参 · ${ref.slice('workflow.input.'.length)}`;
      }

      tokens.push({ raw: full, ref, label });
    }

    return tokens;
  }, [strValue, upstreamSteps, registry]);

  const handleSelectPill = (pill: PillToken) => {
    const tokenStr = `\${${pill.rawRef}}`;
    const input = inputRef.current;
    if (input) {
      const start = input.selectionStart ?? strValue.length;
      const end = input.selectionEnd ?? strValue.length;
      const nextVal = strValue.substring(0, start) + tokenStr + strValue.substring(end);
      onChange(nextVal);
      // Restore cursor position
      setTimeout(() => {
        input.focus();
        input.setSelectionRange(start + tokenStr.length, start + tokenStr.length);
      }, 0);
    } else {
      onChange(strValue ? `${strValue} ${tokenStr}` : tokenStr);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === '@') {
      setShowPicker(true);
    }
  };

  return (
    <div
      ref={containerRef}
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
          alignItems: multiline ? 'flex-start' : 'center',
          gap: 6,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-secondary)',
          borderRadius: 6,
          padding: '4px 8px',
          transition: 'border-color 0.15s ease',
        }}
      >
        {multiline ? (
          <textarea
            ref={inputRef as any}
            disabled={disabled}
            value={strValue}
            placeholder={placeholder || '输入内容，或按 @ 插入上游数据胶囊...'}
            rows={3}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: 13,
              fontFamily: 'inherit',
              resize: 'vertical',
              lineHeight: 1.5,
            }}
          />
        ) : (
          <input
            ref={inputRef as any}
            type="text"
            disabled={disabled}
            value={strValue}
            placeholder={placeholder || '输入内容，或按 @ 插入数据胶囊...'}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: 13,
              fontFamily: 'inherit',
            }}
          />
        )}

        <button
          type="button"
          disabled={disabled}
          onClick={() => setShowPicker(!showPicker)}
          title="点击选择并插入上游数据胶囊 (@)"
          style={{
            background: showPicker
              ? 'var(--color-accent-bg, rgba(59, 130, 246, 0.15))'
              : 'var(--bg-tertiary)',
            color: showPicker ? 'var(--color-accent, #3b82f6)' : 'var(--text-secondary)',
            border: `1px solid ${showPicker ? 'var(--color-accent, #3b82f6)' : 'var(--border-primary)'}`,
            borderRadius: 4,
            padding: '2px 8px',
            fontSize: 11,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            flexShrink: 0,
            transition: 'all 0.15s ease',
          }}
        >
          <span>🏷️</span>
          <span>插入数据</span>
        </button>
      </div>

      {/* Visual pill badges preview underneath */}
      {pillTokens.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 4,
            alignItems: 'center',
            padding: '2px 2px',
          }}
        >
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>已引用胶囊:</span>
          {pillTokens.map((t, idx) => (
            <span
              key={`${t.ref}_${idx}`}
              style={{
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 12,
                background: 'var(--color-accent-bg, rgba(59, 130, 246, 0.12))',
                color: 'var(--color-accent-text, #1e40af)',
                border: '1px solid color-mix(in srgb, var(--color-accent, #3b82f6) 35%, transparent)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontWeight: 500,
              }}
              title={`原始引用表达式: ${t.raw}`}
            >
              <span>🔗</span>
              <span>{t.label}</span>
            </span>
          ))}
        </div>
      )}

      {/* Pill Picker Popover */}
      {showPicker && (
        <PillPicker
          upstreamSteps={upstreamSteps}
          workflowInputParams={workflowInputParams}
          registry={registry}
          onSelect={handleSelectPill}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
};
