/**
 * Transitions (`transition:`, `in:`, `out:`) on top of the Web Animations API.
 *
 * Transitions are local: an element's intro plays when the block content that
 * directly contains it (an `if` branch, a `for` row, an `await` state...) is
 * created by an update, and its outro plays when that content is removed.
 * Content created by the first render of a block (including the initial mount)
 * appears without intro. While outros run, the removed content stays in the
 * document with its effects already disposed, and is removed once every outro
 * has finished.
 */
import { Owner, dispose, getOwner, untrack } from '../reactivity';
import { removeRange } from './nodes';

/** What a transition function returns. `keyframes` go from the hidden to the visible state. */
export type TransitionConfig = {
  keyframes: Keyframe[] | PropertyIndexedKeyframes;
  /** ms, default 300 */
  duration?: number;
  /** ms, default 0 */
  delay?: number;
  /** CSS easing function, default `linear` */
  easing?: string;
};

export type TransitionDirection = 'in' | 'out' | 'both';

/** A transition function: `transition:fade`, `in:fly={{ y: 20 }}`, `out:slide`. */
export type Transition<E extends Element = Element, P = undefined> = (
  node: E,
  params: P,
  options: { direction: TransitionDirection },
) => TransitionConfig | null | undefined | false;

export const TRANSITION_IN = 1;
export const TRANSITION_OUT = 2;

const IDLE = 0;
const INTRO = 1;
const OUTRO = 2;

type Entry = {
  el: Element;
  fn: Transition<Element, unknown>;
  params: (() => unknown) | null;
  flags: number;
  state: number;
  animation: Animation | null;
};

/** Rectangles of an element before and after a list update. */
export type AnimationRects = { from: DOMRect; to: DOMRect };

/** `animate:flip`: called after a keyed list moved the element; returns keyframes from the old position to the new one. */
export type Animate<E extends Element = Element, P = undefined> = (
  node: E,
  rects: AnimationRects,
  params: P,
) => TransitionConfig | null | undefined | false;

type AnimateEntry = {
  el: Element;
  fn: Animate<Element, unknown>;
  params: (() => unknown) | null;
  animation: Animation | null;
};

/** Scope of a piece of content rendered by a block (branch, row, await state...). */
export class BlockScope extends Owner {
  /** created by an update rather than by the first render of its block: intros play */
  intro: boolean;
  transitions: Entry[] | null = null;
  /** `animate:` elements of a list row */
  animations: AnimateEntry[] | null = null;
  constructor(owner: Owner | null, intro: boolean) {
    super(owner);
    this.intro = intro;
  }
}

let pendingIntros: Entry[] = [];

/** Whether content rendered under `owner` now is created by an update (its intros play). */
export function introAllowed(owner: Owner | null): boolean {
  while (owner !== null && !(owner instanceof BlockScope)) owner = owner.owner;
  return owner !== null && owner.intro;
}

/** Register a transition on an element of the content being rendered. */
export function transition(el: Element, fn: Transition<Element, unknown>, params: (() => unknown) | null, flags: number): void {
  let scope = getOwner();
  while (scope !== null && !(scope instanceof BlockScope)) scope = scope.owner;
  if (scope === null) return;
  const entry: Entry = { el, fn, params, flags, state: IDLE, animation: null };
  (scope.transitions ??= []).push(entry);
  if (flags & TRANSITION_IN && scope.intro) {
    // intros start once the content is in the document (it may still be in a fragment now)
    if (pendingIntros.length === 0) queueMicrotask(flushIntros);
    pendingIntros.push(entry);
  }
}

function flushIntros(): void {
  const entries = pendingIntros;
  pendingIntros = [];
  for (const entry of entries) {
    if (entry.state !== IDLE || !entry.el.isConnected) continue;
    entry.state = INTRO;
    const animation = play(entry, true);
    if (animation === null) continue;
    entry.animation = animation;
    animation.finished.then(
      () => {
        if (entry.animation !== animation || entry.state !== INTRO) return;
        entry.animation = null;
        entry.state = IDLE;
        entry.el.dispatchEvent(new Event('introend'));
      },
      () => {},
    );
  }
}

function play(entry: Entry, intro: boolean): Animation | null {
  const el = entry.el;
  if (typeof el.animate !== 'function') return null;
  const direction: TransitionDirection = entry.flags === (TRANSITION_IN | TRANSITION_OUT) ? 'both' : intro ? 'in' : 'out';
  const params = entry.params === null ? undefined : untrack(entry.params);
  const config = untrack(() => entry.fn(el, params, { direction }));
  if (!config) return null;
  el.dispatchEvent(new Event(intro ? 'introstart' : 'outrostart'));
  return el.animate(config.keyframes, {
    duration: config.duration ?? 300,
    delay: config.delay ?? 0,
    easing: config.easing ?? 'linear',
    direction: intro ? 'normal' : 'reverse',
    fill: intro ? 'backwards' : 'both',
  });
}

/** Whether removing content of this scope has to wait for outros. */
export function hasOutros(scope: Owner): boolean {
  if (!(scope instanceof BlockScope) || scope.transitions === null) return false;
  for (const entry of scope.transitions) if (entry.flags & TRANSITION_OUT) return true;
  return false;
}

