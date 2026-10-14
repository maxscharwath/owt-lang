# Changelog

## 1.0.0-beta.1

A rewrite of the whole toolchain. Migration notes from 0.x are in [spec.md](spec.md#migrating-from-0x).

### Language

- Three ways to declare props: a whole `props` object, destructuring with defaults and rest, or named props (reserved words such as `class` allowed). Generic components.
- `var` for state, deeply reactive (`todos.push(x)` updates the UI). `val` for lazy, cached derived values. Both can destructure: `val { width, height } = size`, `var [a, b] = pair`.
- Control flow:
  - `if` / `else if` / `else`;
  - keyed `for` with `track`, loop meta, ranges `1..n`, `rev` and `empty`;
  - `switch` with several values and guards;
  - `await` / `then` / `catch`;
  - `try` / `catch (error, reset)` error boundaries;
  - `key`.
- **`match`**: pattern matching with object, array, literal and wildcard patterns, destructuring bindings and guards. Exhaustiveness is checked by TypeScript.
- **Null safety**:
  - `if (val user = find(id))` renders only with a value and narrows it;
  - an uninitialized `var x: T` must allow `undefined`;
  - the tools warn when `strictNullChecks` is off.
- Slots: named slots with typed arguments (`slot row({ item }) { }`) and `<slot>` outlets with fallbacks.
- Directives and attributes:
  - `bind:` (value, checked, group, this, media and size bindings), typed by what each binding writes;
  - `class:`, `style:` (CSS variables included), `use:` actions;
  - `on:custom-event`, `ref`, spreads, shorthand attributes;
  - event modifiers: `onSubmit|preventDefault`, `onKeyDown|ctrl|enter`, `|self`, `|once`, `|passive`...
- Transitions: `transition:`, `in:`, `out:` with `fade`, `fly`, `slide`, `scale` and `blur` (Web Animations API), and `animate:flip` for list rows.
- `<window>`, `<document>`, `<body>` and `<head>` (reactive `<title>`), `Portal`, scoped CSS with `:global`.

### Runtime (`owt`)

- Push-pull signals with linked dependency lists. Compiled templates are cloned, with one grouped render effect per template. Keyed lists use a longest-increasing-subsequence diff, O(1) clears and delegated events.
- `mount`, `effect`, `watch`, `onMount`, `onDestroy`, `batch`, `tick`, `flushSync`, context, `reactive` stores.
- `resource()` for async data (it aborts outdated requests), `lazy()` components, `<Defer on="viewport">`, `selector()`, `uid()`.
- `defineElement()`: OWT components as Web Components (typed properties, attributes, events, slots, shadow DOM styles).
- `@owt/router`: typed client-side router (params typed from patterns, typed `Link` / `navigate` / `href`, nested layouts, lazy routes and preloading, async guards, history / hash mode, scroll restoration, View Transitions).

### Compiler (`@owt/compiler`)

- TypeScript erasure, reactive rewriting and source maps.
- Row/state comparisons in lists compile to selectors, so selecting a row updates O(1) rows.
- Warnings:
  - 12 accessibility rules;
  - unused CSS selectors;
  - unreachable `match` cases;
  - `<!-- owt-ignore code -->` silences a warning.

### Tooling

- `@owt/vite`: Vite 7/8 plugin with hook filters, CSS through Vite's pipeline, state-preserving HMR and an error overlay.
- `@owt/language-server` (Volar):
  - TypeScript diagnostics, completions, hover, definitions, references and rename, for code **and** markup;
  - CSS in `<style>`, symbols, folding, formatting, linked tag editing;
  - event modifier completions.
- `@owt/typescript-plugin` (typed `.owt` imports in `.ts`), `owt-tsc` (CI type checking), `create-owt` (`npm create owt@latest`).
- VS Code extension (TextMate grammar, snippets, compiled-output and virtual-code previews) and a JetBrains plugin (LSP + TextMate).

### Performance

A js-framework-benchmark style comparison is in [`benchmark/`](benchmark). OWT is faster than Vue 3.5 and React 19 overall, with a runtime of about 7 KB gzipped. Numbers are in the [README](README.md#performance).
