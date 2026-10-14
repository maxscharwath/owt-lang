/** Document-level helpers: `<head>` content, `<title>`, injected CSS. */
import { Owner, getOwner, onCleanup, renderEffect, runWithOwner } from '../reactivity';
import { insertContent, removeRange } from './nodes';

/** Render content into document.head for the lifetime of the current scope. */
export function head(render: () => Node): void {
  const scope = new Owner(getOwner());
  const end = document.createTextNode('');
  document.head.appendChild(end);
  const content = runWithOwner(scope, render);
  const range = insertContent(end, content);
  end.remove();
  onCleanup(() => removeRange(range.first, range.last));
}

/** `<head><title>{...}</title></head>`: reactive document title, restored on destroy. */
export function title(get: () => string): void {
  const previous = document.title;
  renderEffect(() => {
    document.title = get();
  });
  onCleanup(() => {
    document.title = previous;
  });
}

/** CSS added by `injectCss`, by id (shadow roots of custom elements adopt it too). */
const injected = new Map<string, string>();
let cssListeners: Set<(added: readonly string[]) => void> | null = null;

/** Add a component's CSS once (used when compiling with `css: 'injected'`). */
export function injectCss(id: string, css: string): void {
  if (typeof document === 'undefined' || injected.has(id)) return;
  injected.set(id, css);
  const style = document.createElement('style');
  style.setAttribute('data-owt', id);
  style.textContent = css;
  document.head.appendChild(style);
  if (cssListeners !== null) for (const listener of cssListeners) listener([css]);
}

/**
 * Call `listener` with every CSS text added by `injectCss` so far, then with
 * each one added later. Returns a function that stops listening.
 */
export function watchInjectedCss(listener: (added: readonly string[]) => void): () => void {
  listener([...injected.values()]);
  const listeners = (cssListeners ??= new Set());
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
