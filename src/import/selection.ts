/**
 * Import dialog selection rules (R16): the dialog renders at most `limit` rows, so nothing outside what the user can
 * see is ever selected implicitly.
 */

/** Default selection: every operation when all of them are shown, otherwise none. */
export function initialSelection<T extends { id: string }>(operations: T[], limit: number): Set<string> {
    return new Set(operations.length <= limit ? operations.map((o) => o.id) : []);
}

/** The rows shown and how many matching rows are hidden by the limit. */
export function visibleSlice<T>(filtered: T[], limit: number): { visible: T[]; hiddenCount: number } {
    const visible = filtered.slice(0, limit);
    return { visible, hiddenCount: filtered.length - visible.length };
}

/** Select-all / select-none applied to the visible rows only. */
export function applyToVisible<T extends { id: string }>(selected: Set<string>, visible: T[], on: boolean): Set<string> {
    const next = new Set(selected);
    for (const o of visible) {
        if (on) next.add(o.id);
        else next.delete(o.id);
    }
    return next;
}
