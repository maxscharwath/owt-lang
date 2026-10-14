// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { flushSync, lazy, mount } from 'owt';
import { render } from 'owt/internal';
import { Router, type RouteProps } from '../src/index';
import { html, layout, page, settle, setup, view } from './helpers';

const Home = page('home');
const NotFound = page('404');

describe('Router', () => {
  it('renders the component of the current route', () => {
    const router = setup({ routes: { '/': Home, '/users/:id': page('user') } }, '/users/7');

    const root = view(router);

    expect(html(root)).toBe('<p>user id=7</p>');
  });

  it('renders the catch-all for unknown paths', () => {
    const router = setup({ routes: { '/': Home, '*': NotFound } }, '/missing');

    const root = view(router);

    expect(root.textContent).toBe('404');
  });

  it('renders nothing when no route matches', () => {
    const router = setup({ routes: { '/': Home } }, '/missing');

    const root = view(router);

    expect(root.textContent).toBe('');
  });

  it('switches components on navigation', async () => {
    const router = setup({ routes: { '/': Home, '/about': page('about') } });
    const root = view(router);

    await router.navigate('/about');

    expect(html(root)).toBe('<p>about</p>');
  });

  it('renders layouts around nested routes', () => {
    const router = setup({ routes: { '/admin': { layout: layout('admin'), children: { '/users/:id': page('user') } } } }, '/admin/users/3');

    const root = view(router);

    expect(html(root)).toBe('<section class="admin"><p>user id=3</p></section>');
  });

  it('nests layouts', () => {
    const routes = { '/': { layout: layout('app'), children: { '/admin': { layout: layout('admin'), children: { '/': page('dashboard') } } } } };
    const router = setup({ routes }, '/admin');

    const root = view(router);

    expect(html(root)).toBe('<section class="app"><section class="admin"><p>dashboard</p></section></section>');
  });

  it('keeps the layout when navigating between its children', async () => {
    const mounts = vi.fn();
    const Shell = layout('shell');
    const routes = { '/admin': { layout: (props: Parameters<typeof Shell>[0]) => (mounts(), Shell(props)), children: { '/': Home, '/users': page('users') } } };
    const router = setup({ routes }, '/admin');
    const root = view(router);

    await router.navigate('/admin/users');

    expect([mounts.mock.calls.length, root.textContent]).toEqual([1, 'users']);
  });

  it('keeps the component instance when only params change', async () => {
    const mounts = vi.fn();
    const router = setup({ routes: { '/users/:id': page('user', mounts) } }, '/users/1');
    const root = view(router);

    await router.navigate('/users/:id', { id: '2' });

    expect([mounts.mock.calls.length, root.textContent]).toEqual([1, 'user id=2']);
  });

  it('updates the query prop', async () => {
    const Search = (props: RouteProps<'/search'>) => {
      const p = document.createElement('p');
      render(() => (p.textContent = props.query.get('q') ?? ''));
      return p;
    };
    const router = setup({ routes: { '/search': Search } }, '/search?q=a');
    const root = view(router);

    await router.navigate('/search?q=b');

    expect(root.textContent).toBe('b');
  });

  it('re-mounts the component when the route changes to another component', async () => {
    const mounts = vi.fn();
    const router = setup({ routes: { '/a/:id': page('a', mounts), '/b/:id': page('b') } }, '/a/1');
    const root = view(router);

    await router.navigate('/b/1');
    await router.navigate('/a/1');

    expect([mounts.mock.calls.length, root.textContent]).toEqual([2, 'a id=1']);
  });

  it('never shows the params of the next route to the component being replaced', async () => {
    const seen: string[] = [];
    const User = (props: RouteProps<'/users/:id'>) => {
      const p = document.createElement('p');
      render(() => seen.push(props.params.id));
      return p;
    };
    const router = setup({ routes: { '/users/:id': User, '/': Home } }, '/users/1');
    view(router);

    await router.navigate('/');

    expect(seen).toEqual(['1']);
  });

  it('renders a lazy route once it is loaded', async () => {
    let loaded: (module: { Page: ReturnType<typeof page> }) => void = () => {};
    const Lazy = lazy(() => new Promise<{ Page: ReturnType<typeof page> }>((resolve) => (loaded = resolve)), 'Page');
    const router = setup({ routes: { '/': Home, '/lazy': Lazy } });
    const root = view(router);
    await router.navigate('/lazy');
    const before = root.textContent;

    loaded({ Page: page('lazy') });
    await settle();
    flushSync();

    expect([before, root.textContent]).toEqual(['', 'lazy']);
  });

  it('stops updating once unmounted', async () => {
    const renders = vi.fn();
    const User = (props: RouteProps<'/users/:id'>) => {
      render(() => renders(props.params.id));
      return document.createElement('p');
    };
    const router = setup({ routes: { '/users/:id': User } }, '/users/1');
    const app = mount(Router, { target: document.createElement('div'), props: { router } });
    app.destroy();

    await router.navigate('/users/:id', { id: '2' });

    expect(renders.mock.calls).toEqual([['1']]);
  });
});
