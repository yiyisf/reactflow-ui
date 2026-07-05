/**
 * Vitest setup — the test environment is plain Node (no jsdom), but some modules under
 * test (toolExecutor.ts) transitively import zustand stores that use `persist` with
 * `localStorage`. Zustand's persist middleware reads `localStorage` at store-creation
 * time (i.e. at import time), so it must exist as a global before those modules load.
 */
class MemoryStorage implements Storage {
    private map = new Map<string, string>();
    get length() { return this.map.size; }
    clear(): void { this.map.clear(); }
    getItem(key: string): string | null { return this.map.has(key) ? this.map.get(key)! : null; }
    key(index: number): string | null { return Array.from(this.map.keys())[index] ?? null; }
    removeItem(key: string): void { this.map.delete(key); }
    setItem(key: string, value: string): void { this.map.set(key, value); }
}

if (typeof globalThis.localStorage === 'undefined') {
    (globalThis as any).localStorage = new MemoryStorage();
}
