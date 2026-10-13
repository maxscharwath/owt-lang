/** Component instances, props helpers, mounting and HMR. */
import {
  Computed,
  Owner,
  Source,
  createRoot,
  flushSync,
  get,
  getOwner,
  runWithOwner,
  set,
  untrack,
} from '../reactivity';
import { dynamic } from './blocks';
import { insertContent, removeRange } from './nodes';
import { DEV } from '../env';

type Dict = Record<PropertyKey, unknown>;

/** A compiled OWT component: a function from props to DOM nodes. */
export type Component<P = Record<string, never>> = (props: P) => Node;

/** Run a component body in its own ownership scope (untracked). */
export function scope<T>(body: () => T): T {
  return runWithOwner(new Owner(getOwner()), body);
}

/** Prop with a default value: `component X({ size = 'md' })`. */
export function propDefault<T>(props: Dict, key: string, fallback: () => T): Computed<T> {
  return new Computed<T>(() => {
    const value = props[key];
    return value === undefined ? untrack(fallback) : (value as T);
  });
}

/** Assigning a prop: works when the parent used `bind:prop`, warns otherwise. */
export function setProp<T>(props: Dict, key: string, value: T): T {
  const desc = Object.getOwnPropertyDescriptor(props, key);
  if (desc !== undefined && (desc.set !== undefined || desc.writable)) {
    props[key] = value;
  } else if (DEV) {
    console.warn(`[owt] prop "${key}" is read-only; use bind:${key}={...} in the parent to make it writable`);
  }
  return value;
}

/** `{ a, b, ...rest }` on props: a live view of props without some keys. */
export function restProps(props: Dict, exclude: readonly string[]): Dict {
  const skip = new Set<PropertyKey>(exclude);
  return new Proxy(props, {
    get(target, key) {
      return skip.has(key) ? undefined : target[key];
    },
    has(target, key) {
      return !skip.has(key) && key in target;
    },
    ownKeys(target) {
      return Reflect.ownKeys(target).filter((k) => !skip.has(k));
    },
    getOwnPropertyDescriptor(target, key) {
      if (skip.has(key)) return undefined;
      const desc = Reflect.getOwnPropertyDescriptor(target, key);
      if (desc !== undefined) desc.configurable = true;
      return desc;
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  });
}

type PropsSource = Dict | (() => Dict | null | undefined);

function resolveSource(source: PropsSource): Dict | null | undefined {
  return typeof source === 'function' ? source() : source;
}

/** Merge props for `<Comp {...a} b={x} {...c}/>`: later sources win, getters stay lazy. */
export function spreadProps(...sources: PropsSource[]): Dict {
  const find = (key: PropertyKey): Dict | undefined => {
    for (let i = sources.length - 1; i >= 0; i--) {
      const s = resolveSource(sources[i]!);
      if (s != null && key in s) return s;
    }
    return undefined;
  };
  return new Proxy({} as Dict, {
    get(_, key) {
      return find(key)?.[key];
    },
    has(_, key) {
      return find(key) !== undefined;
    },
    set(_, key, value) {
      const s = find(key);
      if (s !== undefined) s[key] = value;
      return true;
    },
    ownKeys() {
      const keys = new Set<string | symbol>();
      for (const source of sources) {
        const s = resolveSource(source);
        if (s != null) for (const k of Reflect.ownKeys(s)) keys.add(k);
      }
      return [...keys];
    },
    getOwnPropertyDescriptor(_, key) {
      const s = find(key);
      if (s === undefined) return undefined;
      return { configurable: true, enumerable: true, get: () => s[key], set: (v: unknown) => (s[key] = v) };
    },
  });
}

// ---------------------------------------------------------------------------
// Mounting
// ---------------------------------------------------------------------------

export type MountOptions<P> = {
  target: Element | DocumentFragment | ShadowRoot;
  props?: P;
  /** insert before this node instead of appending */
  anchor?: Node | null;
  /** context entries made available to the whole tree */
  context?: Map<unknown, unknown>;
};

export type App = {
  /** remove the app from the DOM and dispose every effect */
  destroy(): void;
  /** alias of destroy (compat with previous OWT versions) */
  unmount(): void;
};

export function mount<P>(component: Component<P>, options: MountOptions<P>): App {
  let disposeRoot: () => void = () => {};
  let first: Node | null = null;
  let last: Node | null = null;
  const marker = document.createTextNode('');
  options.target.insertBefore(marker, options.anchor ?? null);
  createRoot((disposeFn) => {
    disposeRoot = disposeFn;
    const owner = getOwner();
    if (owner !== null && options.context !== undefined) owner.ctx = new Map(options.context);
    const content = component((options.props ?? {}) as P);
    const range = insertContent(marker, content);
    first = range.first;
    last = range.last;
  });
  marker.remove();
  flushSync();
  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    disposeRoot();
    if (first !== null && last !== null) removeRange(first, last);
  };
  return { destroy, unmount: destroy };
}

