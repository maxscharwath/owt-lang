/**
 * `<Defer>`: render content later (like Angular's `@defer`). Content that is
 * below the fold, heavy or rarely used renders when the browser is idle, when
 * it scrolls into view, on interaction or after a delay. Combined with
 * `lazy()` components, their code is only downloaded then. Once rendered, the
 * content stays.
 *
 * ```owt
 * <Defer on="viewport">
 *   <Comments {postId} />
 *   slot placeholder { <p class="skeleton">Comments</p> }
 * </Defer>
 * ```
 */
import { Source, get, onCleanup, renderEffect, set, untrack } from '../reactivity';
import { slot, type Snippet } from './blocks';

export type DeferTrigger = 'idle' | 'viewport' | 'interaction' | 'hover' | number | boolean;

export type DeferProps = {
  /**
   * When to render: `'idle'` (default), `'viewport'` (the placeholder becomes
   * visible), `'interaction'` (click / key / focus on the placeholder),
   * `'hover'`, a delay in ms, or a condition (`on={open}`)
   */
  on?: DeferTrigger;
  /** IntersectionObserver root margin for `'viewport'` (default `'200px'`) */
  margin?: string;
  children?: Snippet;
  /** rendered until the content renders (also the element observed by `viewport` / `interaction` / `hover`) */
  placeholder?: Snippet;
};

const INTERACTIONS = ['click', 'keydown', 'focusin', 'pointerdown', 'touchstart'];
const HOVERS = ['mouseenter', 'focusin', 'pointerenter'];

export function Defer(props: DeferProps): Node {
  const ready = new Source(false);
  const frag = document.createDocumentFragment();
  const start = frag.appendChild(document.createComment(''));
  const anchor = frag.appendChild(document.createComment(''));
  const show = () => set(ready, true);

  slot(anchor, () => (get(ready) ? props.children : props.placeholder), {}, null);

  /** first element of the placeholder, or an empty marker to observe */
  const target = (): Element => {
    for (let node = start.nextSibling; node !== null && node !== anchor; node = node.nextSibling) {
      if (node instanceof Element) return node;
    }
    const marker = document.createElement('span');
    marker.setAttribute('data-owt-defer', '');
    anchor.parentNode!.insertBefore(marker, anchor);
    onCleanup(() => marker.remove());
    renderEffect(() => {
      if (get(ready)) marker.remove();
    });
    return marker;
  };

  const trigger = untrack(() => props.on ?? 'idle');
  if (typeof trigger === 'boolean') {
    renderEffect(() => {
      if (props.on === true) show();
    });
  } else if (typeof trigger === 'number') {
    const timer = setTimeout(show, trigger);
    onCleanup(() => clearTimeout(timer));
  } else if (trigger === 'idle') {
    if (typeof requestIdleCallback === 'function') {
      const handle = requestIdleCallback(show);
      onCleanup(() => cancelIdleCallback(handle));
    } else {
      const timer = setTimeout(show, 1);
      onCleanup(() => clearTimeout(timer));
    }
  } else if (trigger === 'viewport') {
    if (typeof IntersectionObserver !== 'function') {
      show();
    } else {
      const el = target();
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            observer.disconnect();
            show();
          }
        },
        { rootMargin: untrack(() => props.margin ?? '200px') },
      );
      observer.observe(el);
      onCleanup(() => observer.disconnect());
    }
  } else {
    const el = target();
    const types = trigger === 'hover' ? HOVERS : INTERACTIONS;
    const listener = () => {
      for (const type of types) el.removeEventListener(type, listener);
      show();
    };
    for (const type of types) el.addEventListener(type, listener, { passive: true });
    onCleanup(() => {
      for (const type of types) el.removeEventListener(type, listener);
    });
  }
  return frag;
}
