/** Attribute, property, class and style helpers used by compiled templates. */
import { renderEffect } from '../reactivity';
import { eventType, listen } from './events';

type Dict = Record<string, unknown>;
type ElementWithStore = Element & {
  $$style?: Dict | undefined;
  $$spread?: Dict | undefined;
  $$listeners?: Record<string, EventListener> | undefined;
};

export function attr(el: Element, name: string, value: unknown): void {
  if (value == null || value === false) {
    el.removeAttribute(name);
  } else if (value === true) {
    el.setAttribute(name, name.startsWith('aria-') || name.startsWith('data-') ? 'true' : '');
  } else {
    el.setAttribute(name, typeof value === 'string' ? value : String(value));
  }
}

export function attrNS(el: Element, ns: string, name: string, value: unknown): void {
  if (value == null || value === false) el.removeAttributeNS(ns, name.slice(name.indexOf(':') + 1));
  else el.setAttributeNS(ns, name, value === true ? '' : String(value));
}

export function prop(el: Element, name: string, value: unknown): void {
  const target = el as unknown as Dict;
  if (name === 'value') {
    const v = value == null ? '' : value;
    if (target.value !== v) target.value = v;
    return;
  }
  target[name] = value;
}

/** Normalize `class` values: strings, arrays and `{ name: condition }` objects (clsx semantics). */
export function toClass(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null || value === false || value === true) return '';
  if (typeof value === 'number') return String(value);
  let out = '';
  if (Array.isArray(value)) {
    for (const item of value) {
      const c = toClass(item);
      if (c) out = out ? `${out} ${c}` : c;
    }
    return out;
  }
  if (typeof value === 'object') {
    for (const key in value as Dict) {
      if ((value as Dict)[key]) out = out ? `${out} ${key}` : key;
    }
  }
  return out;
}

export function cls(el: Element, value: unknown, scope?: string): void {
  const c = toClass(value);
  const full = scope ? (c ? `${c} ${scope}` : scope) : c;
  if (full) el.setAttribute('class', full);
  else el.removeAttribute('class');
}

export function toggleClass(el: Element, name: string, on: unknown): void {
  el.classList.toggle(name, !!on);
}

const hyphenateCache = new Map<string, string>();

function hyphenate(name: string): string {
  if (name.startsWith('--')) return name;
  let out = hyphenateCache.get(name);
  if (out === undefined) {
    out = '';
    for (const ch of name) out += ch >= 'A' && ch <= 'Z' ? `-${ch.toLowerCase()}` : ch;
    hyphenateCache.set(name, out);
  }
  return out;
}

export function styleProp(el: Element, name: string, value: unknown, important = false): void {
  const style = (el as HTMLElement).style;
  if (value == null || value === false || value === '') style.removeProperty(name);
  else style.setProperty(name, String(value), important ? 'important' : '');
}

/** `style={...}`: strings replace the inline style, objects are diffed property by property. */
export function style(el: Element, value: unknown): void {
  const store = el as ElementWithStore;
  if (value == null || typeof value !== 'object') {
    store.$$style = undefined;
    if (value == null || value === false || value === '') el.removeAttribute('style');
    else el.setAttribute('style', String(value));
    return;
  }
  const prev = store.$$style;
  const next = value as Dict;
  if (prev !== undefined) {
    for (const key in prev) if (!(key in next)) styleProp(el, hyphenate(key), null);
  }
  for (const key in next) {
    const v = next[key];
    if (prev === undefined || prev[key] !== v) styleProp(el, hyphenate(key), v);
  }
  store.$$style = { ...next };
}

/** DOM properties that must be set as properties rather than attributes. */
export const PROPERTIES = new Set([
  'value',
  'checked',
  'selected',
  'muted',
  'indeterminate',
  'defaultValue',
  'defaultChecked',
  'innerHTML',
  'textContent',
  'innerText',
  'srcObject',
  'volume',
  'currentTime',
  'playbackRate',
  'scrollTop',
  'scrollLeft',
]);

function setEventProp(el: ElementWithStore, key: string, value: unknown): void {
  const { type, capture } = eventType(key);
  const listeners = (el.$$listeners ??= {});
  const id = capture ? `${type}:capture` : type;
  const prev = listeners[id];
  if (prev !== undefined) el.removeEventListener(type, prev, capture);
  if (typeof value === 'function') {
    const listener = value as EventListener;
    listeners[id] = listener;
    listen(el, type, listener, capture);
  } else {
    delete listeners[id];
  }
}

function setSpreadKey(el: ElementWithStore, key: string, value: unknown, scope: string | undefined): void {
  if (key === 'children' || key === 'ref') return;
  if (key.startsWith('on') && key.length > 2) {
    setEventProp(el, key, value);
  } else if (key === 'class' || key === 'className') {
    cls(el, value, scope);
  } else if (key === 'style') {
    style(el, value);
  } else if (PROPERTIES.has(key)) {
    prop(el, key, value);
  } else {
    attr(el, key, value);
  }
}

/** Reactive `{...attrs}` spread on an element. */
export function spread(el: Element, getValue: () => Dict | null | undefined, scope?: string): void {
  const store = el as ElementWithStore;
  renderEffect(() => {
    const next = getValue() ?? {};
    const prev = store.$$spread;
    if (prev !== undefined) {
      for (const key in prev) if (!(key in next)) setSpreadKey(store, key, undefined, scope);
    }
    let hasClass = false;
    for (const key in next) {
      if (key === 'class' || key === 'className') hasClass = true;
      const v = next[key];
      if (prev === undefined || prev[key] !== v) setSpreadKey(store, key, v, scope);
    }
    if (!hasClass && scope && (prev === undefined || 'class' in prev || 'className' in prev)) cls(el, null, scope);
    store.$$spread = { ...next };
  });
}
