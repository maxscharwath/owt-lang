OWT Language (Draft)

This repo contains an initial, typed implementation of the OWT toolchain:

- Compiler: `packages/owt-compiler` (parses `.owt` and outputs TypeScript)
- Parser/AST: `packages/owt-parser`, `packages/owt-ast`
- Runtime: `packages/owt-runtime` (mounting + types)
- Vite Plugin: `packages/vite-plugin-owt`
- Feature Docs: `features/*`

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
- Initial compiler does a full component re-render after event handlers. This keeps behavior correct while we build finer-grained reactive updates.
- See `features/*` for status and design notes.

