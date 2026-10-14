/**
 * OWT public API.
 *
 * Inside `.owt` components you rarely need these: `var`, `val` and the
 * template syntax compile to them. They are what you use from plain
 * TypeScript modules (shared stores, utilities) and for lifecycle hooks.
 */
import {
  Computed,
  Source,
  effect,
  effectSync,
  get,
  onCleanup,
  set,
  untrack,
  type Equals,
} from './reactivity';
import { reactive } from './proxy';

export {
  batch,
  createContext,
  createRoot,
  effect,
  flushSync,
  getContext,
  getOwner,
  hasContext,
  onCleanup,
  runWithOwner,
  setContext,
  tick,
  untrack,
  type Context,
  type Equals,
  type Owner,
} from './reactivity';
export { isReactive, markRaw, reactive, toRaw } from './proxy';
export { mount, unmount, Portal, type App, type Component, type MountOptions, type PortalProps } from './dom/component';
export { range, rev, type LoopMeta, type Snippet } from './dom/blocks';
export type { Action, ActionReturn } from './dom/bindings';
export type { Animate, AnimationRects, Transition, TransitionConfig, TransitionDirection } from './dom/transitions';
export { lazy, resource, type LazyComponent, type Resource, type ResourceInfo, type ResourceOptions, type ResourceState } from './resource';
export { toClass } from './dom/attributes';

/** A readable reactive value. */
export interface ReadonlySignal<T> {
  readonly value: T;
  peek(): T;
}

/** A writable reactive value. */
export interface Signal<T> extends ReadonlySignal<T> {
  value: T;
}

/** Deeply reactive state, the TypeScript equivalent of `var` in components. */
export class State<T> extends Source<T> implements Signal<T> {
  constructor(value: T, equals?: Equals<T> | false) {
    super(reactive(value), equals);
  }
  override get value(): T {
    return get(this);
  }
  override set value(v: T) {
    set(this, reactive(v));
  }
}

/** Deeply reactive state (objects and arrays are proxied). */
export function state<T>(value: T): Signal<T>;
export function state<T = undefined>(): Signal<T | undefined>;
export function state<T>(value?: T): Signal<T | undefined> {
  return new State(value);
}

/** Shallow signal: only re-assignment is tracked. */
export function signal<T>(value: T, options?: { equals?: Equals<T> | false }): Signal<T> {
  return new Source(value, options?.equals);
}

/** Derived value, recomputed lazily when its dependencies change (`val` in components). */
export function computed<T>(fn: (previous: T | undefined) => T, options?: { equals?: Equals<T> | false }): ReadonlySignal<T> {
  return new Computed(fn, options?.equals);
}

/** Run once after the component is mounted. The returned function runs on destroy. */
export function onMount(fn: () => void | (() => void) | Promise<void>): void {
  effect(() => {
    const result = untrack(fn);
    return typeof result === 'function' ? result : undefined;
  });
}

/** Run when the component (or current scope) is destroyed. */
export function onDestroy(fn: () => void): void {
  onCleanup(fn);
}

/**
 * Watch a reactive expression and run `callback` when its value changes.
 * Returns a stop function.
 */
export function watch<T>(
  source: () => T,
  callback: (value: T, previous: T | undefined) => void | (() => void),
  options: { immediate?: boolean } = {},
): () => void {
  let first = true;
  let previous: T | undefined;
  const run = options.immediate ? effectSync : effect;
  return run(() => {
    const value = source();
    if (first) {
      first = false;
      previous = value;
      if (!options.immediate) return;
      return untrack(() => callback(value, undefined));
    }
    const prev = previous;
    previous = value;
    return untrack(() => callback(value, prev));
  });
}

export const version = '1.0.0-beta.1';
