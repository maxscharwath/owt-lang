/**
 * Control-flow blocks. Every block renders its content right before an anchor
 * node (a comment placeholder from the template) and owns a scope per branch /
 * row so effects are disposed with the content they belong to.
 *
 * Compiled templates guarantee that rendered content is never empty and that
 * its first and last nodes are stable, so a block only has to remember the
 * `first`/`last` node of each piece of content to move or remove it.
 */
import {
  Owner,
  Source,
  dispose,
  get,
  getOwner,
  renderEffect,
  reportError,
  runWithOwner,
  set,
  untrack,
} from '../reactivity';
import { reactive, toRaw, trackArray } from '../proxy';
import { insertContent, moveRange, removeRange, type NodeRange } from './nodes';

type Render = () => Node;

type Branch = { scope: Owner; first: Node; last: Node };

function renderBranch(owner: Owner | null, anchor: Node, render: Render): Branch {
  const scope = new Owner(owner);
  const content = runWithOwner(scope, render);
  const range = insertContent(anchor, content);
  return { scope, first: range.first, last: range.last };
}

function destroyBranch(branch: Branch): void {
  dispose(branch.scope);
  removeRange(branch.first, branch.last);
}

// ---------------------------------------------------------------------------
// if / else-if / else, switch
// ---------------------------------------------------------------------------

/**
 * `select` returns the index of the branch to render (-1 for none). The
 * branch is only re-created when the index changes.
 */
export function branch(anchor: Node, select: () => number, branches: readonly Render[]): void {
  const owner = getOwner();
  let index = -2;
  let current: Branch | null = null;
  renderEffect(() => {
    const next = select();
    if (next === index) return;
    index = next;
    untrack(() => {
      if (current !== null) {
        destroyBranch(current);
        current = null;
      }
      const render = next >= 0 ? branches[next] : undefined;
      if (render !== undefined) current = renderBranch(owner, anchor, render);
    });
  });
}

/** `if (cond) { ... }` without else: the most common case, kept tiny. */
export function when(anchor: Node, cond: () => unknown, render: Render, otherwise?: Render): void {
  branch(anchor, () => (cond() ? 0 : otherwise === undefined ? -1 : 1), otherwise === undefined ? [render] : [render, otherwise]);
}

/** Re-create content whenever `key()` changes (`<Comp>` with a reactive tag, `key` blocks). */
export function keyed<K>(anchor: Node, key: () => K, render: (key: K) => Node): void {
  const owner = getOwner();
  let current: Branch | null = null;
  let first = true;
  let prev: K | undefined;
  renderEffect(() => {
    const k = key();
    if (!first && k === prev) return;
    first = false;
    prev = k;
    untrack(() => {
      if (current !== null) destroyBranch(current);
      current = renderBranch(owner, anchor, () => render(k));
    });
  });
}

// ---------------------------------------------------------------------------
// Dynamic components & slots
// ---------------------------------------------------------------------------

type ComponentLike<P> = ((props: P) => Node) | null | undefined | false;

/** `<Comp/>` where `Comp` is reactive: re-mount when the component changes. */
export function dynamic<P>(anchor: Node, getComponent: () => ComponentLike<P>, props: P): void {
  const owner = getOwner();
  let current: Branch | null = null;
  let component: ComponentLike<P> | undefined;
  let first = true;
  renderEffect(() => {
    const next = getComponent();
    if (!first && next === component) return;
    first = false;
    component = next;
    untrack(() => {
      if (current !== null) {
        destroyBranch(current);
        current = null;
      }
      if (typeof next === 'function') current = renderBranch(owner, anchor, () => next(props));
    });
  });
}

export type Snippet<A = Record<string, never>> = (args: A) => Node;

/** `<slot name="x" ...args>fallback</slot>`: render the snippet passed by the parent, or the fallback. */
export function slot<A>(
  anchor: Node,
  getSnippet: () => Snippet<A> | null | undefined,
  args: A,
  fallback: Render | null,
): void {
  const owner = getOwner();
  let current: Branch | null = null;
  let snippet: Snippet<A> | null | undefined;
  let first = true;
  renderEffect(() => {
    const next = getSnippet();
    if (!first && next === snippet) return;
    first = false;
    snippet = next;
    untrack(() => {
      if (current !== null) {
        destroyBranch(current);
        current = null;
      }
      if (typeof next === 'function') current = renderBranch(owner, anchor, () => next(args));
      else if (fallback !== null) current = renderBranch(owner, anchor, fallback);
    });
  });
}

