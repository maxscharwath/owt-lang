/**
 * Type-only helpers used by the virtual TypeScript that editor tooling
 * generates from `.owt` files (never imported at runtime).
 */
import type { DOMAttributes, OwtElements, OwtElementInstance } from './elements';
import type { LoopMeta, Snippet } from './dom/blocks';
import type { Action } from './dom/bindings';
import type { Animate, Transition } from './dom/transitions';

type Iterated<T> = T extends readonly (infer U)[] ? U : T extends Iterable<infer U> ? U : T extends ArrayLike<infer U> ? U : T extends number ? number : unknown;

/** Events only dispatched on `window` (and mirrored on `<body>`). */
type WindowOnlyEvents = {
  onAfterPrint: Event;
  onBeforePrint: Event;
  onBeforeUnload: BeforeUnloadEvent;
  onDeviceMotion: DeviceMotionEvent;
  onDeviceOrientation: DeviceOrientationEvent;
  onHashChange: HashChangeEvent;
  onLanguageChange: Event;
  onMessage: MessageEvent;
  onMessageError: MessageEvent;
  onOffline: Event;
  onOnline: Event;
  onPageHide: PageTransitionEvent;
  onPageShow: PageTransitionEvent;
  onPopState: PopStateEvent;
  onRejectionHandled: PromiseRejectionEvent;
  onStorage: StorageEvent;
  onUnhandledRejection: PromiseRejectionEvent;
  onUnload: Event;
};

/** Events only dispatched on `document`. */
type DocumentOnlyEvents = {
  onDOMContentLoaded: Event;
  onFullscreenChange: Event;
  onFullscreenError: Event;
  onPointerLockChange: Event;
  onPointerLockError: Event;
  onReadyStateChange: Event;
  onVisibilityChange: Event;
};

/** Event attributes of `<window>`, `<document>` and `<body>`. */
export type TargetAttributes<T extends EventTarget, Extra> = DOMAttributes<T> & {
  [K in Exclude<keyof Extra, keyof DOMAttributes<T>>]?: ((event: Extra[K] & { currentTarget: T }) => unknown) | null | undefined;
};

export interface Helpers {
  /** an HTML / SVG element with its attributes */
  el<K extends keyof OwtElements>(tag: K, attrs: OwtElements[K]): OwtElementInstance<K>;
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
  /** element of an array pattern (`[first, second]`): the pattern checked the length */
  at<T extends readonly unknown[], I extends number>(array: T, index: I): number extends T['length'] ? T[number] : T[I];
  /** end of a `match` without `default`: fails to type-check when a case is missing */
  exhaustive(value: never): void;
  /** `<slot name="x" ...args>` */
  slot<A>(snippet: Snippet<A> | null | undefined, args: A): void;
  /** `use:action={params}` */
  action<E extends Element, P>(action: Action<E, P>, el: E, ...params: undefined extends P ? [params?: P] : [params: P]): void;
  /** `transition:fn={params}`, `in:fn`, `out:fn` */
  transition<E extends Element, P>(fn: Transition<E, P>, el: E, ...params: undefined extends P ? [params?: P] : [params: P]): void;
  /** `animate:fn={params}` */
  animate<E extends Element, P>(fn: Animate<E, P>, el: E, ...params: undefined extends P ? [params?: P] : [params: P]): void;
  /** `on:event={handler}` */
  on(el: EventTarget, type: string, handler: ((event: CustomEvent) => unknown) | null | undefined): void;
  /** `ref={callback}` */
  ref<E extends Element>(el: E, callback: (el: E | null) => unknown): void;
  /** `class:name={value}` */
  classValue(value: unknown): void;
  /** `style:prop={value}` */
  styleValue(value: string | number | boolean | null | undefined): void;
  /** `<window>` / `<document>` / `<body>` events */
  target(kind: 'window', attrs: TargetAttributes<Window, WindowOnlyEvents>): void;
  target(kind: 'document', attrs: TargetAttributes<Document, DocumentOnlyEvents>): void;
  target(kind: 'body', attrs: TargetAttributes<HTMLBodyElement, WindowOnlyEvents>): void;
  /** value written by a two-way binding whose type is not known statically: assignable to anything */
  readonly bound: never;
  /** value written by a two-way binding (`bind:checked` → boolean, number input → number | null...) */
  value<T>(): T;
  /** `bind:group` on radio inputs: the value of the checked input */
  group<T>(value: T): T;
  /** `bind:group` on checkboxes: the values of the checked inputs */
  groupList<T>(value: T): T[];
  /** what component functions return */
  readonly node: Node;
}

/** Snippet props implied by `<slot>` outlets that the props type does not declare. */
export type SlotProps<K extends string> = { [P in K]?: Snippet<{ [key: string]: unknown }> | null | undefined };

export type { Snippet, LoopMeta };