/**
 * Dispose the scope of a piece of content and remove its nodes, after the
 * outros of its elements have played.
 */
export function destroyContent(scope: Owner, first: Node, last: Node): void {
  const entries = scope instanceof BlockScope ? scope.transitions : null;
  dispose(scope);
  if (entries === null) {
    removeRange(first, last);
    return;
  }
  const running: Animation[] = [];
  // a leaving `animate:` row is taken out of the flow so the other rows can move into its place
  if (scope instanceof BlockScope && scope.animations !== null && entries.some((e) => e.flags & TRANSITION_OUT && e.el.isConnected)) {
    for (const entry of scope.animations) fixPosition(entry.el);
  }
  for (const entry of entries) {
    const intro = entry.animation;
    const state = entry.state;
    entry.state = OUTRO;
    if (!(entry.flags & TRANSITION_OUT)) {
      intro?.cancel();
      continue;
    }
    if (!entry.el.isConnected) continue;
    if (intro !== null && state === INTRO && entry.flags & TRANSITION_IN) {
      // `transition:` interrupted while coming in: play the intro backwards from where it is
      intro.reverse();
      entry.el.dispatchEvent(new Event('outrostart'));
      running.push(intro);
      continue;
    }
    intro?.cancel();
    const animation = play(entry, false);
    if (animation !== null) running.push(animation);
  }
  if (running.length === 0) {
    removeRange(first, last);
    return;
  }
  const nodes: Node[] = [];
  for (let node: Node | null = first; node !== null; node = node.nextSibling) {
    nodes.push(node);
    if (node === last) break;
  }
  let remaining = running.length;
  const done = () => {
    if (--remaining > 0) return;
    for (const entry of entries) if (entry.state === OUTRO && entry.flags & TRANSITION_OUT) entry.el.dispatchEvent(new Event('outroend'));
    for (const node of nodes) node.parentNode?.removeChild(node);
  };
  for (const animation of running) animation.finished.then(done, done);
}

/** Keep an element where it is while taking it out of the layout (position: absolute + correction). */
function fixPosition(el: Element): void {
  if (!(el instanceof HTMLElement) || !el.isConnected) return;
  const style = getComputedStyle(el);
  if (style.position === 'absolute' || style.position === 'fixed') return;
  const { width, height } = style;
  const before = el.getBoundingClientRect();
  el.style.position = 'absolute';
  el.style.width = width;
  el.style.height = height;
  const after = el.getBoundingClientRect();
  if (before.left !== after.left || before.top !== after.top) {
    const transform = style.transform === 'none' ? '' : `${style.transform} `;
    el.style.transform = `${transform}translate(${before.left - after.left}px, ${before.top - after.top}px)`;
  }
}

/** Register `animate:fn` on the root element of a list row. */
export function animate(el: Element, fn: Animate<Element, unknown>, params: (() => unknown) | null): void {
  let scope = getOwner();
  while (scope !== null && !(scope instanceof BlockScope)) scope = scope.owner;
  if (scope === null) return;
  (scope.animations ??= []).push({ el, fn, params, animation: null });
}

/** Whether list rows rendered like this one use `animate:`. */
export function hasAnimations(scope: Owner): boolean {
  return scope instanceof BlockScope && scope.animations !== null;
}

/** Positions of the animated elements of list rows, before the list is updated (null when none animate). */
export function measureRows(scopes: readonly Owner[]): Map<AnimateEntry, DOMRect> | null {
  const first = scopes[0];
  if (first === undefined || !(first instanceof BlockScope) || first.animations === null) return null;
  const rects = new Map<AnimateEntry, DOMRect>();
  for (const scope of scopes) {
    if (!(scope instanceof BlockScope) || scope.animations === null) continue;
    for (const entry of scope.animations) if (entry.el.isConnected) rects.set(entry, entry.el.getBoundingClientRect());
  }
  return rects;
}

/** After the update: animate every measured element that is still in the list from its old position. */
export function animateRows(rects: Map<AnimateEntry, DOMRect>, scopes: readonly Owner[]): void {
  for (const scope of scopes) {
    if (!(scope instanceof BlockScope) || scope.animations === null) continue;
    for (const entry of scope.animations) {
      const from = rects.get(entry);
      if (from === undefined || typeof entry.el.animate !== 'function') continue;
      entry.animation?.cancel();
      entry.animation = null;
      const to = entry.el.getBoundingClientRect();
      if (from.left === to.left && from.top === to.top && from.width === to.width && from.height === to.height) continue;
      const params = entry.params === null ? undefined : untrack(entry.params);
      const config = untrack(() => entry.fn(entry.el, { from, to }, params));
      if (!config) continue;
      const animation = entry.el.animate(config.keyframes, {
        duration: config.duration ?? 300,
        delay: config.delay ?? 0,
        easing: config.easing ?? 'linear',
        fill: 'backwards',
      });
      entry.animation = animation;
      animation.finished.then(
        () => {
          if (entry.animation === animation) entry.animation = null;
        },
        () => {},
      );
    }
  }
}
