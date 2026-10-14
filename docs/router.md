# Routing with `@owt/router`

`@owt/router` is a small client-side router for OWT apps (≈4 KB gzipped). It is typed end to end. Params are inferred from the route patterns, a route component that expects other params is a type error, and links and `navigate()` only accept existing patterns with the right params. Unknown patterns and missing or misspelt params are reported in the editor and by `owt-tsc`, in `.owt` markup too.

- [Setup](#setup)
- [Route components](#route-components)
- [Patterns](#patterns)
- [Nested routes and layouts](#nested-routes-and-layouts)
- [Links](#links)
- [Navigating from code](#navigating-from-code)
- [The current route](#the-current-route)
- [Guards](#guards)
- [Lazy routes and preloading](#lazy-routes-and-preloading)
- [History mode, hash mode, base path](#history-mode-hash-mode-base-path)
- [Scrolling and view transitions](#scrolling-and-view-transitions)
- [Types](#types)
- [API reference](#api-reference)
- [Notes and limitations](#notes-and-limitations)

---

## Setup

```bash
pnpm add @owt/router
```

Declare the routes in a TypeScript module. Keys are patterns and values are components:

```ts
// src/router.ts
import { lazy } from 'owt'
import { createRouter } from '@owt/router'
import { Home } from './pages/Home.owt'
import { Files } from './pages/Files.owt'
import { Post } from './pages/Post.owt'
import { AdminLayout, AdminHome, AdminUsers } from './pages/Admin.owt'
import { NotFound } from './pages/NotFound.owt'

export const router = createRouter({
  routes: {
    '/': Home,
    '/users/:id': lazy(() => import('./pages/User.owt'), 'User'),   // code-split
    '/files/*path': Files,
    '/posts/:slug?': Post,
    '/admin': { layout: AdminLayout, children: { '/': AdminHome, '/users': AdminUsers } },
    '*': NotFound,
  },
})

export const { Link } = router
```

Render the matched route with `<Router>`, anywhere in your app:

```owt
// src/App.owt
import { Router } from '@owt/router'
import { router, Link } from './router'

export component App() {
  <header>
    <nav>
      <Link to="/" activeClass="active">Home</Link>
      <Link to="/users/:id" params={{ id: '1' }} activeClass="active">Ada</Link>
      <Link to="/admin" activeClass="active">Admin</Link>
    </nav>
  </header>
  <Router {router} />
}
```

```ts
// src/main.ts
import { mount } from 'owt'
import { App } from './App.owt'

mount(App, { target: document.getElementById('app')! })
```

Route components often import `Link` from `./router`, and `./router` imports the components. This circular import is fine: components compile to function declarations, and nothing runs until the app renders.

## Route components

A route component receives two props:

| Prop | Type | |
|---|---|---|
| `params` | `Params<pattern>` | the params of its pattern, decoded (`'/users/a%20b'` → `'a b'`) |
| `query` | `URLSearchParams` | the query string |

Declare the props the way you like:

```owt
// named props
export component User(params: { id: string }, query: URLSearchParams) {
  <h1>User {params.id}</h1>
  <p>Tab: {query.get('tab') ?? 'profile'}</p>
}
```

```owt
// the RouteProps type of the pattern
import type { RouteProps } from '@owt/router'

export component User({ params, query }: RouteProps<'/users/:id'>) {
  <h1>User {params.id}</h1>
}
```

A component without props (`component Home()`) works for any route.

**Navigating between two URLs of the same route keeps the component.** From `/users/1` to `/users/2`, `User` is not re-created: its `params` prop changes, and only what depends on it updates. Data loading follows naturally with `resource`:

```owt
import { resource } from 'owt'
import { api } from '../api'

export component User(params: { id: string }) {
  const user = resource(() => params.id, (id, { signal }) => api.user(id, { signal }))

  if (val u = user.value) {
    <h1 class:dimmed={user.loading}>{u.name}</h1>
  } else {
    <p>Loading…</p>
  }
}
```

When the route switches to another component, the previous one is destroyed (its effects, resources and `onDestroy` callbacks are cleaned up, and outro transitions play). It never sees the params of the next route. To re-create a component on every param change, wrap its content in a `key` block: `key (params.id) { ... }`.

## Patterns

| Pattern | Matches | `params` |
|---|---|---|
| `/about` | `/about`, `/about/` | `{}` |
| `/users/:id` | `/users/42` | `{ id: string }` |
| `/posts/:slug?` | `/posts`, `/posts/hello` | `{ slug?: string }` |
| `/docs/:lang?/intro` | `/docs/intro`, `/docs/fr/intro` | `{ lang?: string }` |
| `/files/*path` | `/files`, `/files/a/b.txt` | `{ path: string }` (`''`, `'a/b.txt'`) |
| `*` | everything | `{}` |

- A wildcard (`*name` or `*`) must be the last segment. Its value is the rest of the path, which may be empty.
- Trailing and repeated slashes are ignored, and params are URL-decoded.
- **Priority** does not depend on the order of the routes. Static segments beat params, params beat optional params, and optional params beat wildcards, segment by segment. For example, `/users/new` wins over `/users/:id`, and `/posts` wins over `/posts/:slug?` for `/posts`. A catch-all `*` is only used when nothing else matches.
- When no route matches and there is no `*` route, `<Router>` renders nothing and `router.route.pattern` is `null`.

## Nested routes and layouts

A route can be a group: `{ layout?, children }`. The patterns of the children are joined to the group's pattern, so `'/admin'` + `'/users'` gives `'/admin/users'`, and `'/'` is the group itself. The layout is rendered around the matched child, which it receives as its `children` snippet:

```owt
// pages/Admin.owt
import type { Snippet } from 'owt'
import { Link } from '../router'

export component AdminLayout(children: Snippet) {
  <aside>
    <Link to="/admin" exact activeClass="active">Dashboard</Link>
    <Link to="/admin/users" activeClass="active">Users</Link>
  </aside>
  <main><slot /></main>
}

export component AdminHome() {
  <h1>Dashboard</h1>
}

export component AdminUsers() {
  <h1>Users</h1>
}
```

- Navigating between children keeps the layout mounted. Only the inner route changes.
- Groups nest (a layout for the whole app, then one per section...). A group at `'/'` is a convenient app shell: `'/': { layout: Shell, children: { '/': Home, '/about': About } }`.
- A group without a `layout` only prefixes its children's patterns.
- A layout also receives `params` and `query`. Type its props with `LayoutProps<pattern>` (`params` of the group's pattern plus `children`):

```owt
import type { LayoutProps } from '@owt/router'

export component OrgLayout({ params }: LayoutProps<'/orgs/:org'>) {
  <h1>{params.org}</h1>
  <slot />
}
```

## Links

`router.Link` is a component typed against your routes. Export it from the router module (`export const { Link } = router`), or use it as `<router.Link>`:

```owt
<Link to="/users/:id" params={{ id: user.id }} query={{ tab: 'posts' }} activeClass="active">
  {user.name}
</Link>
```

It renders an `<a>` with the real URL (`href="/users/42?tab=posts"`), so the link can be opened in a new tab, copied or crawled. A plain left click navigates without reloading. Clicks with a modifier key (Ctrl, ⌘, Shift, Alt), middle clicks, links with a `target` other than `_self`, and `download` links are left to the browser.

| Prop | Type | |
|---|---|---|
| `to` | a pattern of your routes | required; `'*'` patterns are excluded |
| `params` | `Params<to>` | required when the pattern has required params |
| `query` | object, `URLSearchParams` or string | `{ q: 'owt', tags: ['a', 'b'] }`; `null`, `undefined` and `false` values are left out |
| `hash` | `string` | fragment, with or without `#` |
| `replace` | `boolean` | replace the current history entry |
| `activeClass` | `string` | class added while the link is active |
| `exact` | `boolean` | active only on an exact match (default: also on sub-paths) |
| `preload` | `'hover'` \| `'viewport'` \| `false` | preload the lazy components of the target |
| any `<a>` attribute | | `class`, `title`, `rel`, `target`, `data-*`, `aria-*`, `onClick`... |

**Active links.** With `activeClass`, the link gets the class when the current path is its path or a sub-path. `/admin` is active on `/admin/users`, unless `exact` is set. A link to `/` is only active on `/`. The link of the current page (exact match, the query and hash are ignored) also gets `aria-current="page"`, for assistive technologies and for styling with `a[aria-current="page"]`.

`onClick` runs before the navigation. Call `event.preventDefault()` to cancel it.

**Styling.** `Link` is a component, so the scoped styles of the parent do not reach its `<a>`. Use `:global` for them, as for any child component:

```owt
<style>
  nav :global(a.active) { font-weight: 600; }
</style>
```

## Navigating from code

```ts
router.navigate('/users/:id', { id: '42' })                          // pattern + params
router.navigate('/users/:id', { id: '42' }, { query: { tab: 'posts' }, replace: true })
router.navigate('/about')                                             // pattern without params
router.navigate('/about', { replace: true })                          //   options as second argument
router.navigate(`/search?q=${encodeURIComponent(q)}`)                 // any path (string)
router.navigate('../settings')                                        // relative to the current path
router.back()
router.forward()
router.go(-2)

router.href('/users/:id', { id: '42' })                              // '/users/42'
router.href('/posts/:slug?', {}, { query: { page: 2 }, hash: 'top' }) // '/posts?page=2#top'
```

- `navigate` pushes a history entry, or replaces the current one with `replace: true` or when the target is the current URL.
- It returns a promise that resolves once the new route is rendered: `true`, or `false` when a guard cancelled the navigation or a newer navigation replaced it. It rejects when a guard throws.
- `navigate(path)` accepts any path, but not a pattern with params: `navigate('/users/:id')` is a type error (the params are missing). A URL to another origin is loaded with `location.assign`.

## The current route

`router.route` is reactive. Read it in markup, in a `val` or in an effect, and the UI follows:

```owt
import { router } from './router'

export component Breadcrumb() {
  val section = router.route.path.split('/')[1] ?? 'home'

  <p>{section} {router.route.query.get('q') ?? ''}</p>
  <p class:highlight={router.isActive('/admin')}>Admin area</p>
}
```

| Field | |
|---|---|
| `path` | path without the base, as in the URL (percent-encoded), without trailing slash |
| `pattern` | the matched pattern (`'/users/:id'`, `'*'`), `null` when nothing matched |
| `params` | the params of the matched pattern |
| `query` | `URLSearchParams` (read-only: navigate to change it) |
| `hash` | fragment without `#` |

`router.route` is a union discriminated by `pattern`. Checking the pattern narrows `params`:

```ts
const route = router.route
if (route.pattern === '/users/:id') {
  console.log(route.params.id)   // string
}
```

`router.isActive(pattern, params?, { exact? })` is the check behind `activeClass`. Without params, a pattern with params is compared as a pattern: `isActive('/users/:id')` is true on every user page.

`router.matched` lists the components rendered for the current route, outermost layout first (`{ pattern, component }`).

## Guards

`beforeEach` runs before every navigation, including the first one and back/forward:

```ts
export const router = createRouter({
  routes,
  async beforeEach(to, from) {
    if (to.pattern?.startsWith('/admin') && !(await session.isAdmin())) return '/login'
    if (from.pattern === '/admin/users' && form.dirty && !confirm('Leave without saving?')) return false
  },
})
```

| Return | Effect |
|---|---|
| nothing / `undefined` / `true` | continue |
| `false` | cancel. Back/forward navigations go back to where they were |
| a path (`'/login'`) | redirect. The guard runs again for the new path, with at most 10 redirects |
| a promise of one of these | the navigation waits for it |

`to` and `from` have the same fields as `router.route`: `to.params` is narrowed by `to.pattern`, and comparing a pattern with one that is not a route is a type error. While an async guard is pending, the current route stays rendered. A newer navigation (a click, back) cancels the pending one, whose promise resolves to `false`.

The first navigation is guarded too. Until its guard resolves, `<Router>` renders nothing. `router.ready` resolves once it is done.

## Lazy routes and preloading

Any component made with `lazy()` from `owt` can be a route or a layout. Its code is downloaded the first time the route renders. Vite splits it into its own chunk:

```ts
'/settings': lazy(() => import('./pages/Settings.owt'), 'Settings'),
'/reports': lazy(() => import('./pages/Reports.owt')),   // default export
```

Nothing renders for the route until its module has loaded, and load errors go to the closest `try` block. To start the download earlier:

```owt
<Link to="/settings" preload="hover">Settings</Link>       <!-- on hover / focus / touch -->
<Link to="/reports" preload="viewport">Reports</Link>      <!-- once the link is visible -->
```

```ts
router.preload('/settings')   // from code, e.g. after the first render
```

`preload` loads the layouts and the component of the route (those that have a `preload()` method, as `lazy()` components do).

## History mode, hash mode, base path

```ts
createRouter({ routes })                        // history mode: /users/42
createRouter({ routes, base: '/app' })          // app served under /app: /app/users/42
createRouter({ routes, mode: 'hash' })          // hash mode: /#/users/42
```

- **History mode** (default) uses real paths. The server must answer every app path with `index.html`. Vite's dev server and `vite preview` already do. In production, add a fallback rule (Netlify `_redirects`: `/* /index.html 200`, nginx `try_files $uri /index.html`...).
- **`base`** is the path the app is served under. It is stripped from `location.pathname` and added to every `href` (set Vite's `base` option to the same value).
- **Hash mode** keeps the route in the fragment (`/#/users/42?tab=posts`). It needs no server configuration, which suits static hosting, file previews and embedded pages. `base` does not apply, and a second `#` holds the route's own hash (`/#/docs#install`).

## Scrolling and view transitions

```ts
createRouter({ routes, scroll: 'restore', viewTransitions: true })
```

| `scroll` | |
|---|---|
| `'top'` (default) | scroll to the top after each navigation, or to the element whose `id` is the hash (`/docs#install`) |
| `'restore'` | like `'top'`, and back/forward restore the position the page had (sets `history.scrollRestoration = 'manual'`) |
| `false` | leave scrolling to you |

Scrolling happens right after the new route has rendered. A lazy route that is not loaded yet has no height then, so preload it if you rely on restoring a position inside it.

With `viewTransitions: true`, each navigation runs inside [`document.startViewTransition`](https://developer.mozilla.org/docs/Web/API/View_Transitions_API) when the browser supports it. Without that support, navigations happen as usual. Customize the animation with CSS:

```css
::view-transition-old(root), ::view-transition-new(root) { animation-duration: 150ms; }
```

## Types

Everything is inferred from the `routes` object. These types are exported for your own code:

| Type | |
|---|---|
| `Params<'/users/:id/:tab?'>` | `{ id: string; tab?: string }`. Static patterns give `Record<string, never>` |
| `RouteProps<P>` | `{ params: Params<P>; query: URLSearchParams }`, the props of a route component |
| `LayoutProps<P>` | `RouteProps<P>` plus `children`, the snippet that renders the nested route |
| `RoutePattern<typeof routes>` | every pattern, nested ones joined (`'/admin/users'`) |
| `LinkPattern<typeof routes>` | the patterns `Link`, `href`, `navigate` accept (without `'*'`) |
| `RouterInstance<typeof routes>` | the type of `router` |
| `Route<typeof routes>` | the type of `router.route` |

What the checker reports:

```text
// router.ts: a component expecting other params
'/users/:id': PostPage,
// ✗ Type 'RouteProps<"/users/:id">' is not assignable to type '{ params: { slug: string } }'

<Link to="/user/:id" params={{ id }}>…</Link>
// ✗ Type '"/user/:id"' is not assignable to type '"/" | "/users/:id" | "/admin" | …'

<Link to="/users/:id">…</Link>
// ✗ Property 'params' is missing

<Link to="/users/:id" params={{ userId: id }}>…</Link>
// ✗ Object literal may only specify known properties, and 'userId' does not exist in type '{ id: string }'
```

A `lazy()` component's props are only known once its module is loaded, so lazy routes are not checked against their pattern.

## API reference

```ts
function createRouter<const R extends RouteMap>(options: {
  routes: R                                  // checked: each component accepts RouteProps<its pattern>
  mode?: 'history' | 'hash'                  // default 'history'
  base?: string                              // history mode only
  scroll?: 'top' | 'restore' | false         // default 'top'
  viewTransitions?: boolean                  // default false
  beforeEach?(to: Route<R>, from: Route<R>): void | boolean | string | Promise<void | boolean | string>
}): RouterInstance<R>

interface RouterInstance<R> {
  readonly route: Route<R>                   // reactive
  readonly matched: readonly MatchedRoute[]  // reactive
  readonly ready: Promise<void>
  readonly Link: <P extends LinkPattern<R>>(props: LinkProps<R, P>) => Node
  href<P>(pattern: P, params?: Params<P>, options?: { query?, hash? }): string        // params required when P has some
  navigate<P>(pattern: P, params?: Params<P>, options?: { query?, hash?, replace? }): Promise<boolean>
  navigate(path: string, options?: { query?, hash?, replace? }): Promise<boolean>
  back(): void
  forward(): void
  go(delta: number): void
  isActive<P>(pattern: P, params?: Partial<Params<P>>, options?: { exact? }): boolean  // reactive
  preload(pattern: LinkPattern<R>): Promise<void>
  destroy(): void                            // remove the popstate / hashchange listeners
}

function Router(props: { router: RouterView }): Node     // <Router {router} />, any router from createRouter
```

## Notes and limitations

- **One router per app.** Each router listens to `popstate` (and `hashchange` in hash mode). Call `router.destroy()` to remove its listeners, for example in tests. `<Router>` cleans up its own effects when it is unmounted.
- **No server rendering.** `createRouter` reads `location` and `history` when it is called.
- `router.route.query` is shared and read-only. Use `navigate(path, { query })` to change it.
- Params are always strings. Convert them where you use them (`Number(params.id)`).
- Patterns are case-sensitive. A wildcard must be the last segment.
- Scroll restoration on back/forward happens right after the route renders, before lazy content has loaded.
