# OWT

**Make it happen.**

OWT is an experimental, typed UI language that keeps developer experience front and center. The goal is a smart, clean way to build reactive interfaces:

- No `useState` or hooks ceremony.
- No `$` prefixes or template syntax quirks.
- No magic list macros – just a readable `for` loop.

Write components with plain TypeScript expressions and HTML-like markup. The compiler turns `.owt` files into TypeScript and a tiny runtime handles fine‑grained DOM updates.

## Why OWT?

Existing approaches either lean on heavy frameworks or rely on template-specific syntax. OWT takes a different path:

### Plain TSX
TSX lets you author UI in TypeScript, but you still manage reactivity and DOM updates manually. OWT adds declarative state and reactivity while keeping the authoring experience close to TSX.

### React
React popularized components and a virtual DOM but introduces hooks, `useState`, and reconciliation overhead. OWT compiles components to direct DOM operations, so updating state is as simple as assigning to a `var`.

### Svelte
Svelte removes the virtual DOM but adds magic like `$:` labels and `$` store prefixes. OWT aims for the same compiled efficiency without special syntax—just TypeScript and a few keywords.

Together these ideas aim to be a game changer for typed UI development.

## Features

- **State with `var` and `val`** – `var` declares reactive writable state, while `val` defines derived read-only values.
- **Typed components** – Component signatures are real TypeScript functions, giving you autocompletion and static checking.
- **Control flow** – Use `if/else` and `for … empty` blocks, including numeric ranges like `1..10`, to render lists and branches.
- **Slots** – Components expose named insertion points for children.
- **Scoped styles** – Inline `<style>` blocks are scoped to the component.
- **Async blocks** – Await Promises directly within markup.
- **Tiny runtime** – Compiled output targets a minimal DOM runtime with fine‑grained updates.

See [`features/`](features) and the full [language specification](spec.md) for details and current limitations.

## Quick Start

Install dependencies and add the Vite plugin:

```bash
pnpm install
```

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import owt from '@owt/vite';

export default defineConfig({
  plugins: [owt()],
});
```

Create a component:

```owt
export component App(props: { title: string }) {
  <h1>{props.title}</h1>
}
```

Mount it in your app:

```ts
import { mount } from 'owt/dom';
import { App } from './App.owt';

mount(App, { props: { title: 'Hello' }, target: document.getElementById('root')! });
```

The `mount` helper automatically initializes the DOM host—no extra setup required.

## Examples

The [`examples/`](examples) directory contains runnable projects. Start with [`basic`](examples/basic) or explore the more complete [`todo-app`](examples/todo-app).

## Status

OWT is a work in progress. Expect breaking changes while the language and tooling evolve.
