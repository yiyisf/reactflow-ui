/**
 * 「每个实例只执行一次」的守卫，用于 `ide_opened` 去重。
 *
 * React StrictMode（开发环境）会把 effect 执行 → 清理 → 再执行一次，但 `useRef` 的值在两次之间保留，
 * 所以把守卫放在 ref 里即可保证同一个 IDE 实例只上报一次；真正重新挂载（新实例）会得到新的守卫。
 */
export interface OnceGuard {
    /** 第一次调用返回 true，之后都返回 false */
    take(): boolean;
}

export function createOnceGuard(): OnceGuard {
    let taken = false;
    return {
        take() {
            if (taken) return false;
            taken = true;
            return true;
        },
    };
}
