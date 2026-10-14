// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { computed, createRoot, effect, flushSync, lazy } from 'owt';
import { render } from 'owt/internal';
import { page, settle, setup } from './helpers';

const Home = page('home');
const User = page('user');
const Post = page('post');
const Files = page('files');
const NotFound = page('404');

const routes = {
  '/': Home,
  '/users/:id': User,
  '/posts/:slug?': Post,
  '/files/*path': Files,
  '/admin': { children: { '/': Home, '/users/:id': User } },
  '*': NotFound,
};

describe('current route', () => {
  it('matches the initial location', () => {
    const router = setup({ routes }, '/users/42?tab=posts#bio');

    const { path, pattern, params, hash } = router.route;

    expect({ path, pattern, params, hash }).toEqual({ path: '/users/42', pattern: '/users/:id', params: { id: '42' }, hash: 'bio' });
  });

  it('exposes the query as URLSearchParams', () => {
    const router = setup({ routes }, '/?q=owt&page=2');

    const query = router.route.query;

    expect([query.get('q'), query.get('page')]).toEqual(['owt', '2']);
  });

  it('uses the catch-all for unknown paths', () => {
    const router = setup({ routes }, '/nothing/here');

    const pattern = router.route.pattern;

    expect(pattern).toBe('*');
  });

  it('has no pattern when nothing matches and there is no catch-all', () => {
    const router = setup({ routes: { '/': Home } }, '/nothing');

    const { pattern, params } = router.route;

    expect({ pattern, params }).toEqual({ pattern: null, params: {} });
  });

  it('joins nested patterns', () => {
    const router = setup({ routes }, '/admin/users/7');

    const { pattern, params } = router.route;

    expect({ pattern, params }).toEqual({ pattern: '/admin/users/:id', params: { id: '7' } });
  });

  it('is reactive', async () => {
    const router = setup({ routes });
    const seen: string[] = [];
    effect(() => {
      seen.push(router.route.path);
    });
    flushSync();

    await router.navigate('/users/1');

    expect(seen).toEqual(['/', '/users/1']);
  });

  it('updates values derived from it', async () => {
    const router = setup({ routes });
    const seen: unknown[] = [];
    const upper = computed(() => router.route.path.toUpperCase());
    createRoot(() => render(() => seen.push(upper.value)));

    await router.navigate('/users/:id', { id: 'x' });

    expect(seen).toEqual(['/', '/USERS/X']);
  });
});

describe('href', () => {
  it('builds a path from a pattern and params', () => {
    const router = setup({ routes });

    const href = router.href('/users/:id', { id: 'a b' });

    expect(href).toBe('/users/a%20b');
  });

  it('adds the query and the hash', () => {
    const router = setup({ routes });

    const href = router.href('/posts/:slug?', {}, { query: { tag: ['x', 'y'] }, hash: 'comments' });

    expect(href).toBe('/posts?tag=x&tag=y#comments');
  });

  it('builds nested patterns', () => {
    const router = setup({ routes });

    const href = router.href('/admin/users/:id', { id: '3' });

    expect(href).toBe('/admin/users/3');
  });

  it('prefixes the base path', () => {
    const router = setup({ routes, base: '/app/' }, '/app');

    const href = router.href('/files/*path', { path: 'docs/a.md' });

    expect(href).toBe('/app/files/docs/a.md');
  });

  it('builds hash URLs in hash mode', () => {
    const router = setup({ routes, mode: 'hash' });

    const href = router.href('/users/:id', { id: '1' }, { query: { tab: 'posts' } });

    expect(href).toBe('#/users/1?tab=posts');
  });
});

