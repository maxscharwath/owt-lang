# OWT Codebase Guidelines

Conventions for this repository. They are intentionally short and opinionated.

## Goals

- Consistent TypeScript with zero explicit `any` (`unknown` + narrowing, generics, precise unions).
- Clean, extensionless local imports in source (`./foo`, never `./foo.js`).
- Simple, readable code over clever abstractions.
- **No regex-based parsing.** OWT code is parsed by `@owt/parser` (markup) and Babel (TypeScript), CSS by the scoper's tokenizer. Small regexes for trivial string checks are fine in tests.

## Packages

| Package | Role |
|---|---|
| `packages/owt` (`owt`) | Runtime: signals (`reactivity.ts`), deep proxies (`proxy.ts`), DOM layer (`dom/`, transitions in `dom/transitions.ts`), public API (`index.ts`), built-in transitions (`transition.ts`, `owt/transition`), compiler target (`internal.ts`), editor typings (`elements.ts`, `language.ts`) |
| `packages/owt-ast` (`@owt/ast`) | AST types, guards, `walkTemplate`, `LineMap`, `codeFrame` |
| `packages/owt-parser` (`@owt/parser`) | Hand-written markup parser + JS-aware scanner; never throws, collects diagnostics |
| `packages/owt-compiler` (`@owt/compiler`) | `compile()` → JS module + CSS + source map |
| `packages/vite-plugin-owt` (`@owt/vite`) | Vite 7/8 plugin |
| `packages/owt-router` (`@owt/router`) | Typed client-side router: patterns and matching (`path.ts`), history/guards/scroll (`router.ts`), `<Router>` (`view.ts`), `<Link>` (`link.ts`), types (`types.ts`); guide in `docs/router.md` |
| `packages/owt-language-core` (`@owt/language-core`) | Volar language plugin: `.owt` → virtual TypeScript; formatter |
| `packages/owt-language-server` (`@owt/language-server`) | LSP server (Volar + TS + CSS + OWT services), bundled with TypeScript |
| `packages/owt-typescript-plugin` (`@owt/typescript-plugin`) | tsserver plugin (types for `.owt` imports in `.ts`) |
| `packages/owt-tsc` (`owt-tsc`) | `tsc` with `.owt` support |
| `packages/owt-vscode` | VS Code extension (client, TextMate grammar, snippets) |
| `packages/owt-jetbrains` | JetBrains plugin (Kotlin, LSP client) |
| `benchmark/` | js-framework-benchmark style comparison with Vue, React and vanilla |
| `examples/*` | runnable Vite apps (also used by `scripts/e2e.mjs`) |

## Compiler architecture (`packages/owt-compiler/src`)

- `compile.ts`: orchestration only (parse, analyze names, compile scripts/components, assemble output).
- `component.ts`: props, `var`/`val`, statements → one function per component.
- `template.ts`: markup → hoisted templates, node paths, grouped render effects, blocks.
- `js.ts`: TypeScript fragments: type erasure + reactive rewriting (magic-string, per-fragment source maps).
- `walk.ts`: scope-aware Babel walker (free reads/writes); `traverse.ts`: enumerate a component's JS.
- `bindings.ts`: how each name compiles (`state`, `derived`, `prop`, `signal`, `path`, `plain`).
- `css.ts`: scoped CSS; `html.ts`: HTML knowledge (namespaces, entities, whitespace, nesting rules).
- `a11y.ts`: accessibility warnings, checked once per HTML element; `ignore.ts`: `<!-- owt-ignore code -->` comments that silence warnings.
- `chunks.ts`: chunk trees + `CodeWriter` (source maps); `errors.ts`: `CompileError` (Vite overlay shape).

Principles: single responsibility per module, explicit inputs (contexts are passed, not global), generated names come from `FileContext.name()` so they never clash with user code.

## Runtime principles

- Reads are tracked, writes push "maybe stale" marks; computeds validate by version before recomputing.
- DOM work happens in render effects that compare with the previous value before touching the DOM.
- Every rendered piece of content has a stable first and last node (blocks render before an anchor comment; templates starting with a block get a leading marker).
- Block content lives in a `BlockScope`; removing it goes through `destroyContent`, which lets outro transitions finish before the nodes are removed.
- Hot paths avoid allocations (linked dependency lists, closure caches instead of objects).

## TypeScript

- `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` stay on.
- Avoid `as`; prefer narrowing and `satisfies`. Generated virtual code may use whatever TypeScript needs.

## Tests

- Vitest everywhere: `pnpm test`. Colocate unit tests (`*.spec.ts`) or put integration tests in `test/`.
- Runtime/DOM tests use `// @vitest-environment happy-dom`.
- Compiler behaviour is tested end to end: compile real `.owt` source, import it, mount it, interact (`packages/owt-compiler/test/helpers.ts`).
- Browser checks: `pnpm test:e2e` builds the examples and drives them in Chromium (Playwright).
- One behaviour per test, AAA layout (declarations / execution / assertions separated by a blank line), no comments like `// Arrange`, descriptive names.

## Build

- `pnpm build` builds every package in dependency order (tsdown for libraries, esbuild bundles for the server/plugin/CLI).
- Workspace packages consumed by Node (compiler, parser, plugin, tooling) must be built before running the examples or the benchmark; the runtime (`owt`) is consumed from source in the workspace. An example's own `pnpm run build` does it (`scripts/build-deps.mjs` builds the packages it depends on), so the examples deploy from a fresh clone (e.g. Vercel with the example as root directory).
