/**
 * `selector(() => selectedId)`: an O(1) "is this key selected?" check (like
 * Solid's createSelector). Every row reading `isSelected(row.id)` depends on
 * its own key only, so changing the selection updates two rows instead of
 * re-evaluating all of them.
 */
import { Source, effectSync, get, getOwner, isTracking, onCleanup, set, untrack } from './reactivity';

type Entry = { source: Source<boolean>; readers: number };

export function selector<T>(source: () => T): (key: T) => boolean {
  const entries = new Map<T, Entry>();
  let current: { key: T } | null = null;
  effectSync(() => {
    const next = source();
    untrack(() => {
      if (current !== null && next !== current.key) {
        const before = entries.get(current.key);
        if (before !== undefined) set(before.source, false);
        const after = entries.get(next);
        if (after !== undefined) set(after.source, true);
      }
      current = { key: next };
    });
  });
  return (key: T): boolean => {
    let entry = entries.get(key);
    if (entry === undefined) {
      entry = { source: new Source(current !== null && key === current.key), readers: 0 };
      entries.set(key, entry);
    }
    if (getOwner() !== null && isTracking()) {
      const e = entry;
      e.readers++;
      onCleanup(() => {
        if (--e.readers === 0 && entries.get(key) === e) entries.delete(key);
      });
    }
    return get(entry.source);
  };
}

let nextId = 0;

/** A unique id for `id` / `for` / `aria-*` links: `val id = uid('email')` → `email-1`. */
export function uid(prefix = 'owt'): string {
  return `${prefix}-${(++nextId).toString(36)}`;
}