// ---------------------------------------------------------------------------
// await
// ---------------------------------------------------------------------------

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

/**
 * `await (promise) { pending } then (value) { ... } catch (error) { ... }`.
 * Results of outdated promises are ignored.
 */
export function awaitBlock<T>(
  anchor: Node,
  getPromise: () => T | PromiseLike<T>,
  pending: Render | null,
  then: ((value: Source<T>) => Node) | null,
  rejected: ((error: Source<unknown>) => Node) | null,
): void {
  const owner = getOwner();
  const value = new Source<T>(undefined as T, false);
  const error = new Source<unknown>(undefined, false);
  let state = -1;
  let current: Branch | null = null;
  let token = 0;

  const show = (next: number) => {
    if (next === state && current !== null) return;
    state = next;
    if (current !== null) {
      destroyBranch(current);
      current = null;
    }
    const render: Render | null =
      next === 0 ? pending : next === 1 && then !== null ? () => then(value) : next === 2 && rejected !== null ? () => rejected(error) : null;
    if (render !== null) {
      try {
        current = renderBranch(owner, anchor, render);
      } catch (err) {
        reportError(owner, err);
      }
    }
  };

  renderEffect(() => {
    const input = getPromise();
    const t = ++token;
    untrack(() => {
      if (!isPromiseLike(input)) {
        set(value, input);
        show(1);
        return;
      }
      if (pending !== null) show(0);
      input.then(
        (v) => {
          if (t !== token || owner?.disposed) return;
          set(value, v);
          show(1);
        },
        (err: unknown) => {
          if (t !== token || owner?.disposed) return;
          set(error, err);
          if (rejected === null) {
            show(-1);
            reportError(owner, err);
          } else {
            show(2);
          }
        },
      );
    });
  });
}

// ---------------------------------------------------------------------------
// try / catch error boundaries
// ---------------------------------------------------------------------------

/** `try { ... } catch (error, reset) { ... }`: catches errors thrown while rendering or updating the body. */
export function tryBlock(
  anchor: Node,
  body: Render,
  fallback: (error: Source<unknown>, reset: () => void) => Node,
): void {
  const owner = getOwner();
  const boundary = new Owner(owner);
  const error = new Source<unknown>(undefined, false);
  let current: Branch | null = null;
  let failed = false;
  let rendering = false;
  let pendingError: { err: unknown } | null = null;

  const showFallback = (err: unknown) => {
    if (current !== null) {
      destroyBranch(current);
      current = null;
    }
    failed = true;
    set(error, err);
    current = renderBranch(owner, anchor, () => fallback(error, reset));
  };

  const renderBody = () => {
    rendering = true;
    pendingError = null;
    let branchResult: Branch | null = null;
    try {
      branchResult = renderBranch(boundary, anchor, body);
    } catch (err) {
      pendingError ??= { err };
    } finally {
      rendering = false;
    }
    current = branchResult;
    if (pendingError !== null) {
      const { err } = pendingError;
      pendingError = null;
      showFallback(err);
    }
  };

  const reset = () => {
    if (!failed) return;
    failed = false;
    untrack(() => {
      if (current !== null) {
        destroyBranch(current);
        current = null;
      }
      renderBody();
    });
  };

  boundary.onError = (err) => {
    if (rendering) {
      pendingError ??= { err };
      return;
    }
    if (failed) {
      reportError(owner, err);
      return;
    }
    untrack(() => showFallback(err));
  };

  untrack(renderBody);
}

// ---------------------------------------------------------------------------
// for ... of (keyed list)
// ---------------------------------------------------------------------------

export const EACH_ITEM_SOURCE = 1;
export const EACH_INDEX_SOURCE = 2;
export const EACH_META = 4;
export const EACH_ONLY_CHILD = 8;
export const EACH_KEY_INDEX = 16;

export type LoopMeta = {
  readonly index: number;
  readonly first: boolean;
  readonly last: boolean;
  readonly even: boolean;
  readonly odd: boolean;
  readonly length: number;
};

type Row = {
  key: unknown;
  item: unknown;
  index: Source<number> | number;
  scope: Owner;
  first: Node;
  last: Node;
  /** next row with the same key (duplicate keys) while reconciling */
  dup: Row | null;
};

type EachRender<T> = (item: T | Source<T>, index: Source<number> | number, meta: LoopMeta | null) => Node;

const EMPTY: readonly unknown[] = [];

