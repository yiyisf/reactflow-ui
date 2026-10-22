import { useEffect, useSyncExternalStore } from 'react';
import { LibraryCatalog, type LibraryCatalogSnapshot } from './catalog';
import type { LibraryProvider } from './types';

const NOOP_UNSUBSCRIBE = () => {};
const IDLE_SNAPSHOT: LibraryCatalogSnapshot = { status: 'idle', revision: 0 };

/** 订阅目录状态（catalog 为空时返回恒定的 idle 快照）。目录数据变化时返回新的快照引用。 */
export function useLibraryCatalogSnapshot(catalog: LibraryCatalog | undefined): LibraryCatalogSnapshot {
  return useSyncExternalStore(
    catalog ? catalog.subscribe : () => NOOP_UNSUBSCRIBE,
    catalog ? catalog.getSnapshot : () => IDLE_SNAPSHOT,
    catalog ? catalog.getSnapshot : () => IDLE_SNAPSHOT,
  );
}

/**
 * 让目录跟随 provider：provider 引用变化时重新加载；卸载 / 更换时 abort 进行中的请求。
 * 每个 IDE 实例自己持有 catalog，这里只负责驱动它。
 */
export function useLibraryCatalogLoader(catalog: LibraryCatalog, provider: LibraryProvider | undefined): void {
  useEffect(() => {
    catalog.setProvider(provider);
    if (provider) void catalog.load();
    return () => {
      catalog.abort();
    };
  }, [catalog, provider]);
}
