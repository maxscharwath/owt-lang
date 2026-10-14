/**
 * Web Components: `defineElement(tag, Component, options)` registers a custom
 * element that renders an OWT component.
 *
 * - declared props are reactive element properties, set from their (kebab-case)
 *   attributes with a coercion;
 * - callback props declared as `'event'` dispatch DOM `CustomEvent`s on the host;
 * - with a shadow root (the default), light-DOM children are projected through
 *   native `<slot>` elements and the CSS injected by OWT components is adopted;
 * - the component is mounted on connect and destroyed on disconnect (deferred
 *   to a microtask so that moving the element keeps its state).
 */
import { Source, get as read, set as write } from '../reactivity';
import { mount, type App, type Component } from './component';
import { watchInjectedCss } from './document';
import { DEV } from '../env';

/** Attribute coercions: `Number(attr)`, present and not `"false"`, as is, `JSON.parse(attr)`. */
export type ElementPropCoercion = StringConstructor | NumberConstructor | BooleanConstructor | ObjectConstructor | ArrayConstructor;

/** `'event'` is only accepted for callback props (or props of unknown type). */
type EventPropType<T> = unknown extends T ? 'event' : NonNullable<T> extends (...args: never[]) => unknown ? 'event' : never;

/**
 * How an element prop is set from its attribute: a coercion, a custom parser
 * (called with `null` when the attribute is removed), or `'event'` for a
 * callback prop that dispatches a DOM event instead.
 */
export type ElementPropType<T> = ElementPropCoercion | ((attribute: string | null) => T) | EventPropType<T>;

/** Props of `P` exposed by a custom element. */
export type ElementProps<P> = { [K in keyof P]?: ElementPropType<P[K]> };

export type ElementOptions<P, D extends ElementProps<P> = ElementProps<P>> = {
  /** props exposed as element properties and observed attributes (or dispatched as events) */
  props?: D & { [K in Exclude<keyof D, keyof P>]: never };
  /** render into an open shadow root (default) or, with `false`, into the element itself */
  shadow?: boolean;
  /** extra CSS for the shadow root, e.g. `:host { display: block }` */
  styles?: string;
};

/** An element created by `defineElement`: the declared (non-event) props are properties. */
export type OwtElement<P, D> = HTMLElement & {
  -readonly [K in keyof D as D[K] extends 'event' ? never : K]: K extends keyof P ? P[K] : never;
};

export type OwtElementConstructor<P, D> = {
  new (): OwtElement<P, D>;
  readonly prototype: OwtElement<P, D>;
  readonly observedAttributes: string[];
};

type AttributeParser = (attribute: string | null) => unknown;
type Props = Record<string, unknown>;

/** Component of each class created by `defineElement` (to recognize re-definitions under HMR). */
const components = new WeakMap<CustomElementConstructor, unknown>();
/** Constructable stylesheets shared by every shadow root, by CSS text. */
const sheets = new Map<string, CSSStyleSheet>();

/**
 * Register `tag` as a custom element rendering `component`. Returns the
 * element class (the existing one when `tag` is already defined with the same
 * component, e.g. when a module is re-run by HMR).
 */
