import React from 'react';

interface BrandLogoProps {
    size?: number;
    className?: string;
    style?: React.CSSProperties;
}

/** The logo orange is the one colour literal CMASTER allows (CLAUDE.md rule 1): it stays the same in every theme. */
const LOGO_ORANGE = '#ff6a13';

/**
 * CMASTER mark: a C-shaped arc linking three system nodes to a central hub (design/assets/cmaster-mark-*.svg).
 * The node centres take the surrounding surface colour, so one component serves the dark and light marks.
 */
export const BrandLogo: React.FC<BrandLogoProps> = ({ size = 26, className, style }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        style={{ flexShrink: 0, display: 'inline-block', verticalAlign: 'middle', ...style }}
        role="img"
        aria-label="CMASTER"
    >
        <g stroke={LOGO_ORANGE} strokeWidth="3" opacity="0.7">
            <line x1="50" y1="50" x2="75.5" y2="24.5" />
            <line x1="50" y1="50" x2="14" y2="50" />
            <line x1="50" y1="50" x2="75.5" y2="75.5" />
        </g>
        <path d="M75.46 24.54A36 36 0 1 0 75.46 75.46" fill="none" stroke={LOGO_ORANGE} strokeWidth="9" strokeLinecap="round" />
        <g stroke={LOGO_ORANGE} strokeWidth="5" style={{ fill: 'var(--cm-surface-1)' }}>
            <circle cx="75.46" cy="24.54" r="7" />
            <circle cx="14" cy="50" r="7" />
            <circle cx="75.46" cy="75.46" r="7" />
        </g>
        <circle cx="50" cy="50" r="10" fill={LOGO_ORANGE} />
    </svg>
);

export default BrandLogo;
