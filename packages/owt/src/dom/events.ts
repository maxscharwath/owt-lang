/**
 * Event handling. Common bubbling events are delegated: one listener per event
 * type on the document, handlers stored on the element (`el.$$click`). This
 * keeps large lists cheap to create and destroy.
 */
import { onCleanup } from '../reactivity';

type Handler = (this: unknown, event: Event) => unknown;
type HandlerHost = Node & { [key: string]: unknown; host?: Node };

/** Events the compiler may delegate (they bubble and are frequent). */
export const DELEGATED_EVENTS = new Set([
  'beforeinput',
  'click',
  'contextmenu',
  'dblclick',
  'focusin',
  'focusout',
  'input',
  'keydown',
  'keyup',
  'mousedown',
  'mousemove',
  'mouseout',
  'mouseover',
  'mouseup',
  'pointerdown',
  'pointermove',
  'pointerout',
  'pointerover',
  'pointerup',
  'touchend',
  'touchmove',
  'touchstart',
]);

const registered = new Set<string>();

/** Install document-level listeners for delegated event types (idempotent). */
export function delegate(types: readonly string[]): void {
  if (typeof document === 'undefined') return;
  for (const type of types) {
    if (registered.has(type)) continue;
    registered.add(type);
    document.addEventListener(type, dispatchDelegated);
  }
}

function dispatchDelegated(event: Event): void {
  const key = `$$${event.type}`;
  const path = event.composedPath();
  let node = (path[0] ?? event.target) as HandlerHost | null;
  Object.defineProperty(event, 'currentTarget', {
    configurable: true,
    get() {
      return node ?? document;
    },
  });
  while (node !== null && node !== undefined) {
    const handler = node[key] as Handler | undefined;
    if (handler !== undefined && !(node as unknown as { disabled?: boolean }).disabled) {
      handler.call(node, event);
      if (event.cancelBubble) return;
    }
    node = (node.parentNode ?? node.host ?? null) as HandlerHost | null;
  }
}

/** Attach a delegated handler. */
export function setDelegated(el: Node, type: string, handler: Handler | null | undefined): void {
  (el as HandlerHost)[`$$${type}`] = handler ?? undefined;
}

/** Attach a regular listener, removed when the current owner is disposed. */
export function on(
  target: EventTarget,
  type: string,
  handler: Handler,
  options?: boolean | AddEventListenerOptions,
): () => void {
  const listener = (event: Event) => handler.call(target, event);
  target.addEventListener(type, listener, options);
  const off = () => target.removeEventListener(type, listener, options);
  onCleanup(off);
  return off;
}

/** Attach a listener without registering any cleanup (element-owned listeners). */
export function listen(el: EventTarget, type: string, handler: Handler, options?: boolean | AddEventListenerOptions): void {
  el.addEventListener(type, handler as EventListener, options);
}

/** Event attribute name (`onClick`, `onKeyDown`, `on:my-event`, `onClickCapture`) to DOM event type. */
export function eventType(attribute: string): { type: string; capture: boolean } {
  if (attribute.startsWith('on:')) return { type: attribute.slice(3), capture: false };
  let name = attribute.slice(2);
  let capture = false;
  if (name.length > 7 && name.endsWith('Capture') && name !== 'GotPointerCapture' && name !== 'LostPointerCapture') {
    name = name.slice(0, -7);
    capture = true;
  }
  const type = name.toLowerCase();
  return { type: type === 'doubleclick' ? 'dblclick' : type, capture };
}

// Event modifiers (`onClick|once|preventDefault`): flags shared with the compiler.
const MOD_PREVENT = 1;
const MOD_STOP = 2;
const MOD_STOP_IMMEDIATE = 4;
const MOD_SELF = 8;
const MOD_TRUSTED = 16;
const MOD_ONCE = 32;
const MOD_CTRL = 64;
const MOD_SHIFT = 128;
const MOD_ALT = 256;
const MOD_META = 512;
const MOD_EXACT = 1024;

type ModifierEvent = Event & Partial<Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey'>> & { button?: number };

/**
 * Wrap a handler with event modifiers: guards first (self, trusted, system
 * keys, key, mouse button), then preventDefault / stopPropagation, then the
 * handler (which may be omitted: `onSubmit|preventDefault`).
 */
export function withModifiers(handler: Handler | null | undefined, flags: number, keys: readonly string[] | null, button = -1): Handler {
  let done = false;
  return function (this: unknown, event: Event) {
    if (done) return undefined;
    const e: ModifierEvent = event;
    if (flags & MOD_SELF && e.target !== e.currentTarget) return undefined;
    if (flags & MOD_TRUSTED && !e.isTrusted) return undefined;
    if (flags & MOD_CTRL && !e.ctrlKey) return undefined;
    if (flags & MOD_SHIFT && !e.shiftKey) return undefined;
    if (flags & MOD_ALT && !e.altKey) return undefined;
    if (flags & MOD_META && !e.metaKey) return undefined;
    if (
      flags & MOD_EXACT &&
      ((!(flags & MOD_CTRL) && e.ctrlKey === true) ||
        (!(flags & MOD_SHIFT) && e.shiftKey === true) ||
        (!(flags & MOD_ALT) && e.altKey === true) ||
        (!(flags & MOD_META) && e.metaKey === true))
    ) {
      return undefined;
    }
    if (keys !== null) {
      const key = e.key;
      if (typeof key !== 'string' || !keys.includes(key.length === 1 ? key.toLowerCase() : key)) return undefined;
    }
    if (button >= 0 && e.button !== button) return undefined;
    if (flags & MOD_PREVENT) e.preventDefault();
    if (flags & MOD_STOP) e.stopPropagation();
    if (flags & MOD_STOP_IMMEDIATE) e.stopImmediatePropagation();
    if (flags & MOD_ONCE) done = true;
    return typeof handler === 'function' ? handler.call(this, event) : undefined;
  };
}
