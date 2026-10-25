import type { CSSProperties } from 'react';
import { CM_ICONS, resolveIconName } from './iconRegistry';

interface CmIconProps {
    /** Icon name from CM_ICONS (preferred) or a legacy emoji from host data. */
    name: string | undefined | null;
    size?: number;
    /** Name to use when `name` is empty or unknown. */
    fallback?: keyof typeof CM_ICONS;
    style?: CSSProperties;
    className?: string;
}

/**
 * Renders a CMASTER data icon as a Lucide icon (stroke 1.75). Unknown non-empty values fall back to `fallback`,
 * so host-supplied emoji or typos never reach the UI as raw glyphs.
 */
export function CmIcon({ name, size = 16, fallback = 'settings', style, className }: CmIconProps) {
    const Glyph = CM_ICONS[resolveIconName(name) ?? fallback];
    return <Glyph size={size} strokeWidth={1.75} aria-hidden="true" style={style} className={className} />;
}

export default CmIcon;