function toList(value: unknown): readonly unknown[] {
  if (value == null || value === false) return EMPTY;
  if (Array.isArray(value)) return trackArray(value);
  if (typeof value === 'number') {
    const out = new Array<number>(Math.max(0, value | 0));
    for (let i = 0; i < out.length; i++) out[i] = i;
    return out;
  }
  if (typeof value === 'object' || typeof value === 'string') {
    if (typeof (value as Iterable<unknown>)[Symbol.iterator] === 'function') return Array.from(value as Iterable<unknown>);
    if (typeof (value as ArrayLike<unknown>).length === 'number') return Array.from(value as ArrayLike<unknown>);
    return Object.entries(value);
  }
  throw new TypeError(`[owt] cannot iterate over ${typeof value}`);
}

/** Longest increasing subsequence of `seq` (ignoring -1), as positions in `seq`. */
export function lis(seq: Int32Array): number[] {
  const n = seq.length;
  const predecessors = new Int32Array(n);
  const tails: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = seq[i]!;
    if (v < 0) continue;
    const lastTail = tails[tails.length - 1];
    if (lastTail === undefined || seq[lastTail]! < v) {
      predecessors[i] = lastTail ?? -1;
      tails.push(i);
      continue;
    }
    let lo = 0;
    let hi = tails.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (seq[tails[mid]!]! < v) lo = mid + 1;
      else hi = mid;
    }
    predecessors[i] = lo > 0 ? tails[lo - 1]! : -1;
    tails[lo] = i;
  }
  const result = new Array<number>(tails.length);
  let k = tails[tails.length - 1] ?? -1;
  for (let i = tails.length - 1; i >= 0; i--) {
    result[i] = k;
    k = predecessors[k]!;
  }
  return result;
}

/**
 * Keyed list rendering with minimal DOM moves (prefix/suffix trimming plus a
 * longest-increasing-subsequence pass), O(1) clears for lists that are the
 * only child of their parent, and per-row scopes.
 */
