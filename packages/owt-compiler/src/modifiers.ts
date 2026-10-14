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
