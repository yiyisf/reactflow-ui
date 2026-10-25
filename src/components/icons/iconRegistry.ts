import {
    Activity, Ban, BookOpen, Flag, Flame, Library, Lightbulb, Lock, Map as MapIcon, Pause, Undo2, Wrench, ClipboardList, Mail, MousePointerClick, TriangleAlert, X, Bell, BellRing, Braces, ChartColumn, Check, Circle, Clock, Cloud, Code2, Database, FileText,
    FolderOpen, GitBranch, GitMerge, Globe, HardDrive, Hourglass, Key, Megaphone, MessageSquare, Monitor, Moon,
    Package, Pencil, Play, Plug, Puzzle, Radio, RefreshCw, Repeat, Rocket, Save, Scale, Search, Send, Server,
    Settings, ShieldCheck, Shuffle, Smartphone, Sparkles, Square, StopCircle, Sunrise, Terminal, Trash2, Upload,
    User, Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * CMASTER icon names → Lucide icons. Data (actions, templates, task types, library extensions) stores an icon as one
 * of these kebab-case names, never as an emoji (design/guidelines/brand.md · 图标).
 */
export const CM_ICONS = {
    activity: Activity,
    alert: TriangleAlert,
    book: BookOpen,
    flag: Flag,
    flame: Flame,
    library: Library,
    lightbulb: Lightbulb,
    lock: Lock,
    map: MapIcon,
    pause: Pause,
    undo: Undo2,
    wrench: Wrench,
    approval: Check,
    clipboard: ClipboardList,
    mail: Mail,
    pointer: MousePointerClick,
    x: X,
    ban: Ban,
    bell: Bell,
    'bell-ring': BellRing,
    braces: Braces,
    chart: ChartColumn,
    circle: Circle,
    clock: Clock,
    cloud: Cloud,
    code: Code2,
    database: Database,
    'file-text': FileText,
    folder: FolderOpen,
    branch: GitBranch,
    merge: GitMerge,
    globe: Globe,
    'hard-drive': HardDrive,
    hourglass: Hourglass,
    key: Key,
    megaphone: Megaphone,
    message: MessageSquare,
    monitor: Monitor,
    moon: Moon,
    package: Package,
    pencil: Pencil,
    play: Play,
    plug: Plug,
    puzzle: Puzzle,
    radio: Radio,
    refresh: RefreshCw,
    repeat: Repeat,
    rocket: Rocket,
    save: Save,
    scale: Scale,
    search: Search,
    send: Send,
    server: Server,
    settings: Settings,
    shield: ShieldCheck,
    shuffle: Shuffle,
    smartphone: Smartphone,
    sparkles: Sparkles,
    stop: Square,
    'stop-circle': StopCircle,
    sunrise: Sunrise,
    terminal: Terminal,
    trash: Trash2,
    upload: Upload,
    user: User,
    zap: Zap,
} satisfies Record<string, LucideIcon>;

export type CmIconName = keyof typeof CM_ICONS;

/**
 * Legacy emoji → icon name. Older hosts and the governance service may still send emoji as `icon`; they render as the
 * matching Lucide icon instead. Keys are compared after stripping the emoji variation selector (U+FE0F).
 */
export const EMOJI_ALIASES: Record<string, CmIconName> = {
    '📢': 'megaphone', '📣': 'megaphone', '👤': 'user', '⏳': 'hourglass', '⌛': 'hourglass', '🔀': 'shuffle',
    '⚡': 'zap', '🔁': 'repeat', '🔄': 'refresh', '🖥': 'server', '💻': 'terminal', '🔍': 'search', '🔎': 'search',
    '▶': 'play', '⏹': 'stop', '💾': 'save', '📊': 'chart', '📈': 'chart', '🗑': 'trash', '🚀': 'rocket',
    '🛡': 'shield', '🌙': 'moon', '🌅': 'sunrise', '💽': 'hard-drive', '🚨': 'bell-ring', '⚙': 'settings',
    '🌐': 'globe', '📦': 'package', '📡': 'radio', '🛑': 'stop-circle', '📝': 'pencil', '📨': 'send', '🔗': 'merge',
    '🧩': 'puzzle', '📱': 'smartphone', '💬': 'message', '📸': 'save', '⚖': 'scale', '🗂': 'folder', '🔑': 'key',
    '📤': 'upload', '🔢': 'braces', '✅': 'approval', '🔌': 'plug', '📁': 'folder', '☁': 'cloud', '🗄': 'database',
    '📄': 'file-text', '🔔': 'bell', '✨': 'sparkles', '🤖': 'sparkles', '🧪': 'sparkles', '⏰': 'clock', '🕐': 'clock',
    '📧': 'mail', '✉': 'mail', '📋': 'clipboard', '👆': 'pointer', '⚠': 'alert', '❌': 'x', '✓': 'approval', '✔': 'approval',
    '🎉': 'sparkles', '✦': 'sparkles', '🔥': 'flame', '💡': 'lightbulb', '📖': 'book', '🏁': 'flag', '🔒': 'lock',
    '⏸': 'pause', '↩': 'undo', '🔧': 'wrench', '📚': 'library', '🗺': 'map', '✏': 'pencil', '🔴': 'x', '🔵': 'activity',
};

/** Resolves an icon value (icon name or legacy emoji) to a registered icon name; null when unknown. */
export function resolveIconName(icon: string | undefined | null): CmIconName | null {
    if (!icon) return null;
    const key = icon.trim();
    if (key in CM_ICONS) return key as CmIconName;
    return EMOJI_ALIASES[key.replace(/️/g, '')] ?? null;
}
