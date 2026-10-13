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

const injected = new Set<string>();

/** Add a component's CSS once (used when compiling with `css: 'injected'`). */
export function injectCss(id: string, css: string): void {
  if (typeof document === 'undefined' || injected.has(id)) return;
  injected.add(id);
  const style = document.createElement('style');
  style.setAttribute('data-owt', id);
  style.textContent = css;
  document.head.appendChild(style);
}
