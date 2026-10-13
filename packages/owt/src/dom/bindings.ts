/** Two-way bindings (`bind:value`, `bind:checked`, `bind:group`, `bind:this`...) and actions (`use:`). */
import { effect, onCleanup, renderEffect, untrack } from '../reactivity';
import { listen } from './events';

type Getter<T> = () => T;
type Setter<T> = (value: T) => void;

type ValueElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function readInputValue(el: ValueElement): unknown {
  if (el instanceof HTMLInputElement && (el.type === 'number' || el.type === 'range')) {
    return el.value === '' ? null : Number(el.value);
  }
  return el.value;
}

/** `bind:value` on input / textarea / select. */
export function bindValue(el: ValueElement, get: Getter<unknown>, set: Setter<unknown>): void {
  if (el instanceof HTMLSelectElement) {
    bindSelect(el, get, set);
    return;
  }
  const event = el instanceof HTMLInputElement && (el.type === 'file' || el.type === 'checkbox' || el.type === 'radio') ? 'change' : 'input';
  listen(el, event, () => set(readInputValue(el)));
  renderEffect(() => {
    const value = get();
    const next = value == null ? '' : String(value);
    if (el.value !== next) {
      // keep "1." / "1e" while typing in number inputs
      if (readInputValue(el) === value) return;
      el.value = next;
    }
  });
}

function selectedValues(el: HTMLSelectElement): unknown[] {
  return Array.from(el.selectedOptions, (o) => optionValue(o));
}

function optionValue(option: HTMLOptionElement): unknown {
  const v = (option as HTMLOptionElement & { __value?: unknown }).__value;
  return v !== undefined ? v : option.value;
}

function applySelect(el: HTMLSelectElement, value: unknown): void {
  if (el.multiple) {
    const values = Array.isArray(value) ? value : [];
    for (const option of el.options) option.selected = values.includes(optionValue(option));
    return;
  }
  for (const option of el.options) {
    if (optionValue(option) === value) {
      option.selected = true;
      return;
    }
  }
  el.selectedIndex = -1;
}

function bindSelect(el: HTMLSelectElement, get: Getter<unknown>, set: Setter<unknown>): void {
  listen(el, 'change', () => set(el.multiple ? selectedValues(el) : optionValue(el.selectedOptions[0] ?? el.options[0]!)));
  renderEffect(() => {
    const value = get();
    applySelect(el, value);
  });
  // options rendered by blocks may arrive after the value: re-apply when they change
  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => applySelect(el, untrack(get)));
    observer.observe(el, { childList: true, subtree: true });
    onCleanup(() => observer.disconnect());
  }
}

/** Store a non-string value on an <option> (`<option value={obj}>`). */
export function optionValueProp(el: HTMLOptionElement, value: unknown): void {
  (el as HTMLOptionElement & { __value?: unknown }).__value = value;
  el.value = value == null ? '' : String(value);
}

export function bindChecked(el: HTMLInputElement, get: Getter<unknown>, set: Setter<boolean>): void {
  listen(el, 'change', () => set(el.checked));
  renderEffect(() => {
    el.checked = !!get();
  });
}

/** `bind:group` for radio buttons (single value) and checkboxes (array of values). */
export function bindGroup(el: HTMLInputElement, get: Getter<unknown>, set: Setter<unknown>, value: Getter<unknown>): void {
  const isCheckbox = el.type === 'checkbox';
  listen(el, 'change', () => {
    const v = untrack(value);
    if (!isCheckbox) {
      if (el.checked) set(v);
      return;
    }
    const current = untrack(get);
    const list = Array.isArray(current) ? current.filter((x) => x !== v) : [];
    if (el.checked) list.push(v);
    set(list);
  });
  renderEffect(() => {
    const current = get();
    const v = value();
    el.checked = isCheckbox ? Array.isArray(current) && current.includes(v) : current === v;
  });
}

/** `bind:this={el}` / `ref={el}`: also accepts callback refs. */
export function bindThis<T>(el: T, set: Setter<T | null> | ((el: T | null) => void)): void {
  set(el);
  onCleanup(() => {
    untrack(() => set(null));
  });
}

/** Generic property binding (`bind:open`, `bind:files`, `bind:textContent`, ...). */
export function bindProperty(el: Element, name: string, event: string, get: Getter<unknown>, set: Setter<unknown>): void {
  const target = el as unknown as Record<string, unknown>;
  listen(el, event, () => set(target[name]));
  if (name === 'files') return;
  renderEffect(() => {
    const value = get();
    if (target[name] !== value && value !== undefined) target[name] = value;
  });
}

const sizeObservers = new WeakMap<Element, Set<() => void>>();
let resizeObserver: ResizeObserver | null = null;

/** Read-only dimension bindings (`bind:clientWidth`, ...). */
export function bindSize(el: Element, name: 'clientWidth' | 'clientHeight' | 'offsetWidth' | 'offsetHeight', set: Setter<number>): void {
  if (typeof ResizeObserver === 'undefined') return;
  resizeObserver ??= new ResizeObserver((entries) => {
    for (const entry of entries) sizeObservers.get(entry.target)?.forEach((fn) => fn());
  });
  const update = () => set((el as HTMLElement)[name]);
  let set_ = sizeObservers.get(el);
  if (set_ === undefined) {
    set_ = new Set();
    sizeObservers.set(el, set_);
    resizeObserver.observe(el);
  }
  set_.add(update);
  queueMicrotask(update);
  onCleanup(() => {
    set_!.delete(update);
    if (set_!.size === 0) {
      sizeObservers.delete(el);
      resizeObserver?.unobserve(el);
    }
  });
}

export type ActionReturn<P> = void | (() => void) | { update?: (params: P) => void; destroy?: () => void };
export type Action<E extends Element = Element, P = undefined> = (el: E, params: P) => ActionReturn<P>;

/** `use:action={params}`: runs after the element is mounted, updates when params change. */
export function action<E extends Element, P>(el: E, fn: Action<E, P>, params?: Getter<P>): void {
  let instance: ActionReturn<P> | undefined;
  let started = false;
  effect(() => {
    const p = params === undefined ? (undefined as P) : params();
    untrack(() => {
      if (!started) {
        started = true;
        instance = fn(el, p);
      } else if (instance && typeof instance === 'object' && instance.update) {
        instance.update(p);
      }
    });
  });
  onCleanup(() => {
    if (typeof instance === 'function') instance();
    else if (instance && typeof instance === 'object') instance.destroy?.();
  });
}
