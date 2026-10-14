# OWT

**Make it happen.**

OWT is a typed UI language that compiles to fast, direct DOM code. Logic is plain TypeScript, markup is HTML, and two keywords hold state: `var` for state and `val` for derived values. Control flow reads like code: `if`, `for`, `switch`, `match`, `await`, `try`.

```owt
import type { Todo } from './types'

export component TodoList(title: string) {
  var todos: Todo[] = []
  var draft = ''
  val remaining = todos.filter((t) => !t.done).length

  function add() {
    if (!draft.trim()) return
    todos.push({ id: crypto.randomUUID(), text: draft, done: false })
    draft = ''
  }

  <h1>{title} ({remaining} left)</h1>
  <form onSubmit={(e) => { e.preventDefault(); add() }}>
    <input bind:value={draft} placeholder="What needs doing?" />
  </form>
  <ul>
    for (todo of todos; track todo.id) {
      <li class:done={todo.done}>
        <input type="checkbox" bind:checked={todo.done} /> {todo.text}
      </li>
    } empty {
      <li>Nothing to do</li>
    }
  </ul>

  <style>
    .done { text-decoration: line-through; opacity: 0.6; }
  </style>
}
```

You won't find hooks, dependency arrays, `$` prefixes or a virtual DOM here. A component body runs **once**. The compiler turns markup into cloned templates and wires each dynamic part to a fine-grained signal, so an update only touches the DOM nodes that changed.

## Highlights

- **Fast**: in a js-framework-benchmark style suite, OWT is faster than Vue 3.5 on every operation and faster than React 19 overall. It spends the least JavaScript time of the three on every operation. A typical app's runtime is about **7 KB gzipped**. See [Performance](#performance).
- **Typed end to end and null-safe**:
  - Props, generics, slots, events and bindings are type-checked, in markup too. Editors flag a wrong prop type, an unknown attribute or an assignment to a `val`, and `owt-tsc` reports the same errors in CI.
  - `null` and `undefined` must be handled before use: `if (val user = find(id))` renders only with a value, and an uninitialized `var` must allow `undefined`.
  - `match` checks exhaustiveness like Rust or Swift, so a forgotten case is a compile error.
- **Readable control flow**:
  - `if` / `else if` / `else`;
  - keyed `for` loops with `track`, meta (`index`, `first`, `last`...) and an `empty` block;
  - ranges `1..10` and `rev`;
  - `switch` with multiple values and guards;
  - `match` pattern matching with destructuring, guards and exhaustiveness checking;
  - null-safe `if (val x = …)` bindings;
  - `await` / `then` / `catch` blocks;
  - `try` / `catch` error boundaries with reset;
  - `key` blocks.
- **Batteries included**:
  - two-way bindings (`bind:value`, `bind:checked`, `bind:group`, `bind:this`, element sizes, media...);
  - `class:` and `style:` directives and actions (`use:`);
  - event and key modifiers (`onSubmit|preventDefault`, `onKeyDown|ctrl|enter`, `onClick|self`, `|once`, `|passive`);
  - transitions (`transition:`, `in:`, `out:`) with built-in `fade`, `fly`, `slide`, `scale` and `blur`, and `animate:flip` list animations, running on the Web Animations API;
  - named slots with arguments;
  - context and portals;
  - `<window>`, `<document>` and `<head>` elements;
  - deeply reactive objects and arrays;
  - async data with `resource()` (aborts outdated requests) and code-split `lazy()` components;
  - scoped CSS with `:global`.
- **First-class tooling**:
  - a Vite 8 plugin with HMR that keeps component state and an error overlay with code frames;
  - a Volar-based language server used by the VS Code extension, the JetBrains plugin, Neovim, Zed and Helix;
  - source maps throughout.

## Quick start

```bash
pnpm add owt
pnpm add -D @owt/vite vite
```

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import owt from '@owt/vite'

export default defineConfig({
  plugins: [owt()],
})
```

```ts
// src/main.ts
import { mount } from 'owt'
import { App } from './App.owt'

mount(App, { target: document.getElementById('app')!, props: { name: 'World' } })
```

```owt
// src/App.owt
export component App(name: string) {
  var count = 0
  val doubled = count * 2

  <h1>Hello {name}!</h1>
  <button onClick={() => count++}>Clicked {count} times</button>
  if (count > 0) {
    <p>Doubled: {doubled}</p>
  }
}
```

To give `.ts` files typed `.owt` imports in editors, add the TypeScript plugin to your `tsconfig.json`:

```jsonc
{
  "compilerOptions": {
    "plugins": [{ "name": "@owt/typescript-plugin" }],
    "types": ["vite/client"]
  }
}
```

Then type-check everything, markup included, with `owt-tsc --noEmit`.

> The packages are not published to npm yet. Inside this repository, run `pnpm install && pnpm build`, then try the [examples](#examples).

## A short tour

Full details are in the [language reference](spec.md).

```owt
import { Portal, onMount } from 'owt'
import { fade, fly } from 'owt/transition'
import { tooltip } from './actions'
import { fetchUser } from './api'
import { Chart, Likes, Pin, Posts } from './widgets.owt'

