// @vitest-environment happy-dom
// Type-level tests: the `@ts-expect-error` lines are verified by `tsc` (and by `owt.spec.ts`,
// which type-checks this file); the runtime assertions check what the same calls do.
import { describe, expect, expectTypeOf, it } from 'vitest';
import { lazy, type Snippet } from 'owt';
import { createRouter, type LayoutProps, type LinkPattern, type Params, type RoutePattern, type RouteProps } from '../src/index';
import { setup } from './helpers';

const node = () => document.createComment('');
const Home = () => node();
const User = (props: RouteProps<'/users/:id'>) => (void props, node());
const Slug = (props: { params: { slug: string } }) => (void props, node());
const NumericId = (props: { params: { id: number } }) => (void props, node());
const Files = (props: { params: { path: string } }) => (void props, node());
const Shell = (props: { children: Snippet }) => (void props, node());
const OrgLayout = (props: LayoutProps<'/orgs/:org'>) => (void props, node());

const routes = {
  '/': Home,
  '/users/:id': User,
  '/posts/:slug?': (props: RouteProps<'/posts/:slug?'>) => (void props, node()),
  '/files/*path': Files,
  '/orgs/:org': { layout: OrgLayout, children: { '/': Home, '/repos/:repo': (props: RouteProps<'/orgs/:org/repos/:repo'>) => (void props, node()) } },
  '/admin': { layout: Shell, children: { '/': Home, '/users': Home } },
  '*': Home,
};

describe('Params', () => {
  it('extracts required params', () => {
    expectTypeOf<Params<'/users/:id/posts/:post'>>().toEqualTypeOf<{ id: string; post: string }>();
  });

  it('extracts optional params', () => {
    expectTypeOf<Params<'/posts/:slug?'>>().toEqualTypeOf<{ slug?: string }>();
  });

  it('extracts the rest of a wildcard', () => {
    expectTypeOf<Params<'/files/*path'>>().toEqualTypeOf<{ path: string }>();
  });

  it('has no keys for static patterns', () => {
    expectTypeOf<Params<'/about'>>().toEqualTypeOf<Record<string, never>>();
  });

  it('has no keys for an unnamed catch-all', () => {
    expectTypeOf<Params<'*'>>().toEqualTypeOf<Record<string, never>>();
  });
});

describe('patterns', () => {
  it('joins nested patterns', () => {
    expectTypeOf<RoutePattern<typeof routes>>().toEqualTypeOf<
      '/' | '/users/:id' | '/posts/:slug?' | '/files/*path' | '/orgs/:org' | '/orgs/:org/repos/:repo' | '/admin' | '/admin/users' | '*'
    >();
  });

  it('leaves the unnamed catch-all out of links', () => {
    expectTypeOf<'*'>().not.toExtend<LinkPattern<typeof routes>>();
  });
});

describe('route components', () => {
  it('accepts lazy components', () => {
    const make = () => createRouter({ routes: { '/users/:id': lazy(async () => ({ User }), 'User') } });

    expectTypeOf(make).returns.toHaveProperty('href');
  });

  it('rejects a component expecting other params', () => {
    const make = () =>
      createRouter({
        routes: {
          // @ts-expect-error: Slug needs `params.slug`, the pattern gives `params.id`
          '/users/:id': Slug,
        },
      });

    expectTypeOf(make).toBeFunction();
  });

  it('rejects a component expecting other param types', () => {
    const make = () =>
      createRouter({
        routes: {
          // @ts-expect-error: params are strings
          '/users/:id': NumericId,
        },
      });

    expectTypeOf(make).toBeFunction();
  });

  it('checks nested routes against the joined pattern', () => {
    const make = () =>
      createRouter({
        routes: {
          '/orgs/:org': {
            children: {
              // @ts-expect-error: the pattern is '/orgs/:org/members', there is no `id`
              '/members': User,
            },
          },
        },
      });

    expectTypeOf(make).toBeFunction();
  });

  it('rejects a layout expecting other params', () => {
    const make = () =>
      createRouter({
        routes: {
          // @ts-expect-error: the layout of '/admin' gets no `org`
          '/admin': { layout: OrgLayout, children: { '/': Home } },
        },
      });

    expectTypeOf(make).toBeFunction();
  });
});

