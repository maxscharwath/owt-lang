// @vitest-environment happy-dom
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { createRoot, flushSync, lazy, type Snippet } from 'owt';
import { click, page, settle, setup } from './helpers';

const routes = {
  '/': page('home'),
  '/users/:id': page('user'),
  '/admin': { children: { '/': page('admin'), '/users': page('users') } },
};

/** Render a link in a root and attach it to the document. */
function anchor(render: () => Node): HTMLAnchorElement {
  const node = createRoot(render);
  if (!(node instanceof HTMLAnchorElement)) throw new Error('Link must render an <a>');
  document.body.appendChild(node);
  return node;
}

const label = (text: string): Snippet => () => document.createTextNode(text);

describe('Link', () => {
  it('renders an <a> with the href of the route', () => {
    const router = setup({ routes });

    const a = anchor(() => router.Link({ to: '/users/:id', params: { id: '42' }, query: { tab: 'posts' }, children: label('Ada') }));

    expect(a.outerHTML).toBe('<a href="/users/42?tab=posts">Ada<!----></a>');
  });

  it('navigates on a plain left click', async () => {
    const router = setup({ routes });
    const a = anchor(() => router.Link({ to: '/users/:id', params: { id: '1' } }));

    const prevented = click(a);
    await settle();

    expect([prevented, router.route.path]).toEqual([true, '/users/1']);
  });

  it('leaves clicks with a modifier key to the browser', async () => {
    const router = setup({ routes });
    const a = anchor(() => router.Link({ to: '/users/:id', params: { id: '1' } }));

    const prevented = click(a, { ctrlKey: true });
    await settle();

    expect([prevented, router.route.path]).toEqual([false, '/']);
  });

  it('leaves middle clicks to the browser', () => {
    const router = setup({ routes });
    const a = anchor(() => router.Link({ to: '/' }));

    const prevented = click(a, { button: 1 });

    expect(prevented).toBe(false);
  });

  it('leaves links with a target to the browser', () => {
    const router = setup({ routes });
    const a = anchor(() => router.Link({ to: '/', target: '_blank' }));

    const prevented = click(a);

    expect(prevented).toBe(false);
  });

  it('leaves download links to the browser', () => {
    const router = setup({ routes });
    const a = anchor(() => router.Link({ to: '/', download: true }));

    const prevented = click(a);

    expect(prevented).toBe(false);
  });

  it('calls onClick first and lets it cancel the navigation', async () => {
    const router = setup({ routes });
    const a = anchor(() => router.Link({ to: '/users/:id', params: { id: '1' }, onClick: (event) => event.preventDefault() }));

    click(a);
    await settle();

    expect(router.route.path).toBe('/');
  });

  it('replaces the history entry with replace', async () => {
    const router = setup({ routes });
    const a = anchor(() => router.Link({ to: '/users/:id', params: { id: '1' }, replace: true }));
    const length = history.length;

    click(a);
    await settle();

    expect([history.length, location.pathname]).toEqual([length, '/users/1']);
  });

  it('sets aria-current on the link of the current page', async () => {
    const router = setup({ routes });
    const a = anchor(() => router.Link({ to: '/users/:id', params: { id: '1' } }));

    await router.navigate('/users/1');
    flushSync();

    expect(a.getAttribute('aria-current')).toBe('page');
  });

  it('removes aria-current when the page changes', async () => {
    const router = setup({ routes }, '/users/1');
    const a = anchor(() => router.Link({ to: '/users/:id', params: { id: '1' } }));

    await router.navigate('/');
    flushSync();

    expect(a.hasAttribute('aria-current')).toBe(false);
  });

  it('adds activeClass inside the route, next to its own class', () => {
    const router = setup({ routes }, '/admin/users');

    const a = anchor(() => router.Link({ to: '/admin', class: 'nav', activeClass: 'active' }));

    expect([a.className, a.hasAttribute('aria-current')]).toEqual(['nav active', false]);
  });

  it('only adds activeClass on an exact match with exact', () => {
    const router = setup({ routes }, '/admin/users');

    const a = anchor(() => router.Link({ to: '/admin', activeClass: 'active', exact: true }));

    expect(a.className).toBe('');
  });

  it('passes other attributes to the <a>', () => {
    const router = setup({ routes });

    const a = anchor(() => router.Link({ to: '/', title: 'Home', 'data-test': 'home', rel: 'nofollow' }));

    expect([a.title, a.dataset.test, a.rel]).toEqual(['Home', 'home', 'nofollow']);
  });

  it('preloads the lazy target on hover', () => {
    const load = vi.fn(async () => ({ default: page('lazy') }));
    const router = setup({ routes: { '/': page('home'), '/lazy': lazy(load) } });
    const a = createRoot(() => router.Link({ to: '/lazy', preload: 'hover' }));

    a.dispatchEvent(new MouseEvent('mouseenter'));

    expect(load).toHaveBeenCalledOnce();
  });

  it('preloads the lazy target once the link is visible', () => {
    let reveal: () => void = () => {};
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        reveal = () => callback([{ isIntersecting: true }]);
      }
      observe() {}
      disconnect() {}
    });
    onTestFinished(() => {
      vi.unstubAllGlobals();
    });
    const load = vi.fn(async () => ({ default: page('lazy') }));
    const router = setup({ routes: { '/': page('home'), '/lazy': lazy(load) } });
    createRoot(() => router.Link({ to: '/lazy', preload: 'viewport' }));

    reveal();

    expect(load).toHaveBeenCalledOnce();
  });
});
