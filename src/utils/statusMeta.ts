import {
    Ban, Check, Circle, CircleHelp, CircleStop, LoaderCircle, Pause, SkipForward, Timer, TriangleAlert, X,
    type LucideIcon,
} from 'lucide-react';

/**
 * One source for "status → colour + icon + Chinese word" (CMASTER rule 5: never colour alone).
 * Covers every Conductor task status and workflow status. Use it in badges, bars, timelines and summaries
 * instead of a local map.
 */
export type StatusTone = 'pending' | 'running' | 'success' | 'warning' | 'failed' | 'skipped' | 'muted';

export interface StatusMeta {
    /** Raw Conductor status (upper case). */
    status: string;
    /** Chinese word shown to the user. */
    label: string;
    /** Lucide icon component (render with strokeWidth 1.75). */
    icon: LucideIcon;
    /** Stable icon key, useful for tests and CSS hooks. */
    iconName: string;
    /** Colour token (CSS custom property reference). */
    color: string;
    /** Semantic group. */
    tone: StatusTone;
    /** CSS class suffix, kebab-case of the status (e.g. `completed-with-errors`). */
    className: string;
    /** The run / task reached a final state. */
    terminal: boolean;
    /** Final state that counts as a failure (failed, timed out, terminated…). */
    isFailure: boolean;
    /** Still running or waiting to run. */
    isActive: boolean;
}

type Def = Omit<StatusMeta, 'status' | 'className'>;

const TONE_COLOR: Record<StatusTone, string> = {
    pending: 'var(--cm-status-pending)',
    running: 'var(--cm-status-running)',
    success: 'var(--cm-status-success)',
    warning: 'var(--cm-status-warning)',
    failed: 'var(--cm-status-failed)',
    skipped: 'var(--cm-status-skipped)',
    muted: 'var(--cm-text-muted)',
};

function def(label: string, icon: LucideIcon, iconName: string, tone: StatusTone, flags: { terminal: boolean; isFailure?: boolean }): Def {
    return {
        label, icon, iconName, tone, color: TONE_COLOR[tone],
        terminal: flags.terminal, isFailure: !!flags.isFailure, isActive: !flags.terminal,
    };
}

const DEFS: Record<string, Def> = {
    SCHEDULED: def('等待中', Circle, 'circle', 'pending', { terminal: false }),
    IN_PROGRESS: def('运行中', LoaderCircle, 'loader', 'running', { terminal: false }),
    RUNNING: def('运行中', LoaderCircle, 'loader', 'running', { terminal: false }),
    PAUSED: def('已暂停', Pause, 'pause', 'warning', { terminal: false }),
    COMPLETED: def('成功', Check, 'check', 'success', { terminal: true }),
    COMPLETED_WITH_ERRORS: def('带错完成', TriangleAlert, 'alert', 'warning', { terminal: true }),
    FAILED: def('失败', X, 'x', 'failed', { terminal: true, isFailure: true }),
    FAILED_WITH_TERMINAL_ERROR: def('失败（不可重试）', X, 'x', 'failed', { terminal: true, isFailure: true }),
    TIMED_OUT: def('已超时', Timer, 'timer', 'warning', { terminal: true, isFailure: true }),
    SKIPPED: def('已跳过', SkipForward, 'skip', 'skipped', { terminal: true }),
    CANCELED: def('已取消', Ban, 'ban', 'muted', { terminal: true }),
    TERMINATED: def('已终止', CircleStop, 'stop', 'failed', { terminal: true, isFailure: true }),
};

const UNKNOWN: Def = def('未知', CircleHelp, 'help', 'muted', { terminal: false });

/** Every status the helper knows, in a sensible display order. */
export const KNOWN_STATUSES = Object.keys(DEFS);

/** Look up a status. Unknown or empty values get a neutral "未知" entry (never throws). */
export function getStatusMeta(status: string | null | undefined): StatusMeta {
    const key = String(status ?? '').trim().toUpperCase();
    const d = DEFS[key] ?? UNKNOWN;
    return {
        ...d,
        status: key || 'UNKNOWN',
        className: (DEFS[key] ? key : 'UNKNOWN').toLowerCase().replace(/_/g, '-'),
    };
}

/** Chinese word for a status, e.g. `COMPLETED` → `成功`. */
export function statusLabel(status: string | null | undefined): string {
    return getStatusMeta(status).label;
}
