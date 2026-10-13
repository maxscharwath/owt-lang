/**
 * Deep reactivity for plain objects and arrays.
 *
 * `reactive(obj)` returns a Proxy that tracks property reads and notifies on
 * writes, lazily wrapping nested plain objects/arrays. Class instances, Maps,
 * Dates, DOM nodes... are returned untouched. The raw object stays the single
 * source of truth (proxies never leak into it).
 */
import { Source, get, set, notify, untrack, batch, isTracking } from './reactivity';

const RAW = Symbol.for('owt.raw');
const proxies = new WeakMap<object, object>();
const skipped = new WeakSet<object>();

type Meta = {
  /** per-property signals, created lazily on tracked reads */
  props: Map<PropertyKey, Source<unknown>>;
  /** bumps whenever keys or array items change (iteration / ownKeys) */
  shape: Source<number>;
};
const metas = new WeakMap<object, Meta>();

type Dict = Record<PropertyKey, unknown>;

function isPlain(value: object): boolean {
  if (skipped.has(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === Array.prototype || proto === null;
}

/** Make a plain object / array deeply reactive. Other values are returned as-is. */
export function reactive<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;
  if ((value as Dict)[RAW] !== undefined) return value;
  if (!isPlain(value)) return value;
  const existing = proxies.get(value);
  if (existing !== undefined) return existing as T;
  const proxy: object = Array.isArray(value) ? new Proxy(value, arrayHandler) : new Proxy(value as Dict, objectHandler);
  proxies.set(value, proxy);
  return proxy as T;
}

/** Return the underlying raw object of a reactive proxy. */
export function toRaw<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    const raw = (value as Dict)[RAW];
    if (raw !== undefined) return raw as T;
  }
  return value;
}

export function isReactive(value: unknown): boolean {
  return typeof value === 'object' && value !== null && (value as Dict)[RAW] !== undefined;
}

/** Opt an object out of deep reactivity. */
export function markRaw<T extends object>(value: T): T {
  skipped.add(value);
  return value;
}

function metaOf(target: object): Meta {
  let meta = metas.get(target);
  if (meta === undefined) {
    meta = { props: new Map(), shape: new Source(0, false) };
    metas.set(target, meta);
  }
  return meta;
}

function trackProp(target: object, key: PropertyKey, current: unknown): void {
  const meta = metaOf(target);
  let s = meta.props.get(key);
  if (s === undefined) {
    s = new Source(current);
    meta.props.set(key, s);
  }
  get(s);
}

function trackShape(target: object): void {
  get(metaOf(target).shape);
}

function triggerProp(target: object, key: PropertyKey, value: unknown): void {
  const meta = metas.get(target);
  if (meta === undefined) return;
  const s = meta.props.get(key);
  if (s !== undefined) set(s, value);
}

function triggerShape(target: object): void {
  const meta = metas.get(target);
  if (meta !== undefined) notify(meta.shape);
}

/** Internal fast path for `for` blocks: track structural changes of an array once. */
export function trackArray<T>(list: readonly T[]): readonly T[] {
  const raw = toRaw(list);
  if (raw !== list && isTracking()) trackShape(raw);
  return raw;
}

