/**
 * Type-only helpers used by the virtual TypeScript that editor tooling
 * generates from `.owt` files (never imported at runtime).
 */
import type { OwtElements, OwtElementInstance } from './elements';
import type { LoopMeta, Snippet } from './dom/blocks';
import type { Action } from './dom/bindings';

type Iterated<T> = T extends readonly (infer U)[] ? U : T extends Iterable<infer U> ? U : T extends ArrayLike<infer U> ? U : T extends number ? number : unknown;

/** Event handler attributes accepted by `<window>`, `<document>` and `<body>`. */
export type GlobalTargetAttributes = {
  [key: `on${string}`]: ((event: Event) => unknown) | null | undefined;
};

export interface Helpers {
  /** an HTML / SVG element with its attributes */
  el<K extends keyof OwtElements>(tag: K, attrs: OwtElements[K]): OwtElementInstance<K>;
  /** a component with its props */
  component<P>(component: (props: P) => unknown, props: NoInfer<P>): void;
  /** `{expr}` text interpolation */
  text(value?: unknown): void;
  /** `for (x of value)` */
  iter<T>(value: T): Iterated<NonNullable<T>>[];
  /** `a..b` */
  range(from: number, to: number): number[];
  /** `rev x` */
  rev<T>(value: T): T;
  /** loop meta object */
  readonly meta: LoopMeta;
  /** `await (value) { } then (v) { } catch (e) { }` */
  await<T>(value: T, pending: () => void, then: (value: Awaited<T>) => void, caught: (error: unknown) => void): void;
  /** `reset` parameter of `catch (error, reset)` */
  readonly reset: () => void;
  /** `<slot name="x" ...args>` */
  slot<A>(snippet: Snippet<A> | null | undefined, args: A): void;
  /** `use:action={params}` */
  action<E extends Element, P>(action: Action<E, P>, el: E, ...params: P extends undefined ? [params?: P] : [params: P]): void;
  /** `on:event={handler}` */
  on(el: EventTarget, type: string, handler: ((event: CustomEvent) => unknown) | null | undefined): void;
  /** `ref={callback}` */
  ref<E extends Element>(el: E, callback: (el: E | null) => unknown): void;
  /** `class:name={value}` */
  classValue(value: unknown): void;
  /** `style:prop={value}` */
  styleValue(value: string | number | boolean | null | undefined): void;
  /** `<window>` / `<document>` / `<body>` events */
  target(kind: 'window' | 'document' | 'body', attrs: GlobalTargetAttributes): void;
  /** value produced by two-way bindings (`bind:value`): assignable to anything */
  readonly bound: never;
  /** what component functions return */
  readonly node: Node;
}

/** Snippet props implied by `<slot>` outlets that the props type does not declare. */
export type SlotProps<K extends string> = { [P in K]?: Snippet<{ [key: string]: unknown }> | null | undefined };

export type { Snippet, LoopMeta };
