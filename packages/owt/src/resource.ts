/**
 * Async data and code: `resource()` (like Solid's createResource or a tiny
 * React Query) and `lazy()` components (like React.lazy).
 */
import { Source, effectSync, get, getOwner, onCleanup, reportError, set, untrack } from './reactivity';
import { reactive } from './proxy';
import { dynamic } from './dom/blocks';
import type { Component } from './dom/component';

export type ResourceState = 'unresolved' | 'pending' | 'ready' | 'refreshing' | 'errored';

export type ResourceInfo = {
  /** aborted when the source changes, on refetch and when the owner is destroyed */
  signal: AbortSignal;
  /** true for `refetch()` and source changes after the first load */
  refetching: boolean;
};

/** Reactive async value: read `value`, `loading`, `error` or `state` anywhere and the UI follows. */
export type Resource<T, V = T | undefined> = {
  /** latest successful value (kept while a new request is pending) */
  readonly value: V;
  readonly loading: boolean;
  /** error of the latest request, undefined when it succeeded */
  readonly error: unknown;
  readonly state: ResourceState;
  /** load again with the current source; resolves with the new value (undefined if it failed or was superseded) */
  refetch(): Promise<T | undefined>;
  /** set the value locally (optimistic updates); does not cancel a pending request */
  mutate(value: V): void;
};

export type ResourceOptions<T> = {
  /** value before the first load completes (makes `value` non-optional) */
  initialValue?: T;
};

type Fetcher<S, T> = (source: S, info: ResourceInfo) => T | PromiseLike<T>;

/** `resource(fetcher)`: load once. `resource(source, fetcher)`: load again whenever `source()` changes (null / undefined / false: wait). */
export function resource<T>(fetcher: (info: ResourceInfo) => T | PromiseLike<T>): Resource<T>;
export function resource<T>(fetcher: (info: ResourceInfo) => T | PromiseLike<T>, options: ResourceOptions<T> & { initialValue: T }): Resource<T, T>;
export function resource<S, T>(source: () => S | null | undefined | false, fetcher: Fetcher<S, T>): Resource<T>;
export function resource<S, T>(source: () => S | null | undefined | false, fetcher: Fetcher<S, T>, options: ResourceOptions<T> & { initialValue: T }): Resource<T, T>;
export function resource<S, T>(
  first: (() => S | null | undefined | false) | ((info: ResourceInfo) => T | PromiseLike<T>),
  second?: Fetcher<S, T> | ResourceOptions<T>,
  third?: ResourceOptions<T>,
): Resource<T, T | undefined> {
  const options = (typeof second === 'object' ? second : third) ?? {};
  const value = new Source<T | undefined>(options.initialValue);
  const error = new Source<unknown>(undefined);
  const state = new Source<ResourceState>('unresolved');
  const owner = getOwner();
  let controller: AbortController | null = null;
  let token = 0;
  let loaded = false;
  /** how to load with the current source (null: the source is not ready) */
  let request: ((info: ResourceInfo) => T | PromiseLike<T>) | null = null;

  const load = (): Promise<T | undefined> => {
    controller?.abort();
    controller = null;
    const t = ++token;
    const run = request;
    if (run === null) return Promise.resolve(undefined);
    const ctrl = new AbortController();
    controller = ctrl;
    set(state, loaded ? 'refreshing' : 'pending');
    let result: T | PromiseLike<T>;
    try {
      result = untrack(() => run({ signal: ctrl.signal, refetching: loaded }));
    } catch (err) {
      set(error, err);
      set(state, 'errored');
      return Promise.resolve(undefined);
    }
    return Promise.resolve(result).then(
      (v) => {
        if (t !== token || owner?.disposed) return undefined;
        loaded = true;
        set(value, reactive(v));
        set(error, undefined);
        set(state, 'ready');
        return v;
      },
      (err: unknown) => {
        if (t !== token || owner?.disposed || ctrl.signal.aborted) return undefined;
        set(error, err);
        set(state, 'errored');
        return undefined;
      },
    );
  };

  if (typeof second === 'function') {
    const fetcher = second;
    // overload implementation: with a fetcher as second argument, the first one is the source
    const source = first as () => S | null | undefined | false;
    effectSync(() => {
      const s = source();
      request = s === null || s === undefined || s === false ? null : (info) => fetcher(s, info);
      untrack(() => void load());
    });
  } else {
    // overload implementation: without a source, the first argument is the fetcher
    request = first as (info: ResourceInfo) => T | PromiseLike<T>;
    void load();
  }
  onCleanup(() => {
    token++;
    controller?.abort();
  });

  return {
    get value() {
      return get(value);
    },
    get loading() {
      const s = get(state);
      return s === 'pending' || s === 'refreshing';
    },
    get error() {
      return get(error);
    },
    get state() {
      return get(state);
    },
    refetch: load,
    mutate(next) {
      set(value, reactive(next));
    },
  };
}

/** A component loaded on first use (code splitting): `const Chart = lazy(() => import('./Chart.owt'), 'Chart')`. */
export type LazyComponent<P> = Component<P> & {
  /** start loading now (e.g. on hover of a link) */
  preload(): Promise<Component<P>>;
};

type Module<P> = Component<P> | { default: Component<P> } | Record<string, unknown>;

export function lazy<P>(load: () => Promise<Module<P>>, exportName = 'default'): LazyComponent<P> {
  const loaded = new Source<Component<P> | null>(null);
  let promise: Promise<Component<P>> | null = null;
  const preload = (): Promise<Component<P>> => {
    promise ??= load().then((mod) => {
      const exported: unknown = typeof mod === 'function' ? mod : Reflect.get(mod, exportName);
      if (typeof exported !== 'function') throw new Error(`[owt] lazy(): the module has no component export '${exportName}'`);
      // a module export cannot be checked against the props type at runtime
      const component = exported as Component<P>;
      set(loaded, component);
      return component;
    });
    return promise;
  };
  const LazyComponent = (props: P): Node => {
    const ready = untrack(() => get(loaded));
    if (ready !== null) return ready(props);
    const owner = getOwner();
    preload().catch((err: unknown) => {
      promise = null;
      reportError(owner, err);
    });
    const frag = document.createDocumentFragment();
    const anchor = frag.appendChild(document.createComment(''));
    dynamic(anchor, () => get(loaded), props);
    return frag;
  };
  return Object.assign(LazyComponent, { preload });
}
