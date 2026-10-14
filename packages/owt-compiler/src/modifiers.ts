/**
 * Event modifiers: `onSubmit|preventDefault={save}`, `onKeyDown|ctrl|enter={send}`,
 * `onScroll|passive={...}`. Guards (`self`, `trusted`, keys, buttons, system
 * keys) are checked first; then `preventDefault` / `stopPropagation` run and
 * the handler is called. Flags must match `withModifiers` in the runtime.
 */

export const MOD_PREVENT = 1;
export const MOD_STOP = 2;
export const MOD_STOP_IMMEDIATE = 4;
export const MOD_SELF = 8;
export const MOD_TRUSTED = 16;
export const MOD_ONCE = 32;
export const MOD_CTRL = 64;
export const MOD_SHIFT = 128;
export const MOD_ALT = 256;
export const MOD_META = 512;
export const MOD_EXACT = 1024;

export type EventModifiers = {
  flags: number;
  /** accepted `event.key` values (single characters lower-cased), null = any key */
  keys: string[] | null;
  /** required `event.button`, -1 = any */
  button: number;
  capture: boolean;
  passive: boolean;
};

const FLAGS: Record<string, number> = {
  preventDefault: MOD_PREVENT,
  stopPropagation: MOD_STOP,
  stopImmediatePropagation: MOD_STOP_IMMEDIATE,
  self: MOD_SELF,
  trusted: MOD_TRUSTED,
  once: MOD_ONCE,
  ctrl: MOD_CTRL,
  shift: MOD_SHIFT,
  alt: MOD_ALT,
  meta: MOD_META,
  exact: MOD_EXACT,
};

const KEYS: Record<string, string[]> = {
  enter: ['Enter'],
  escape: ['Escape'],
  esc: ['Escape'],
  space: [' '],
  tab: ['Tab'],
  delete: ['Delete', 'Backspace'],
  backspace: ['Backspace'],
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  home: ['Home'],
  end: ['End'],
  'page-up': ['PageUp'],
  'page-down': ['PageDown'],
};

export const MODIFIER_NAMES = [...Object.keys(FLAGS), 'capture', 'passive', ...Object.keys(KEYS), 'left', 'right', 'middle'];

function isKeyEvent(type: string): boolean {
  return type === 'keydown' || type === 'keyup' || type === 'keypress';
}

function isAlphanumeric(s: string): boolean {
  const c = s.charCodeAt(0);
  return s.length === 1 && ((c >= 48 && c <= 57) || (c >= 97 && c <= 122));
}

/** Event of an `onX` attribute name: `onKeyDown` → keydown, `onClickCapture` → click (capture phase). */
export function eventInfo(name: string): { type: string; capture: boolean } | null {
  if (name.length > 2 && name.startsWith('on') && name.charCodeAt(2) >= 65 && name.charCodeAt(2) <= 90) {
    let base = name.slice(2);
    let capture = false;
    if (base.length > 7 && base.endsWith('Capture') && base !== 'GotPointerCapture' && base !== 'LostPointerCapture') {
      base = base.slice(0, -7);
      capture = true;
    }
    const type = base.toLowerCase();
    return { type: type === 'doubleclick' ? 'dblclick' : type, capture };
  }
  return null;
}

/** Split `onClick|once|preventDefault` into the attribute name and its modifiers. */
export function splitModifiers(name: string): { name: string; modifiers: string[] } {
  const parts = name.split('|');
  return { name: parts[0]!, modifiers: parts.slice(1) };
}

export function parseModifiers(modifiers: readonly string[], type: string): EventModifiers | string {
  const out: EventModifiers = { flags: 0, keys: null, button: -1, capture: false, passive: false };
  const addKeys = (keys: string[]) => {
    out.keys = [...(out.keys ?? []), ...keys];
  };
  for (const m of modifiers) {
    const flag = FLAGS[m];
    if (flag !== undefined) out.flags |= flag;
    else if (m === 'capture') out.capture = true;
    else if (m === 'passive') out.passive = true;
    else if ((m === 'left' || m === 'right') && isKeyEvent(type)) addKeys([m === 'left' ? 'ArrowLeft' : 'ArrowRight']);
    else if (m === 'left' || m === 'right' || m === 'middle') {
      if (isKeyEvent(type)) return `|${m} is a mouse button: use it on mouse or pointer events`;
      out.button = m === 'left' ? 0 : m === 'middle' ? 1 : 2;
    } else if (KEYS[m] !== undefined || isAlphanumeric(m)) {
      if (!isKeyEvent(type)) return `|${m} is a key: use it on onKeyDown / onKeyUp`;
      addKeys(KEYS[m] ?? [m]);
    } else {
      return `Unknown event modifier |${m} (available: ${MODIFIER_NAMES.join(', ')}, or a letter or digit key)`;
    }
  }
  if (out.passive && out.flags & MOD_PREVENT) return '|passive listeners cannot call preventDefault';
  return out;
}

const DOCS: Record<string, string> = {
  preventDefault: 'Call `event.preventDefault()` before the handler',
  stopPropagation: 'Call `event.stopPropagation()` before the handler',
  stopImmediatePropagation: 'Call `event.stopImmediatePropagation()` before the handler',
  self: 'Only when the event targets this element itself, not a child',
  trusted: 'Only for events dispatched by the browser (`event.isTrusted`)',
  once: 'Run the handler at most once',
  capture: 'Listen during the capture phase',
  passive: 'Passive listener: cannot call preventDefault (smooth scrolling)',
  ctrl: 'Only while Ctrl is held',
  shift: 'Only while Shift is held',
  alt: 'Only while Alt is held',
  meta: 'Only while Meta (⌘ / Windows key) is held',
  exact: 'No other Ctrl / Shift / Alt / Meta key held',
  left: 'Left mouse button (keyboard events: ArrowLeft)',
  right: 'Right mouse button (keyboard events: ArrowRight)',
  middle: 'Middle mouse button',
};

/** Modifiers that apply to an event type, with a description (editor completions). */
export function eventModifiers(type: string): { name: string; description: string }[] {
  const key = isKeyEvent(type);
  const out: { name: string; description: string }[] = [];
  for (const name of Object.keys(FLAGS)) out.push({ name, description: DOCS[name] ?? name });
  out.push({ name: 'capture', description: DOCS['capture']! }, { name: 'passive', description: DOCS['passive']! });
  if (key) {
    for (const [name, keys] of Object.entries(KEYS)) out.push({ name, description: `Only for the ${keys.map((k) => (k === ' ' ? 'Space' : k)).join(' / ')} key` });
    out.push({ name: 'left', description: 'Only for the ArrowLeft key' }, { name: 'right', description: 'Only for the ArrowRight key' });
  } else {
    for (const name of ['left', 'middle', 'right']) out.push({ name, description: `Only for the ${name} mouse button` });
  }
  return out;
}