export function defineElement<P, const D extends ElementProps<P> = Record<never, never>>(
  tag: string,
  component: Component<P>,
  options: ElementOptions<P, D> = {},
): OwtElementConstructor<P, D> {
  const existing = customElements.get(tag);
  if (existing !== undefined) {
    if (components.get(existing) !== component) throw new Error(`[owt] <${tag}> is already defined with another component`);
    // Created below by a previous call with the same component, so it has this shape.
    return existing as OwtElementConstructor<P, D>;
  }

  const parsers = new Map<string, AttributeParser>();
  const attributes = new Map<string, { key: string; parse: AttributeParser }>();
  const events = new Map<string, string>();
  const declared: [string, unknown][] = Object.entries(options.props ?? {});
  for (const [key, type] of declared) {
    if (type === 'event') {
      events.set(key, eventType(key));
    } else if (isAttributeType(type)) {
      const parse = attributeParser(type);
      parsers.set(key, parse);
      attributes.set(toAttribute(key), { key, parse });
    }
  }
  const shadow = options.shadow ?? true;
  const styles = options.styles;

  class OwtCustomElement extends HTMLElement {
    static readonly observedAttributes = [...attributes.keys()];

    static {
      for (const key of parsers.keys()) {
        Object.defineProperty(this.prototype, key, {
          configurable: true,
          enumerable: true,
          get(this: OwtCustomElement): unknown {
            return #sources in this ? read(this.#source(key)) : undefined;
          },
          set(this: OwtCustomElement, value: unknown) {
            write(this.#source(key), value);
          },
        });
      }
    }

    readonly #sources = new Map<string, Source<unknown>>();
    readonly #shadow: ShadowRoot | null;
    readonly #props: Props;
    /** light-DOM slot names ('' = default slot), tracked while mounted */
    #slots: Source<ReadonlySet<string>> | null = null;
    #app: App | null = null;
    #cleanups: (() => void)[] = [];

    constructor() {
      super();
      this.#shadow = shadow ? (this.shadowRoot ?? this.attachShadow({ mode: 'open' })) : null;
      this.#props = this.#createProps();
    }

    attributeChangedCallback(name: string, _previous: string | null, value: string | null): void {
      const attribute = attributes.get(name);
      if (attribute !== undefined) write(this.#source(attribute.key), attribute.parse(value));
    }

    connectedCallback(): void {
      this.#upgradeProperties();
      if (this.#app !== null) return;
      if (this.#shadow !== null) this.#cleanups.push(adoptStyles(this.#shadow, styles));
      // Typed boundary: the props proxy serves P's declared props, which TypeScript cannot express.
      this.#app = mount(component, { target: this.#shadow ?? this, props: this.#props as P });
    }

    disconnectedCallback(): void {
      queueMicrotask(() => {
        if (!this.isConnected) this.#destroy();
      });
    }

    #destroy(): void {
      const app = this.#app;
      if (app === null) return;
      this.#app = null;
      app.destroy();
      for (const cleanup of this.#cleanups.splice(0)) cleanup();
    }

    #source(key: string): Source<unknown> {
      let source = this.#sources.get(key);
      if (source === undefined) {
        source = new Source<unknown>(undefined);
        this.#sources.set(key, source);
      }
      return source;
    }

    /** Properties set before the element was upgraded shadow the accessors: apply them. */
    #upgradeProperties(): void {
      for (const key of parsers.keys()) {
        if (!Object.hasOwn(this, key)) continue;
        const value: unknown = Reflect.get(this, key);
        Reflect.deleteProperty(this, key);
        write(this.#source(key), value);
      }
    }

    #slotNames(): ReadonlySet<string> {
      let slots = this.#slots;
      if (slots === null) {
        const tracked = new Source(slotNames(this), sameNames);
        const observer = new MutationObserver(() => write(tracked, slotNames(this)));
        observer.observe(this, { childList: true });
        this.#cleanups.push(() => {
          observer.disconnect();
          this.#slots = null;
        });
        this.#slots = slots = tracked;
      }
      return read(slots);
    }

    /** Live props object: declared props, event dispatchers and native `<slot>` snippets. */
    #createProps(): Props {
      const dispatchers = new Map<string, (detail?: unknown) => void>();
      const snippets = new Map<string, () => Node>();
      const lookup = (key: string): unknown => {
        if (parsers.has(key)) return read(this.#source(key));
        const type = events.get(key);
        if (type !== undefined) {
          let dispatch = dispatchers.get(key);
          if (dispatch === undefined) {
            dispatch = (detail?: unknown) => {
              this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
            };
            dispatchers.set(key, dispatch);
          }
          return dispatch;
        }
        if (this.#shadow === null || !this.#slotNames().has(key === 'children' ? '' : key)) return undefined;
        let snippet = snippets.get(key);
        if (snippet === undefined) {
          snippet = nativeSlot(key === 'children' ? '' : key);
          snippets.set(key, snippet);
        }
        return snippet;
      };
      const has = (key: string | symbol): key is string =>
        typeof key === 'string' && (parsers.has(key) || events.has(key) || lookup(key) !== undefined);
      return new Proxy<Props>(
        {},
        {
          get: (_, key) => (typeof key === 'string' ? lookup(key) : undefined),
          has: (_, key) => has(key),
          set: (_, key, value) => {
            if (typeof key === 'string' && parsers.has(key)) write(this.#source(key), value);
            return true;
          },
          ownKeys: () => {
            const keys = new Set([...parsers.keys(), ...events.keys()]);
            if (this.#shadow !== null) for (const name of this.#slotNames()) keys.add(name === '' ? 'children' : name);
            return [...keys];
          },
          getOwnPropertyDescriptor: (_, key) => {
            if (!has(key)) return undefined;
            const desc: PropertyDescriptor = { configurable: true, enumerable: true, get: () => lookup(key) };
            if (parsers.has(key)) desc.set = (value: unknown) => write(this.#source(key), value);
            return desc;
          },
        },
      );
    }
  }

  const defined: CustomElementConstructor = OwtCustomElement;
  components.set(defined, component);
  customElements.define(tag, defined);
  // The declared props are accessors added to the prototype at runtime, which TypeScript cannot see.
  return defined as OwtElementConstructor<P, D>;
}

function isAttributeType(type: unknown): type is ElementPropCoercion | AttributeParser {
  return typeof type === 'function';
}

function attributeParser(type: ElementPropCoercion | AttributeParser): AttributeParser {
  if (type === Boolean) return (value) => value !== null && value !== 'false';
  if (type === Number) return (value) => (value === null ? undefined : Number(value));
  if (type === String) return (value) => value ?? undefined;
  if (type === Object || type === Array) return parseJson;
  return type;
}

function parseJson(value: string | null): unknown {
  if (value === null) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed;
  } catch {
    if (DEV) console.warn(`[owt] invalid JSON in attribute: ${value}`);
    return undefined;
  }
}

/** `maxValue` → `max-value` */
function toAttribute(key: string): string {
  let name = '';
  for (const char of key) {
    const lower = char.toLowerCase();
    name += lower !== char && name !== '' ? `-${lower}` : lower;
  }
  return name;
}

/** `onChange` → `change`, `onValueChange` → `valuechange` (like `onX` listeners in markup); other names as is. */
function eventType(key: string): string {
  const third = key.charAt(2);
  return key.startsWith('on') && third !== '' && third !== third.toLowerCase() ? key.slice(2).toLowerCase() : key;
}

function isElement(node: Node): node is Element {
  return node.nodeType === 1;
}

/** Slots used by the host's children ('' = default slot; whitespace-only text does not count). */
function slotNames(host: HTMLElement): ReadonlySet<string> {
  const names = new Set<string>();
  for (let node = host.firstChild; node !== null; node = node.nextSibling) {
    if (isElement(node)) names.add(node.getAttribute('slot') ?? '');
    else if (node.nodeType === 3 && (node.textContent ?? '').trim() !== '') names.add('');
  }
  return names;
}

function sameNames(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const name of a) if (!b.has(name)) return false;
  return true;
}

/** Snippet rendering a native `<slot>` (slot arguments cannot reach light-DOM content). */
function nativeSlot(name: string): () => Node {
  return () => {
    const slot = document.createElement('slot');
    if (name !== '') slot.name = name;
    return slot;
  };
}

function canAdoptSheets(root: ShadowRoot): boolean {
  return 'adoptedStyleSheets' in root && typeof CSSStyleSheet === 'function' && 'replaceSync' in CSSStyleSheet.prototype;
}

function sheet(css: string): CSSStyleSheet {
  let result = sheets.get(css);
  if (result === undefined) {
    result = new CSSStyleSheet();
    result.replaceSync(css);
    sheets.set(css, result);
  }
  return result;
}

/**
 * Give a shadow root the CSS injected by OWT components (now and later),
 * followed by `extra`: constructable stylesheets when supported, `<style>`
 * elements otherwise. Returns a function that removes them.
 */
function adoptStyles(root: ShadowRoot, extra: string | undefined): () => void {
  if (canAdoptSheets(root)) {
    const injected: CSSStyleSheet[] = [];
    const tail = extra === undefined ? [] : [sheet(extra)];
    const owned = (s: CSSStyleSheet) => injected.includes(s) || tail.includes(s);
    const stop = watchInjectedCss((added) => {
      for (const css of added) injected.push(sheet(css));
      root.adoptedStyleSheets = [...root.adoptedStyleSheets.filter((s) => !owned(s)), ...injected, ...tail];
    });
    return () => {
      stop();
      root.adoptedStyleSheets = root.adoptedStyleSheets.filter((s) => !owned(s));
    };
  }
  const end = document.createElement('style');
  end.textContent = extra ?? '';
  root.insertBefore(end, root.firstChild);
  const elements: HTMLStyleElement[] = [end];
  const stop = watchInjectedCss((added) => {
    for (const css of added) {
      const style = document.createElement('style');
      style.textContent = css;
      root.insertBefore(style, end);
      elements.push(style);
    }
  });
  return () => {
    stop();
    for (const style of elements) style.remove();
  };
}