describe('navigate', () => {
  it('pushes a history entry', async () => {
    const router = setup({ routes });
    const length = history.length;

    await router.navigate('/users/:id', { id: '42' });

    expect([location.pathname, history.length - length, router.route.pattern]).toEqual(['/users/42', 1, '/users/:id']);
  });

  it('replaces the current entry with replace', async () => {
    const router = setup({ routes });
    const length = history.length;

    await router.navigate('/users/:id', { id: '42' }, { replace: true });

    expect([location.pathname, history.length - length]).toEqual(['/users/42', 0]);
  });

  it('accepts raw paths with a query and a hash', async () => {
    const router = setup({ routes });

    await router.navigate('/posts/hello?draft=1#top');

    expect([router.route.params, router.route.query.get('draft'), router.route.hash]).toEqual([{ slug: 'hello' }, '1', 'top']);
  });

  it('resolves relative paths against the current one', async () => {
    const router = setup({ routes }, '/users/1');

    await router.navigate('../posts/x');

    expect(router.route.path).toBe('/posts/x');
  });

  it('takes options as second argument for patterns without params', async () => {
    const router = setup({ routes }, '/users/1');

    await router.navigate('/', { query: { welcome: 1 } });

    expect(location.search).toBe('?welcome=1');
  });

  it('goes back on popstate', async () => {
    const router = setup({ routes });
    await router.navigate('/users/:id', { id: '1' });
    await router.navigate('/users/:id', { id: '2' });

    router.back();
    await settle();

    expect(router.route.params).toEqual({ id: '1' });
  });

  it('goes forward again', async () => {
    const router = setup({ routes });
    await router.navigate('/users/:id', { id: '1' });
    router.back();
    await settle();

    router.forward();
    await settle();

    expect(router.route.params).toEqual({ id: '1' });
  });

  it('follows a popstate dispatched by the browser', async () => {
    const router = setup({ routes });
    history.pushState(null, '', '/files/a/b');

    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    await settle();

    expect(router.route.params).toEqual({ path: 'a/b' });
  });

  it('strips the base path', () => {
    const router = setup({ routes, base: '/app' }, '/app/users/5');

    const pattern = router.route.pattern;

    expect(pattern).toBe('/users/:id');
  });

  it('writes the base path in the URL', async () => {
    const router = setup({ routes, base: '/app' }, '/app/');

    await router.navigate('/users/:id', { id: '5' });

    expect(location.pathname).toBe('/app/users/5');
  });

  it('stops listening after destroy', async () => {
    const router = setup({ routes });
    router.destroy();
    history.pushState(null, '', '/users/9');

    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    await settle();

    expect(router.route.path).toBe('/');
  });
});

describe('hash mode', () => {
  it('reads the route from location.hash', () => {
    const router = setup({ routes, mode: 'hash' }, '/#/users/3?tab=a');

    const { pattern, params } = router.route;

    expect({ pattern, params, tab: router.route.query.get('tab') }).toEqual({ pattern: '/users/:id', params: { id: '3' }, tab: 'a' });
  });

  it('treats an empty hash as the root', () => {
    const router = setup({ routes, mode: 'hash' }, '/');

    const pattern = router.route.pattern;

    expect(pattern).toBe('/');
  });

  it('navigates by writing the hash', async () => {
    const router = setup({ routes, mode: 'hash' }, '/index.html');

    await router.navigate('/users/:id', { id: '8' });

    expect([location.pathname, location.hash]).toEqual(['/index.html', '#/users/8']);
  });

  it('follows hashchange events', async () => {
    const router = setup({ routes, mode: 'hash' });

    location.hash = '#/posts/x';
    await settle();

    expect(router.route.params).toEqual({ slug: 'x' });
  });
});