export function unmount(app: App): void {
  app.destroy();
}

// ---------------------------------------------------------------------------
// Hot module replacement
// ---------------------------------------------------------------------------

const HMR = Symbol.for('owt.hmr');

type HmrMeta<P> = { source: Source<Component<P>>; original: Component<P> };
type HmrComponent<P> = Component<P> & { [HMR]?: HmrMeta<P> };

/** Wrap a component so mounted instances re-render when the module is hot-updated. */
export function hmr<P>(original: Component<P>): Component<P> {
  const source = new Source<Component<P>>(original, false);
  const wrapper: HmrComponent<P> = (props: P) => {
    const frag = document.createDocumentFragment();
    const start = document.createTextNode('');
    const anchor = document.createComment('');
    frag.append(start, anchor);
    dynamic(anchor, () => get(source), props);
    return frag;
  };
  wrapper[HMR] = { source, original };
  Object.defineProperty(wrapper, 'name', { value: original.name });
  return wrapper;
}

/** Point every live instance of `target` at the implementation from a freshly loaded module. */
export function hmrUpdate<P>(target: Component<P>, next: Component<P>): boolean {
  const meta = (target as HmrComponent<P>)[HMR];
  if (meta === undefined) return false;
  const nextMeta = (next as HmrComponent<P>)[HMR];
  set(meta.source, nextMeta !== undefined ? nextMeta.original : next);
  if (nextMeta !== undefined) nextMeta.source = meta.source;
  flushSync();
  return true;
}

// ---------------------------------------------------------------------------
// Portal
// ---------------------------------------------------------------------------

export type PortalProps = {
  /** CSS selector or element to render into (default: document.body) */
  target?: string | Element | null;
  children?: (args: Record<string, never>) => Node;
};

/** Render children somewhere else in the document (modals, toasts...). */
export function Portal(props: PortalProps): Node {
  const placeholder = document.createComment('portal');
  const owner = new Owner(getOwner());
  let range: { first: Node; last: Node } | null = null;
  const resolveTarget = (): Element => {
    const t = props.target;
    if (typeof t === 'string') return document.querySelector(t) ?? document.body;
    return t ?? document.body;
  };
  queueMicrotask(() => {
    if (owner.disposed || props.children === undefined) return;
    const host = resolveTarget();
    const end = document.createTextNode('');
    host.appendChild(end);
    const content = runWithOwner(owner, () => props.children!({}));
    range = insertContent(end, content);
    end.remove();
  });
  runWithOwner(owner, () => {
    (owner.cleanups ??= []).push(() => {
      if (range !== null) removeRange(range.first, range.last);
    });
  });
  return placeholder;
}

/** Keep one wrapper per component across hot updates (state lives in `import.meta.hot.data`). */
export function hmrAccept<P>(store: Record<string, Component<P>>, name: string, next: Component<P>): Component<P> {
  const existing = store[name];
  if (existing !== undefined && hmrUpdate(existing, next)) return existing;
  const wrapper = hmr(next);
  store[name] = wrapper;
  return wrapper;
}
