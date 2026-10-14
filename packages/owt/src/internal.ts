/**
 * Runtime entry point for compiled `.owt` modules. Not a public API: names
 * are short because they appear many times in generated code.
 */
import { Computed, Source, get, set as setSource } from './reactivity';
import { reactive } from './proxy';

export {
  get,
  notify,
  untrack,
  renderEffect as render,
  effect,
  onCleanup,
  getOwner,
  runWithOwner,
} from './reactivity';
export { reactive } from './proxy';
export { template, str, replace, comment, insertContent, TEMPLATE_FRAGMENT, TEMPLATE_SVG, TEMPLATE_MATHML } from './dom/nodes';
export { delegate, setDelegated as ev, on, listen, withModifiers } from './dom/events';
export { attr, attrNS, prop, cls, toggleClass, style, styleProp, spread } from './dom/attributes';
export {
  branch,
  when,
  keyed,
  dynamic,
  slot,
  awaitBlock,
  tryBlock,
  each,
  range,
  rev,
  EACH_ITEM_SOURCE,
  EACH_INDEX_SOURCE,
  EACH_META,
  EACH_ONLY_CHILD,
  EACH_KEY_INDEX,
} from './dom/blocks';
export { scope, propDefault, setProp, restProps, spreadProps, hmr, hmrUpdate, hmrAccept } from './dom/component';
export { head, title, injectCss } from './dom/document';
export { bindValue, bindChecked, bindGroup, bindThis, bindProperty, bindSize, action, optionValueProp } from './dom/bindings';
export { transition, animate, TRANSITION_IN, TRANSITION_OUT } from './dom/transitions';
export { selector } from './selector';

/** `var x = v` */
export function state<T>(value: T): Source<T> {
  return new Source(reactive(value));
}

/** `val x = expr` */
export function derived<T>(fn: () => T): Computed<T> {
  return new Computed(fn);
}

/** `x = v` on a `var` */
export function set<T>(source: Source<T>, value: T): T {
  setSource(source, reactive(value));
  return value;
}

/** Untracked read used for the left-hand side of compound assignments. */
export function peek<T>(source: Source<T>): T {
  return source.v;
}

/** `x++` / `x--` */
export function update(source: Source<number>, delta = 1): number {
  const value = source.v;
  setSource(source, value + delta);
  return value;
}

/** `++x` / `--x` */
export function updatePre(source: Source<number>, delta = 1): number {
  return setSource(source, source.v + delta);
}

/** Read helper that tolerates plain values (used for loop items that may or may not be signals). */
export function read<T>(value: T | Source<T>): T {
  return value instanceof Source ? get(value) : value;
}