describe('guards', () => {
  it('cancels a navigation when the guard returns false', async () => {
    const router = setup({ routes, beforeEach: (to) => to.pattern !== '/users/:id' });

    const result = await router.navigate('/users/:id', { id: '1' });

    expect([result, router.route.path, location.pathname]).toEqual([false, '/', '/']);
  });

  it('redirects when the guard returns a path', async () => {
    const router = setup({ routes, beforeEach: (to) => (to.pattern === '/users/:id' ? '/posts/login' : undefined) });

    await router.navigate('/users/:id', { id: '1' });

    expect([router.route.path, location.pathname]).toEqual(['/posts/login', '/posts/login']);
  });

  it('guards the first navigation', () => {
    const router = setup({ routes, beforeEach: (to) => (to.path === '/admin' ? '/' : undefined) }, '/admin');

    const path = router.route.path;

    expect([path, location.pathname]).toEqual(['/', '/']);
  });

  it('receives the current route as from', async () => {
    const from = vi.fn();
    const router = setup({ routes, beforeEach: (_to, f) => void from(f.path) }, '/users/1');

    await router.navigate('/');

    expect(from).toHaveBeenLastCalledWith('/users/1');
  });

  it('waits for an async guard', async () => {
    let allow: (value: boolean) => void = () => {};
    const router = setup({ routes, beforeEach: (to) => (to.path === '/' ? true : new Promise<boolean>((resolve) => (allow = resolve))) });
    const navigation = router.navigate('/users/:id', { id: '1' });
    const before = router.route.path;

    allow(true);
    await navigation;

    expect([before, router.route.path]).toEqual(['/', '/users/1']);
  });

  it('lets a newer navigation cancel a pending one', async () => {
    const pending: ((value: boolean) => void)[] = [];
    const router = setup({ routes, beforeEach: (to) => (to.path === '/' ? true : new Promise<boolean>((resolve) => pending.push(resolve))) });
    const first = router.navigate('/users/:id', { id: '1' });
    const second = router.navigate('/users/:id', { id: '2' });

    pending.forEach((resolve) => resolve(true));
    const results = await Promise.all([first, second]);

    expect([results, router.route.params]).toEqual([[false, true], { id: '2' }]);
  });

  it('restores the URL when a guard cancels back navigation', async () => {
    let blocked = false;
    const router = setup({ routes, beforeEach: () => !blocked });
    await router.navigate('/users/:id', { id: '1' });
    blocked = true;

    router.back();
    await settle();

    expect([router.route.path, location.pathname]).toEqual(['/users/1', '/users/1']);
  });

  it('rejects the navigation when the guard throws', async () => {
    const router = setup({ routes, beforeEach: (to) => {
      if (to.path !== '/') throw new Error('nope');
    } });

    const navigation = router.navigate('/users/1');

    await expect(navigation).rejects.toThrow('nope');
  });
});

describe('isActive', () => {
  it('matches the current path exactly', () => {
    const router = setup({ routes }, '/users/1');

    const active = [router.isActive('/users/:id', { id: '1' }, { exact: true }), router.isActive('/users/:id', { id: '2' })];

    expect(active).toEqual([true, false]);
  });

  it('matches parent paths unless exact', () => {
    const router = setup({ routes }, '/admin/users/1');

    const active = [router.isActive('/admin'), router.isActive('/admin', {}, { exact: true })];

    expect(active).toEqual([true, false]);
  });

  it('only matches the root exactly', () => {
    const router = setup({ routes }, '/users/1');

    const active = router.isActive('/');

    expect(active).toBe(false);
  });

  it('matches a pattern without params on any params', () => {
    const router = setup({ routes }, '/users/1');

    const active = router.isActive('/users/:id');

    expect(active).toBe(true);
  });
});

describe('scroll', () => {
  it('scrolls to the top after a navigation', async () => {
    const router = setup({ routes });
    const scrollTo = vi.spyOn(window, 'scrollTo');

    await router.navigate('/users/1');

    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('scrolls to the element of the hash', async () => {
    const router = setup({ routes });
    const target = document.body.appendChild(document.createElement('h2'));
    target.id = 'details';
    const scrollIntoView = vi.spyOn(target, 'scrollIntoView');

    await router.navigate('/users/1#details');

    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('does not scroll with scroll: false', async () => {
    const router = setup({ routes, scroll: false });
    const scrollTo = vi.spyOn(window, 'scrollTo');

    await router.navigate('/users/1');

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('restores the position on back with scroll: restore', async () => {
    const router = setup({ routes, scroll: 'restore' });
    window.scrollTo(0, 300);
    await router.navigate('/users/1');
    const scrollTo = vi.spyOn(window, 'scrollTo');

    router.back();
    await settle();

    expect(scrollTo).toHaveBeenLastCalledWith(0, 300);
  });
});

describe('view transitions', () => {
  it('wraps the update in document.startViewTransition', async () => {
    const start = vi.fn((update: () => void) => {
      update();
      return { updateCallbackDone: Promise.resolve(), ready: Promise.resolve(), finished: Promise.resolve() };
    });
    Object.defineProperty(document, 'startViewTransition', { value: start, configurable: true });
    const router = setup({ routes, viewTransitions: true });

    await router.navigate('/users/1');
    Reflect.deleteProperty(document, 'startViewTransition');

    expect([start.mock.calls.length, router.route.path]).toEqual([1, '/users/1']);
  });
});

describe('preload', () => {
  it('starts loading the lazy components of a route', async () => {
    const load = vi.fn(async () => ({ default: User }));
    const router = setup({ routes: { '/': Home, '/users/:id': lazy(load) } });

    await router.preload('/users/:id');

    expect(load).toHaveBeenCalledOnce();
  });
});
