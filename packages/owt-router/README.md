# @owt/router

A small, typed client-side router for [OWT](../../README.md) (≈4 KB gzipped).

- **Typed params**: `'/users/:id'` gives `params: { id: string }`. A route component that expects other params is a type error.
- **Typed links**: `<Link to="/users/:id" params={{ id }}>` only accepts existing patterns with their params, in `.owt` markup too.
- **Nested layouts**, optional params (`:slug?`), wildcards (`*path`), catch-all `*`.
- **Fine-grained**: when only the params change, the route component stays mounted and its `params` prop updates.
- **Lazy routes** with `lazy()` and preloading on hover or visibility. Async **guards**, **history** or **hash** mode, a **base** path, scroll restoration and **view transitions**.

```ts
// router.ts
import { lazy } from 'owt'
import { createRouter } from '@owt/router'
import { Home } from './Home.owt'
import { NotFound } from './NotFound.owt'

export const router = createRouter({
  routes: {
    '/': Home,
    '/users/:id': lazy(() => import('./User.owt'), 'User'),
    '*': NotFound,
  },
})

export const { Link } = router
```

```owt
// App.owt
import { Router } from '@owt/router'
import { router, Link } from './router'

export component App() {
  <nav>
    <Link to="/" activeClass="active">Home</Link>
    <Link to="/users/:id" params={{ id: '42' }} activeClass="active">Ada</Link>
  </nav>
  <Router {router} />
}
```

```owt
// User.owt
export component User(params: { id: string }, query: URLSearchParams) {
  <h1>User {params.id}</h1>
}
```

See the **[routing guide](../../docs/router.md)** for patterns, nested layouts, links, navigation, guards, lazy routes, hash mode, scrolling and the API reference.
