export type ComponentInstance = {
  mount(target: HTMLElement): void;
  update(): void;
  destroy(): void;
};

export type ComponentFn<P = any> = (props: P) => ComponentInstance;

// Iteration meta passed to `for (..., meta)` blocks
export type LoopMeta = {
  index: number;
  first: boolean;
  last: boolean;
  even: boolean;
  odd: boolean;
};

export function mount<P>(Component: ComponentFn<P>, options: { props?: P; target: HTMLElement }) {
  const instance = Component(options?.props ?? {} as P);
  instance.mount(options.target);
  return instance;
}

// Global helpers used by generated code
export function* range(a: number, b: number): Iterable<number> {
  const start = (a as any) | 0;
  const end = (b as any) | 0;
  if (start > end) return; // empty
  for (let i = start; i <= end; i++) yield i;
}

type ArrayLikeOrIterable<T> = Iterable<T> | ArrayLike<T> | null | undefined;

export function toArray<T>(x: ArrayLikeOrIterable<T>): T[] {
  if (!x) return [] as T[];
  return Array.isArray(x) ? (x as T[]).slice() : Array.from(x as Iterable<T>);
}

export function rev<T>(x: Iterable<T> | ArrayLike<T> | null | undefined): Iterable<T> {
  const a = toArray(x);
  a.reverse();
  return a;
}

export function iter<T>(x: Iterable<T> | ArrayLike<T> | null | undefined): Iterable<T> {
  return (x as any) ?? [];
}

// Development logging hooks
export type DevLogger = (event: string, payload?: any) => void;

let __devLogger: DevLogger | null = null;

export function setDevLogger(logger: DevLogger | null) {
  __devLogger = logger;
}

export function devLog(event: string, payload?: any) {
  if (!__devLogger) return;
  try {
    __devLogger(event, payload);
  } catch {
    // ignore logger errors in production/dev
  }
}

// Small helpers that generated code can import to reduce output size
export function applyProps(el: HTMLElement, props: Record<string, unknown> | null | undefined) {
  if (!props) return;
  
  // Check if this is an SVG element
  const isSVG = el.namespaceURI === 'http://www.w3.org/2000/svg';
  
  for (const k in props) {
    const v = (props as any)[k];
    if (k.startsWith('on') && typeof v === 'function') {
      const evt = k.slice(2).toLowerCase();
      el.addEventListener(evt, (e) => { (v as Function)(e); });
    } else if (v == null) {
      continue;
    } else if (isSVG) {
      // For SVG elements, always use setAttribute to avoid read-only property issues
      el.setAttribute(k, String(v));
    } else if (k in el && !isReadOnlyProperty(el, k)) {
      (el as any)[k] = v;
    } else {
      el.setAttribute(k, String(v));
    }
  }
}

// Helper function to check if a property is read-only
function isReadOnlyProperty(el: HTMLElement, prop: string): boolean {
  const readOnlyProps = new Set([
    'viewBox', 'className', 'id', 'innerHTML', 'outerHTML', 'textContent'
  ]);
  return readOnlyProps.has(prop);
}

export function beforeRemove(n: Node | null | undefined) {
  try {
    if (!n) return;
    const stack: Node[] = [n];
    while (stack.length) {
      const node = stack.pop() as any;
      if (!node) continue;
      if (node.nodeType === 8 && (node as Comment).data === 'comp') {
        const inst = node.__owtInst;
        if (inst && typeof inst.destroy === 'function') inst.destroy();
      }
      let c = (node as Node).firstChild;
      while (c) {
        stack.push(c);
        c = c.nextSibling;
      }
    }
  } catch {}
}

// Event handler wrapping helpers
export function capPrev(ctx: any, varNames: string[]): Record<string, any> {
  const prev: Record<string, any> = Object.create(null);
  for (const vn of varNames) prev[vn] = ctx[vn];
  return prev;
}

export function writebackNotify(ctx: any, prev: Record<string, any>, varNames: string[]) {
  const changed: string[] = [];
  for (const vn of varNames) if (ctx[vn] !== prev[vn]) changed.push(vn);
  if (changed.length) ctx.__notify(changed);
}

// Computed text helper: builds a reactive text node bound to dependencies
export function computedText(
  ctx: any,
  deps: string[],
  compute: () => any
) {
  const tn = document.createTextNode(String(compute()));
  const updater = () => { tn.data = String(compute()); };
  for (const d of deps) {
    ctx.__subs[d] ||= [];
    ctx.__subs[d].push(updater);
  }
  return { node: tn, update: updater };
}

// Tiny DOM helpers to shrink generated code
export function e(tag: string): HTMLElement { return host.e(tag); }
export function ens(ns: string, tag: string): Element { return host.ens(ns, tag); }
export function t(data: string): Text { return host.t(data); }
export function a(el: Element, name: string, value: any) { return host.a(el, name, value); }
export function ap(parent: Node, child: Node) { return host.ap(parent, child); }
export function df(): DocumentFragment { return host.df(); }
export function cm(text: string): Comment { return host.cm(text); }

// Renderer host abstraction for multi-target support
export type Host = {
  e(tag: string): HTMLElement;
  ens(ns: string, tag: string): Element;
  t(data: string): Text;
  a(el: Element, name: string, value: any): void;
  ap(parent: Node, child: Node): void;
  df(): DocumentFragment;
  cm(text: string): Comment;
  applyProps(el: HTMLElement, props: Record<string, unknown> | null | undefined): void;
  beforeRemove(n: Node | null | undefined): void;
  computedText(ctx: any, deps: string[], compute: () => any): { node: Text; update: () => void };
};

export const domHost: Host = {
  e: (tag) => document.createElement(tag),
  ens: (ns, tag) => document.createElementNS(ns, tag),
  t: (data) => document.createTextNode(data),
  a: (el, name, value) => el.setAttribute(name, String(value)),
  ap: (parent, child) => parent.appendChild(child),
  df: () => document.createDocumentFragment(),
  cm: (text) => document.createComment(text),
  applyProps,
  beforeRemove,
  computedText,
};

export let host: Host = domHost;

export function setHost(h: Host) {
  host = h;
}