const hasOwn = (o: object, k: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(o, k);

const objectHandler: ProxyHandler<Dict> = {
  get(target, key, receiver) {
    if (key === RAW) return target;
    const value: unknown = Reflect.get(target, key, receiver);
    if (typeof key === 'symbol') return value;
    if (isTracking()) {
      const desc = Object.getOwnPropertyDescriptor(target, key);
      if (desc === undefined || desc.get === undefined) trackProp(target, key, value);
    }
    return reactive(value);
  },
  set(target, key, value, receiver) {
    const raw = toRaw(value);
    const had = hasOwn(target, key);
    const desc = had ? Object.getOwnPropertyDescriptor(target, key) : undefined;
    if (desc !== undefined && desc.set !== undefined) return Reflect.set(target, key, value, receiver);
    const old = target[key];
    target[key] = raw;
    if (!had) triggerShape(target);
    if (!had || old !== raw) triggerProp(target, key, raw);
    return true;
  },
  deleteProperty(target, key) {
    if (!hasOwn(target, key)) return true;
    delete target[key];
    triggerProp(target, key, undefined);
    triggerShape(target);
    return true;
  },
  has(target, key) {
    if (key === RAW) return true;
    if (typeof key !== 'symbol' && isTracking()) trackProp(target, key, target[key]);
    return Reflect.has(target, key);
  },
  ownKeys(target) {
    if (isTracking()) trackShape(target);
    return Reflect.ownKeys(target);
  },
};

type AnyArray = unknown[];
type Fn = (...args: unknown[]) => unknown;
type ArrayMethod = (this: unknown, ...args: unknown[]) => unknown;
const native = Array.prototype as unknown as Record<string, Fn>;

/** Mutating methods run untracked and batched so they never subscribe the caller to `length`. */
const mutators = new Set(['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin']);
/** Callback iteration methods: track the array shape once, run on the raw array, hand out reactive items. */
const callbacks = new Set(['forEach', 'map', 'filter', 'some', 'every', 'find', 'findIndex', 'findLast', 'findLastIndex', 'flatMap']);
const reducers = new Set(['reduce', 'reduceRight']);
/** Plain reads: run on the raw array with raw arguments. */
const reads = new Set(['includes', 'indexOf', 'lastIndexOf', 'join', 'toString', 'toLocaleString', 'at', 'slice', 'concat', 'flat', 'toReversed', 'toSorted', 'toSpliced', 'with', 'values', 'entries', 'keys']);
/** Methods returning (raw) item collections whose items must be wrapped again. */
const wrapResults = new Set(['filter', 'slice', 'concat', 'flat', 'toReversed', 'toSorted', 'toSpliced', 'with']);

const methodCache = new WeakMap<object, Map<string, ArrayMethod>>();

function* reactiveValues(target: AnyArray): IterableIterator<unknown> {
  for (let i = 0; i < target.length; i++) yield reactive(target[i]);
}

function* reactiveEntries(target: AnyArray): IterableIterator<[number, unknown]> {
  for (let i = 0; i < target.length; i++) yield [i, reactive(target[i])];
}

function createArrayMethod(target: AnyArray, key: string, receiver: AnyArray): ArrayMethod | undefined {
  const fn = native[key];
  if (fn === undefined) return undefined;
  if (mutators.has(key)) {
    return (...args) => batch(() => untrack(() => fn.apply(receiver, args)));
  }
  if (callbacks.has(key)) {
    return (cb, thisArg) => {
      trackShape(target);
      const call = cb as Fn;
      const result = fn.call(target, (item: unknown, i: number) => call.call(thisArg, reactive(item), i, receiver));
      if (key === 'find' || key === 'findLast') return reactive(result);
      return wrapResults.has(key) ? (result as AnyArray).map(reactive) : result;
    };
  }
  if (reducers.has(key)) {
    return (cb, ...init) => {
      trackShape(target);
      const call = cb as Fn;
      return fn.call(target, (acc: unknown, item: unknown, i: number) => call(acc, reactive(item), i, receiver), ...init);
    };
  }
  if (reads.has(key)) {
    return (...args) => {
      trackShape(target);
      if (key === 'values') return reactiveValues(target);
      if (key === 'entries') return reactiveEntries(target);
      const result = fn.apply(target, args.map(toRaw));
      if (key === 'at') return reactive(result);
      return wrapResults.has(key) ? (result as AnyArray).map(reactive) : result;
    };
  }
  return undefined;
}

function arrayMethod(target: AnyArray, key: string, receiver: AnyArray): ArrayMethod | undefined {
  let cache = methodCache.get(target);
  if (cache === undefined) {
    cache = new Map();
    methodCache.set(target, cache);
  }
  let fn = cache.get(key);
  if (fn === undefined) {
    fn = createArrayMethod(target, key, receiver);
    if (fn === undefined) return undefined;
    cache.set(key, fn);
  }
  return fn;
}

const arrayHandler: ProxyHandler<AnyArray> = {
  get(target, key, receiver: AnyArray) {
    if (key === RAW) return target;
    if (typeof key === 'symbol') {
      if (key === Symbol.iterator) return arrayMethod(target, 'values', receiver);
      return Reflect.get(target, key, receiver);
    }
    if (key === 'length') {
      if (isTracking()) trackShape(target);
      return target.length;
    }
    if (!hasOwn(target, key)) {
      const method = arrayMethod(target, key, receiver);
      if (method !== undefined) return method;
    }
    const value: unknown = Reflect.get(target, key, receiver);
    if (isTracking() && typeof value !== 'function') trackProp(target, key, value);
    return reactive(value);
  },
  set(target, key, value) {
    const raw = toRaw(value);
    if (key === 'length') {
      const oldLength = target.length;
      target.length = raw as number;
      if (target.length !== oldLength) {
        for (let i = target.length; i < oldLength; i++) triggerProp(target, String(i), undefined);
        triggerShape(target);
      }
      return true;
    }
    const oldLength = target.length;
    const had = hasOwn(target, key);
    const old = (target as unknown as Dict)[key];
    (target as unknown as Dict)[key] = raw;
    if (!had || old !== raw || target.length !== oldLength) {
      triggerProp(target, key, raw);
      triggerShape(target);
    }
    return true;
  },
  deleteProperty(target, key) {
    if (!hasOwn(target, key)) return true;
    delete (target as unknown as Dict)[key];
    triggerProp(target, key, undefined);
    triggerShape(target);
    return true;
  },
  has(target, key) {
    if (key === RAW) return true;
    if (isTracking()) trackShape(target);
    return Reflect.has(target, key);
  },
  ownKeys(target) {
    if (isTracking()) trackShape(target);
    return Reflect.ownKeys(target);
  },
};