export function each<T>(
  anchor: Node,
  getList: () => unknown,
  render: EachRender<T>,
  getKey: ((item: T, index: number) => unknown) | null,
  flags: number,
  empty: Render | null,
): void {
  const owner = getOwner();
  const itemSource = (flags & EACH_ITEM_SOURCE) !== 0;
  const indexSource = (flags & (EACH_INDEX_SOURCE | EACH_META)) !== 0;
  const keyByIndex = (flags & EACH_KEY_INDEX) !== 0;
  const length = new Source(0);
  let rows: Row[] = [];
  let emptyBranch: Branch | null = null;

  const makeMeta = (index: Source<number>): LoopMeta => ({
    get index() {
      return get(index);
    },
    get first() {
      return get(index) === 0;
    },
    get last() {
      return get(index) === get(length) - 1;
    },
    get even() {
      return (get(index) & 1) === 0;
    },
    get odd() {
      return (get(index) & 1) === 1;
    },
    get length() {
      return get(length);
    },
  });

  const createRow = (key: unknown, raw: unknown, i: number, before: Node | null, parent: Node): Row => {
    const scope = new Owner(owner);
    const value = reactive(raw) as T;
    const item = itemSource ? new Source<T>(value) : value;
    const index = indexSource ? new Source(i) : i;
    const meta = flags & EACH_META ? makeMeta(index as Source<number>) : null;
    const content = runWithOwner(scope, () => render(item as T | Source<T>, index, meta));
    let first: Node;
    let last: Node;
    if (content.nodeType === 11) {
      first = content.firstChild ?? content.appendChild(document.createTextNode(''));
      last = content.lastChild!;
    } else {
      first = last = content;
    }
    parent.insertBefore(content, before);
    return { key, item, index, scope, first, last, dup: null };
  };

  const updateRow = (row: Row, raw: unknown, i: number) => {
    if (itemSource) set(row.item as Source<unknown>, reactive(raw));
    if (indexSource) set(row.index as Source<number>, i);
  };

  const removeRow = (row: Row) => {
    dispose(row.scope);
    removeRange(row.first, row.last);
  };

  const clearAll = () => {
    const parent = anchor.parentNode!;
    for (let i = 0; i < rows.length; i++) dispose(rows[i]!.scope);
    if (flags & EACH_ONLY_CHILD && emptyBranch === null) {
      (parent as Element).textContent = '';
      parent.appendChild(anchor);
    } else {
      for (let i = 0; i < rows.length; i++) removeRange(rows[i]!.first, rows[i]!.last);
    }
    rows = [];
  };

  const reconcile = (items: readonly unknown[], keys: unknown[]) => {
    const n = items.length;
    const oldRows = rows;
    const oldLen = oldRows.length;
    const parent = anchor.parentNode!;

    if (n === 0) {
      if (oldLen > 0) clearAll();
      if (empty !== null && emptyBranch === null) emptyBranch = renderBranch(owner, anchor, empty);
      return;
    }
    if (emptyBranch !== null) {
      destroyBranch(emptyBranch);
      emptyBranch = null;
    }

    if (oldLen === 0) {
      const frag = document.createDocumentFragment();
      const next = new Array<Row>(n);
      for (let i = 0; i < n; i++) next[i] = createRow(keys[i], items[i], i, null, frag);
      parent.insertBefore(frag, anchor);
      rows = next;
      return;
    }

    const next = new Array<Row>(n);
    let start = 0;
    let oldEnd = oldLen - 1;
    let newEnd = n - 1;
    while (start <= oldEnd && start <= newEnd && oldRows[start]!.key === keys[start]) {
      const row = oldRows[start]!;
      updateRow(row, items[start], start);
      next[start] = row;
      start++;
    }
    while (oldEnd >= start && newEnd >= start && oldRows[oldEnd]!.key === keys[newEnd]) {
      const row = oldRows[oldEnd]!;
      updateRow(row, items[newEnd], newEnd);
      next[newEnd] = row;
      oldEnd--;
      newEnd--;
    }

    if (start > oldEnd) {
      // only insertions
      const before = newEnd + 1 < n ? next[newEnd + 1]!.first : anchor;
      for (let i = start; i <= newEnd; i++) next[i] = createRow(keys[i], items[i], i, before, parent);
    } else if (start > newEnd) {
      // only removals
      for (let i = start; i <= oldEnd; i++) removeRow(oldRows[i]!);
    } else {
      const byKey = new Map<unknown, Row>();
      for (let i = oldEnd; i >= start; i--) {
        const row = oldRows[i]!;
        row.dup = byKey.get(row.key) ?? null;
        byKey.set(row.key, row);
      }
      const oldIndex = new Map<Row, number>();
      for (let i = start; i <= oldEnd; i++) oldIndex.set(oldRows[i]!, i);
      const sources = new Int32Array(newEnd - start + 1).fill(-1);
      let moved = false;
      let lastOld = -1;
      for (let i = start; i <= newEnd; i++) {
        const row = byKey.get(keys[i]);
        if (row === undefined) continue;
        if (row.dup !== null) byKey.set(row.key, row.dup);
        else byKey.delete(row.key);
        row.dup = null;
        const oi = oldIndex.get(row)!;
        oldIndex.delete(row);
        sources[i - start] = oi;
        if (oi < lastOld) moved = true;
        lastOld = oi;
        updateRow(row, items[i], i);
        next[i] = row;
      }
      for (const row of oldIndex.keys()) removeRow(row);
      const stable = moved ? lis(sources) : null;
      let j = stable === null ? -1 : stable.length - 1;
      for (let i = newEnd; i >= start; i--) {
        const before = i + 1 < n ? next[i + 1]!.first : anchor;
        const pos = i - start;
        if (sources[pos] === -1) {
          next[i] = createRow(keys[i], items[i], i, before, parent);
        } else if (stable !== null) {
          if (j >= 0 && stable[j] === pos) j--;
          else moveRange(next[i]!.first, next[i]!.last, before);
        }
      }
    }
    rows = next;
  };

  renderEffect(() => {
    const items = toList(getList());
    const n = items.length;
    const keys = new Array<unknown>(n);
    if (keyByIndex) {
      for (let i = 0; i < n; i++) keys[i] = i;
    } else if (getKey !== null) {
      for (let i = 0; i < n; i++) keys[i] = getKey(reactive(items[i]) as T, i);
    } else {
      for (let i = 0; i < n; i++) keys[i] = toRaw(items[i]);
    }
    untrack(() => {
      set(length, n);
      reconcile(items, keys);
    });
  });
}

/** Inclusive integer range used by `a..b` in `for` headers. */
export function range(from: number, to: number, step = 1): number[] {
  const out: number[] = [];
  const a = Math.trunc(from);
  const b = Math.trunc(to);
  if (step <= 0) return out;
  for (let i = a; i <= b; i += step) out.push(i);
  return out;
}

/** Reverse iteration (`for (x of rev items)`), never mutating the input. */
export function rev<T>(value: Iterable<T> | ArrayLike<T> | null | undefined): T[] {
  if (value == null) return [];
  const list = Array.isArray(value) ? (value as T[]).slice() : Array.from(value as Iterable<T>);
  return list.reverse();
}

export type { NodeRange };
