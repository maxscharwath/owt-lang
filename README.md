OWT Language (Draft)

This repo contains an initial, typed implementation of the OWT toolchain:

- Compiler: `packages/owt-compiler` (parses `.owt` and outputs TypeScript)
- Parser/AST: `packages/owt-parser`, `packages/owt-ast`
- Runtime: `packages/owt-runtime` (mounting + types)
- Vite Plugin: `packages/vite-plugin-owt`
- Feature Docs: `features/*`
 - Language Spec: `spec.md`

Usage (local dev)
- Install deps: `pnpm i`
- In your Vite app `vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import owt from 'vite-plugin-owt'

export default defineConfig({
  plugins: [owt()],
})
```

Example
- Create `App.owt`:

```owt
export component App(props: { title: string }) {
  <div>
    <h1>{props.title}</h1>
    <button onClick={() => console.log('Clicked')}>Click</button>
  </div>
}
```

- Mount it:

```ts
import { mount } from 'owt-runtime'
import { App } from './App.owt'

mount(App, { props: { title: 'Hello' }, target: document.getElementById('root')! })
```

Notes
- Fine-grained updates are implemented for common cases: text nodes bound to simple `var`/`val`, selected attributes (e.g. `value`, `textContent`, boolean attributes), and control blocks. Event handlers detect changed `var`s and notify only the affected bindings.
- See `features/*` and `spec.md` for current behavior and plans.