describe('href', () => {
  it('builds a path for a pattern with params', () => {
    const router = setup({ routes });

    const href = router.href('/orgs/:org/repos/:repo', { org: 'owt', repo: 'router' });

    expect(href).toBe('/orgs/owt/repos/router');
  });

  it('requires the params of the pattern', () => {
    const router = setup({ routes });

    // @ts-expect-error: `id` is missing
    const build = () => router.href('/users/:id', {});

    expect(build).toThrow(/missing param "id"/);
  });

  it('requires params when the pattern has some', () => {
    const router = setup({ routes });

    // @ts-expect-error: params are required
    const build = () => router.href('/users/:id');

    expect(build).toThrow(/missing param/);
  });

  it('rejects unknown params', () => {
    const router = setup({ routes });

    // @ts-expect-error: `name` is not a param of '/users/:id'
    const href = router.href('/users/:id', { id: '1', name: 'x' });

    expect(href).toBe('/users/1');
  });

  it('rejects params on a static pattern', () => {
    const router = setup({ routes });

    // @ts-expect-error: '/admin/users' has no params
    const href = router.href('/admin/users', { id: '1' });

    expect(href).toBe('/admin/users');
  });

  it('rejects patterns that are not routes', () => {
    const router = setup({ routes });

    // @ts-expect-error: '/nope' is not a route
    const href = () => router.href('/nope');

    expectTypeOf(href).returns.toBeString();
  });

  it('makes optional params optional', () => {
    const router = setup({ routes });

    const href = router.href('/posts/:slug?');

    expect(href).toBe('/posts');
  });
});

describe('navigate', () => {
  it('accepts raw paths', () => {
    const router = setup({ routes });

    const go = (path: string) => router.navigate(path, { replace: true });

    expectTypeOf(go).returns.resolves.toBeBoolean();
  });

  it('rejects a param pattern without its params', () => {
    const router = setup({ routes });

    // @ts-expect-error: '/users/:id' needs `{ id }`
    const go = () => router.navigate('/users/:id');

    expectTypeOf(go).toBeFunction();
  });
});

describe('route', () => {
  it('narrows params by pattern', () => {
    const router = setup({ routes }, '/files/a/b');

    const route = router.route;

    if (route.pattern === '/files/*path') expectTypeOf(route.params).toEqualTypeOf<{ path: string }>();
    expect(route.pattern).toBe('/files/*path');
  });

  it('has a null pattern when nothing matches', () => {
    type Route = ReturnType<typeof setup<typeof routes>>['route'];

    expectTypeOf<Extract<Route, { pattern: null }>['params']>().toEqualTypeOf<Record<string, never>>();
  });
});

describe('Link', () => {
  it('accepts a pattern with its params and anchor attributes', () => {
    const router = setup({ routes });

    const a = router.Link({ to: '/users/:id', params: { id: '1' }, class: 'nav', title: 'User', onClick: (event) => event.currentTarget.href });

    expect(a).toBeInstanceOf(HTMLAnchorElement);
  });

  it('requires params for a pattern with params', () => {
    const router = setup({ routes });

    // @ts-expect-error: `params` is missing
    const link = () => router.Link({ to: '/users/:id' });

    expectTypeOf(link).returns.toEqualTypeOf<Node>();
  });

  it('rejects unknown patterns', () => {
    const router = setup({ routes });

    // @ts-expect-error: '/nope' is not a route
    const link = () => router.Link({ to: '/nope' });

    expectTypeOf(link).returns.toEqualTypeOf<Node>();
  });

  it('rejects params of another pattern', () => {
    const router = setup({ routes });

    // @ts-expect-error: '/files/*path' takes `path`
    const link = () => router.Link({ to: '/files/*path', params: { id: '1' } });

    expectTypeOf(link).returns.toEqualTypeOf<Node>();
  });
});