// three ways to declare props: (props: P), ({ a, b = 1 }: P), or named props
type Status =
  | { state: 'idle' }
  | { state: 'loading'; progress: number }
  | { state: 'failed'; error: Error }
  | { state: 'done'; items: string[] }

export component Profile(userId: number, status: Status, pins: { userId: number; title: string }[], size: 'sm' | 'lg' = 'sm', class?: string) {
  var tab = 'posts'
  var open = false
  val avatar = `/avatars/${userId}.png`          // re-computed when userId changes

  onMount(() => console.log('mounted'))

  <window onKeyDown|escape={open = false} />
  <head><title>Profile #{userId}</title></head>

  <section class={['profile', size, props.class]} class:open style:--accent="tomato">
    <img src={avatar} alt="" use:tooltip={'User ' + userId} />

    await (fetchUser(userId)) {
      <p>Loading…</p>
    } then (user) {
      <h2>{user.name}</h2>
    } catch (error) {
      <p class="error">Could not load the user: {String(error)}</p>
    }

    for (name of ['posts', 'likes'], { index }) {
      <button class:active={tab === name} onClick={tab = name}>{index + 1}. {name}</button>
    }

    switch (tab) {
      case 'posts' { <Posts {userId} /> }
      case 'likes' if (open) { <Likes {userId} /> }
      default { <p>Pick a tab</p> }
    }

    // pattern matching: destructure, guard, and every case must be handled
    match (status) {
      case { state: 'idle' } { <p>Idle</p> }
      case { state: 'loading', progress } if (progress > 0) { <progress value={progress} /> }
      case { state: 'loading' } { <p>Starting…</p> }
      case { state: 'failed', error: { message } } { <p class="error">{message}</p> }
      case { state: 'done', items: [first, ...rest] } { <p>{first} and {rest.length} more</p> }
      case { state: 'done' } { <p>No results</p> }
    }

    // null-safe binding: renders only when the value is not null/undefined
    if (val pinned = pins.find((p) => p.userId === userId)) {
      <Pin title={pinned.title} />
    }

    try {
      <Chart {userId} />
    } catch (error, reset) {
      <button onClick={reset}>Retry chart</button>
    }

    <slot name="footer" {userId}>Default footer</slot>
  </section>

  if (open) {
    <Portal>
      <div class="backdrop" transition:fade>
        <div class="modal" in:fly={{ y: 20 }} out:fade>…</div>
      </div>
    </Portal>
  }

  <style>
    .profile { border: 1px solid var(--accent); }
    .profile :global(a) { color: inherit; }
  </style>
}
```

Using it:

```owt
<Profile userId={id} status={{ state: 'idle' }} pins={[]} size="lg">
  slot footer({ userId }) {
    <a href={`/users/${userId}`}>Open full profile</a>
  }
</Profile>
```

Shared state is plain TypeScript:

```ts
// store.ts
import { reactive, computed } from 'owt'

type Item = { name: string; price: number }

