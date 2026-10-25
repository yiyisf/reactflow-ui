import React, { useState } from 'react';
import { translateTechnicalError, FriendlyErrorDiagnosis } from '../../utils/friendlyErrorTranslator';
import { CircleX, CreditCard, Key, Lightbulb, Timer, TriangleAlert, Zap } from 'lucide-react';

export interface FriendlyErrorCardProps {
  rawError?: string;
  statusCode?: number;
  taskName?: string;
  onActionClick?: (actionKey?: string) => void;
}

export const FriendlyErrorCard: React.FC<FriendlyErrorCardProps> = ({
  rawError,
  statusCode,
  taskName,
  onActionClick,
}) => {
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const diagnosis: FriendlyErrorDiagnosis = translateTechnicalError(rawError, statusCode, taskName);

  return (
    <div
      style={{
        borderRadius: 10,
        background: 'color-mix(in srgb, var(--cm-status-failed) 8%, transparent)',
        border: '1px solid color-mix(in srgb, var(--cm-status-failed) 30%, transparent)',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        fontFamily: 'inherit',
      }}
    >
      {/* 头部标题 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'inline-flex', color: 'var(--status-failed)' }}>
            {React.createElement(
              diagnosis.type === 'auth'
                ? Key
                : diagnosis.type === 'timeout'
                ? Timer
                : diagnosis.type === 'missing_data'
                ? TriangleAlert
                : diagnosis.type === 'quota'
                ? CreditCard
                : CircleX,
              { size: 18, strokeWidth: 1.75, 'aria-hidden': true },
            )}
          </span>
          <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--status-failed)' }}>
            {diagnosis.title}
          </span>
        </div>

        {diagnosis.actionLabel && (
          <button
            onClick={() => onActionClick?.(diagnosis.actionKey)}
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              background: 'color-mix(in srgb, var(--status-failed) 15%, transparent)',
              border: '1px solid color-mix(in srgb, var(--status-failed) 30%, transparent)',
              color: 'var(--status-failed)',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span><Zap size={14} strokeWidth={1.75} aria-hidden="true" /></span>
            <span>{diagnosis.actionLabel}</span>
          </button>
        )}
      </div>

      {/* 大白话业务原因解释 */}
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        {diagnosis.explanation}
      </div>

      {/* 行动建议 */}
      <div
        style={{
          padding: '8px 12px',
          borderRadius: 6,
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border-primary)',
          fontSize: 11,
          color: 'var(--color-warning)',
          lineHeight: 1.5,
        }}
      >
        <Lightbulb size={14} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} /><strong>建议做法</strong>：{diagnosis.suggestion}
      </div>

      {/* 可折叠的技术日志明细（供技术人员查看） */}
      {rawError && (
        <div style={{ marginTop: 2 }}>
          <button
            onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: 10,
              cursor: 'pointer',
              padding: 0,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span>{showTechnicalDetails ? '▾ 折叠底层技术报错' : '▸ 展开底层技术报错 (供研发/技术支持排查)'}</span>
          </button>

          {showTechnicalDetails && (
            <div
              style={{
                marginTop: 6,
                padding: '8px 10px',
                borderRadius: 4,
                background: 'var(--cm-surface-0)',
                color: 'var(--text-muted)',
                fontFamily: 'monospace',
                fontSize: 10,
                lineHeight: 1.4,
                maxHeight: 120,
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {rawError}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
