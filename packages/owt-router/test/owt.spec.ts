// @vitest-environment happy-dom
// Real `.owt` markup: compiled with @owt/compiler and mounted, and type-checked the way the
// editor and `owt-tsc` check it (virtual TypeScript from @owt/language-core).
import { join } from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';
import { flushSync, mount } from 'owt';
import { click, html, load, settle, typecheck, typecheckFiles } from './helpers';

const app = (nav: string) => `import { createRouter, Router } from '@owt/router'

component Home() {
  <h1>Home</h1>
}

component User(params: { id: string }, query: URLSearchParams) {
  <h1>User {params.id} {query.get('tab') ?? ''}</h1>
}

component Shell(children: Snippet) {
  <main><slot /></main>
}

export const router = createRouter({
  routes: {
    '/': { layout: Shell, children: { '/': Home, '/users/:id': User } },
  },
})
export const { Link } = router

export component App() {
  <nav>
    ${nav}
  </nav>
  <Router {router} />
}
`;

const links = `<router.Link to="/" activeClass="active" exact>Home</router.Link>
    <Link to="/users/:id" params={{ id: '42' }} query={{ tab: 'posts' }}>Ada</Link>`;

async function start(): Promise<HTMLElement> {
  history.replaceState(null, '', '/');
  const mod = await load(`import type { Snippet } from 'owt'\n${app(links)}`);
  const { App, router } = mod;
  if (typeof App !== 'function' || !isRouter(router)) throw new Error('App and router must be exported');
  const root = document.body.appendChild(document.createElement('div'));
  const instance = mount((props: Record<string, never>): Node => App(props), { target: root });
  onTestFinished(() => {
    instance.destroy();
    router.destroy();
    root.remove();
  });
  return root;
}

function isRouter(value: unknown): value is { destroy(): void } {
  return typeof value === 'object' && value !== null && typeof Reflect.get(value, 'destroy') === 'function';
}

describe('.owt markup', () => {
  it('renders links and the current route inside its layout', async () => {
    const root = await start();

    const out = html(root);

    expect(out).toBe(
      '<nav><a href="/" aria-current="page" class="active">Home</a><a href="/users/42?tab=posts">Ada</a></nav><main><h1>Home</h1></main>',
    );
  });

  it('navigates when a link is clicked', async () => {
    const root = await start();
    const user = root.querySelector('a[href^="/users"]');
    if (user === null) throw new Error('no user link');

    click(user);
    await settle();
    flushSync();

    expect([location.pathname, root.querySelector('main')?.textContent, user.getAttribute('aria-current')]).toEqual([
      '/users/42',
      'User 42 posts',
      'page',
    ]);
  });

  it('type-checks valid links', () => {
    const errors = typecheck(`import type { Snippet } from 'owt'\n${app(links)}`);

    expect(errors).toEqual([]);
  });

  it('reports a link to an unknown pattern', () => {
    const errors = typecheck(`import type { Snippet } from 'owt'\n${app('<Link to="/nope">x</Link>')}`);

    expect(errors.join('\n')).toContain(`Type '"/nope"' is not assignable to type '"/" | "/users/:id"'`);
  });

  it('reports missing params', () => {
    const errors = typecheck(`import type { Snippet } from 'owt'\n${app('<router.Link to="/users/:id">x</router.Link>')}`);

    expect(errors.join('\n')).toContain(`Property 'params' is missing`);
  });

  it('reports params of another shape', () => {
    const errors = typecheck(`import type { Snippet } from 'owt'\n${app(`<Link to="/users/:id" params={{ slug: 'x' }}>x</Link>`)}`);

    expect(errors.join('\n')).toContain(`'slug' does not exist in type '{ id: string; }'`);
  });

  it('accepts a layout typed with LayoutProps that renders <slot />', () => {
    const source = app(links).replace('component Shell(children: Snippet) {', `component Shell({ params }: LayoutProps<'/'>) {\n  void params`);

    const errors = typecheck(`import type { LayoutProps } from '@owt/router'\n${source}`);

    expect(errors).toEqual([]);
  });

  it('reports a route component that does not accept the params of its pattern', () => {
    const source = app('').replace(`'/users/:id': User`, `'/users/:slug': User`);

    const errors = typecheck(`import type { Snippet } from 'owt'\n${source}`);

    expect(errors.join('\n')).toContain(`Property 'id' is missing in type '{ slug: string; }'`);
  });
});

describe('type tests', () => {
  it('hold under the TypeScript compiler', () => {
    const errors = typecheckFiles([join(import.meta.dirname, 'types.spec.ts')]);

    expect(errors).toEqual([]);
  });
});
