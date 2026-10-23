/**
 * 仅供埋点守卫测试使用：以原始文本形式读取源码与文档（Vite 的 `?raw` / `import.meta.glob`），
 * 不依赖 @types/node。不属于库产物（构建入口只有 index.ts / ai.ts）。
 */
import designDoc from '../../docs/design/v1.3.0-自助接入设计.md?raw';
import integrationGuide from '../../docs/integration-guide.md?raw';

/** 所有非测试源码（键为相对本目录的路径） */
export const sourceFiles: Record<string, string> = import.meta.glob(
    ['../**/*.ts', '../**/*.tsx', '!../**/*.test.ts', '!../**/*.testutil.ts'],
    { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

export { designDoc, integrationGuide };
