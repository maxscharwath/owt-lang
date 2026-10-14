/**
 * `<Link>`: an `<a>` with the URL of a route. Plain left clicks navigate
 * without reloading; modified clicks (new tab, download...) are left to the
 * browser. Active links get `activeClass` and `aria-current="page"`.
 */
import { computed, onCleanup, untrack, type Snippet } from 'owt';
import { attr, cls, comment, render, slot, spread } from 'owt/internal';
import type { Params } from './path';
import type { NavigateOptions, QueryInit } from './types';

/** What a link needs from its router. */
export type LinkRouter = {
  href(to: string, params?: Params, options?: { query?: QueryInit | undefined; hash?: string | undefined }): string;
  isActive(to: string, params?: Params, options?: { exact?: boolean | undefined }): boolean;
  preload(to: string): Promise<void>;
  navigate(to: string, params: Params | undefined, options: NavigateOptions): Promise<boolean>;
};

/** Untyped props (`LinkProps<R, P>` is the typed form). */
export type LooseLinkProps = {
  readonly to: string;
  readonly params?: Params | undefined;
  readonly query?: QueryInit | undefined;
  readonly hash?: string | undefined;
  readonly replace?: boolean | undefined;
  readonly activeClass?: string | undefined;
  readonly exact?: boolean | undefined;
  readonly preload?: 'hover' | 'viewport' | false | undefined;
  readonly class?: unknown;
  readonly onClick?: ((event: MouseEvent) => unknown) | null | undefined;
  readonly children?: Snippet | undefined;
  /** any other `<a>` attribute */
  readonly [attribute: string]: unknown;
};

export type LooseLink = (props: LooseLinkProps) => Node;

/** Props handled by the link itself (not copied to the `<a>`). */
const OWN = new Set(['to', 'params', 'query', 'hash', 'replace', 'activeClass', 'exact', 'preload', 'class', 'onClick', 'children', 'href']);

const HOVER_EVENTS = ['mouseenter', 'focusin', 'touchstart'];

/** A click the browser should handle itself (new tab / window, download, other target...). */
function isModified(event: MouseEvent, a: HTMLAnchorElement): boolean {
  if (event.defaultPrevented || event.button !== 0) return true;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return true;
  const target = a.getAttribute('target');
  return (target !== null && target !== '' && target !== '_self') || a.hasAttribute('download');
}

export function createLink(router: LinkRouter): LooseLink {
  return function Link(props: LooseLinkProps): Node {
    const a = document.createElement('a');
    const exactActive = computed(() => router.isActive(props.to, props.params, { exact: true }));
    const active = computed(() => router.isActive(props.to, props.params, { exact: props.exact === true }));

    render(() => attr(a, 'href', router.href(props.to, props.params, { query: props.query, hash: props.hash })));
    render(() => attr(a, 'aria-current', exactActive.value ? 'page' : null));
    render(() => cls(a, [props.class, active.value && props.activeClass]));
    spread(a, () => {
      const rest: Record<string, unknown> = {};
      for (const key of Object.keys(props)) if (!OWN.has(key)) rest[key] = props[key];
      return rest;
    });

    a.addEventListener('click', (event) => {
      props.onClick?.(event);
      if (isModified(event, a)) return;
      event.preventDefault();
      const options: NavigateOptions = { query: props.query, hash: props.hash, replace: props.replace };
      router.navigate(props.to, props.params, options).catch((err: unknown) => console.error(err));
    });

    const preload = untrack(() => props.preload ?? false);
    const load = () => {
      router.preload(untrack(() => props.to)).catch((err: unknown) => console.error(err));
    };
    if (preload === 'hover') {
      for (const type of HOVER_EVENTS) a.addEventListener(type, load, { passive: true });
    } else if (preload === 'viewport' && typeof IntersectionObserver === 'function') {
      const observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        load();
      });
      observer.observe(a);
      onCleanup(() => observer.disconnect());
    }

    const end = a.appendChild(comment());
    slot(end, () => props.children, {}, null);
    return a;
  };
}