export const cart = reactive({ items: [] as Item[] })
export const total = computed(() => cart.items.reduce((sum, i) => sum + i.price, 0))
```

## Performance

`benchmark/` runs a [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark)-style keyed suite. The same table app is written in vanilla JS, Vue 3.5, React 19 and OWT, built with Vite in production mode and driven by Playwright in Chromium. Durations are median click-to-paint times. Lower is better; the number in parentheses is the slowdown vs. vanilla.

<!-- benchmark:start -->
| Benchmark | vanilla | Vue 3.5 | React 19 | **OWT** |
|:---|---:|---:|---:|---:|
| create 1,000 rows | 112.7 | 144.3 (1.28) | 146.8 (1.30) | **121.5 (1.08)** |
| replace all 1,000 rows | 118.0 | 159.5 (1.35) | 172.3 (1.46) | **139.8 (1.19)** |
| partial update (every 10th row, 4x CPU slowdown) | 85.6 | 112.1 (1.31) | 100.8 (1.18) | **97.2 (1.13)** |
| select row (4x CPU slowdown) | 33.6 | 60.0 (1.78) | **41.7 (1.24)** | 42.5 (1.26) |
| swap rows (4x CPU slowdown) | 86.4 | 109.2 (1.26) | 722.0 (8.36) | **90.7 (1.05)** |
| remove row (4x CPU slowdown) | 138.9 | 161.4 (1.16) | **147.3 (1.06)** | 150.5 (1.08) |
| create 10,000 rows | 1121.8 | 1276.5 (1.14) | 1479.9 (1.32) | **1209.0 (1.08)** |
| append 1,000 rows to 1,000 | 143.4 | 176.3 (1.23) | 170.6 (1.19) | **160.8 (1.12)** |
| clear 1,000 rows | 10.4 | 13.1 (1.26) | 17.6 (1.69) | **12.2 (1.17)** |
| **geometric mean** | 1.00 | 1.30 | 1.59 | **1.13** |
| memory after creating 1,000 rows (MB) | 2.12 | 4.12 | 4.36 | **2.95** |
| JS bundle, gzip | 1.2 KiB | 24.8 KiB | 67.0 KiB | **6.9 KiB** |
<!-- benchmark:end -->

Headless Chromium 141 on 4 Xeon cores. Select and remove are within run-to-run noise of React: their standard deviation is 7 to 15 ms. On every operation, OWT spends less time in JavaScript than Vue and React; the rest of each duration is the browser's style, layout and paint. Run it yourself with `pnpm bench`. The full report, with every sample and the machine details, is in [`benchmark/results/latest.md`](benchmark/results/latest.md).

Where the speed comes from:

- **Compiled templates.** Static HTML is hoisted and cloned. Dynamic nodes are reached through precomputed `firstChild`/`nextSibling` paths. All dynamic parts of a template share one render effect, which compares against the previous value before touching the DOM.
- **Push-pull signals.** Dependencies are linked lists (no allocations on re-tracking). Derived values are lazy and validated by version, and DOM updates are batched in a microtask.
- **Lists.**
  - The keyed diff uses a longest increasing subsequence, so it makes the minimum number of DOM moves.
  - Rows replaced by new objects with the same `track` key keep their DOM.
  - Clearing an only-child list is O(1).
  - Reactive arrays are tracked with one dependency, not one per item.
- **Event delegation.** One document listener per event type, so thousands of rows cost no listeners.
- **No component re-execution.** Props are lazy getters, so a child only updates the nodes that read a changed prop.

## Tooling

| Package | Description |
|---|---|
| [`owt`](packages/owt) | Runtime: signals, deep reactivity, DOM layer, public API |
| [`@owt/vite`](packages/vite-plugin-owt) | Vite 7/8 plugin: compilation, scoped CSS through Vite's CSS pipeline, state-preserving HMR, error overlay |
| [`@owt/compiler`](packages/owt-compiler) | `compile(source, { filename, dev, hmr, css, sourcemap })` for other build tools |
| [`@owt/parser`](packages/owt-parser), [`@owt/ast`](packages/owt-ast) | Error-tolerant parser and AST |
| [`@owt/language-core`](packages/owt-language-core) | Volar language plugin: `.owt` to virtual TypeScript, formatter |
| [`@owt/language-server`](packages/owt-language-server) | LSP server: diagnostics, completions, hover, go to definition, references, rename, symbols, folding, formatting, CSS in `<style>` |
| [`@owt/typescript-plugin`](packages/owt-typescript-plugin) | Typed `.owt` imports in `.ts` files |
| [`owt-tsc`](packages/owt-tsc) | `tsc` with `.owt` support for CI |
| [VS Code extension](packages/owt-vscode) | Language client, TextMate grammar, snippets, compiled-output and virtual-code previews |
| [JetBrains plugin](packages/owt-jetbrains) | File type, highlighting and LSP integration for IntelliJ IDEA, WebStorm and other JetBrains IDEs 2025.2+ |

Setup instructions for VS Code, JetBrains IDEs, Neovim, Zed and Helix are in [`docs/editors.md`](docs/editors.md).

## Examples

| Example | Shows |
|---|---|
| [`examples/basic`](examples/basic) | Counter, conditionals, ranges and `rev` loops |
| [`examples/todo-app`](examples/todo-app) | Keyed lists, editing, filters, `localStorage` persistence, scoped styles |
| [`examples/showcase`](examples/showcase) | Most of the language in one app: bindings, slots, generics, context, actions, transitions, `await`, `try`, portals, `<window>`/`<head>` |

```bash
pnpm install && pnpm build
pnpm --filter owt-example-showcase dev
```

## Development

```bash
pnpm install
pnpm build          # build every package
pnpm test           # unit and integration tests (Vitest)
pnpm test:e2e       # build the examples and test them in Chromium
pnpm typecheck
pnpm lint
pnpm bench          # benchmark against Vue, React and vanilla
```

Conventions and the architecture overview are in [`agent.md`](agent.md).

## Status

OWT 1.0 is in beta. The language and APIs are close to final, but breaking changes are still possible before 1.0. Changes from 0.x are listed in the [migration notes](spec.md#migrating-from-0x).
