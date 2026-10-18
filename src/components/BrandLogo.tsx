import React from 'react';

interface BrandLogoProps {
    size?: number;
    className?: string;
    style?: React.CSSProperties;
}

/**
 * Conductor Workflow IDE 极简几何品牌 Logo
 *
 * 设计语言：深空圆角矩形底座 + 贝塞尔双分支编排流向 + 三色确定性拓扑节点（靛紫起点 → 青蓝分支 / 翠绿沙箱通过节点）
 */
export const BrandLogo: React.FC<BrandLogoProps> = ({ size = 26, className, style }) => {
    const uid = React.useId().replace(/:/g, '');
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 32 32"
            fill="none"
             xmlns="http://www.w3.org/2000/svg"
            className={className}
            style={{ flexShrink: 0, display: 'inline-block', verticalAlign: 'middle', ...style }}
            aria-label="Conductor Workflow IDE Logo"
        >
            <defs>
                <linearGradient id={`bg-${uid}`} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#11172B" />
                    <stop offset="100%" stopColor="#090D18" />
                </linearGradient>
                <linearGradient id={`bd-${uid}`} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#6366F1" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#06B6D4" stopOpacity="0.5" />
                </linearGradient>
                <linearGradient id={`top-${uid}`} x1="9" y1="16" x2="23" y2="10" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#818CF8" />
                    <stop offset="100%" stopColor="#22D3EE" />
                </linearGradient>
                <linearGradient id={`bot-${uid}`} x1="9" y1="16" x2="23" y2="22" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#6366F1" />
                    <stop offset="100%" stopColor="#34D399" />
                </linearGradient>
            </defs>

            <rect
                x="1.25"
                y="1.25"
                width="29.5"
                height="29.5"
                rx="8"
                fill={`url(#bg-${uid})`}
                stroke={`url(#bd-${uid})`}
                strokeWidth="1.5"
            />

            <path
                d="M 9.5 16 C 15 16, 15.5 10, 22.5 10"
                stroke={`url(#top-${uid})`}
                strokeWidth="2.4"
                strokeLinecap="round"
            />
            <path
                d="M 9.5 16 C 15 16, 15.5 22, 22.5 22"
                stroke={`url(#bot-${uid})`}
                strokeWidth="2.4"
                strokeLinecap="round"
            />

            <circle cx="9.5" cy="16" r="3.4" fill="#6366F1" />
            <circle cx="9.5" cy="16" r="1.4" fill="#F8FAFC" />

            <circle cx="22.5" cy="10" r="2.7" fill="#22D3EE" />
            <circle cx="22.5" cy="22" r="2.7" fill="#34D399" />
        </svg>
    );
};

export default BrandLogo;
