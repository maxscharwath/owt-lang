# OWT Codebase Guidelines

These guidelines set clear conventions for this repo. They are intentionally minimal and opinionated to keep the codebase consistent and easy to maintain.

## Goals

- Consistent TypeScript with zero explicit `any`.
- Clean, extensionless local imports in source.
- Prefer simple, readable code over clever abstractions.
- **AVOID REGEX-BASED PARSING** - Regex makes code hacky, buggy, and hard to maintain. Use proper AST parsing instead.

## Compiler Architecture

- Folder structure under `packages/owt-compiler/src`:
  - `compile.ts`: orchestration only (parse, wire helpers, emit). Keep minimal.
  - `codegen/ids.ts`: ID generation per component.
  - `codegen/util.ts`: small helpers like `genExpr`, `genText`, `simpleVarFromExpr`.
  - `codegen/state.ts`: current compile state (var names, val inits/deps, context).
  - `codegen/svg.ts`: SVG-related attribute helpers.
  - `codegen/attributes.ts`: props + attribute handling and event listener glue.
  - `codegen/elements.ts`: element creation and child generation.
  - `event-handlers.ts`: event analysis and codegen.
  - `codegen-utils.ts`: lower-level codegen building blocks.
- Principles:
  - Single responsibility per module; no cross-cutting globals.
  - Use explicit inputs (ctx, uid) where practical; shared state only when it improves ergonomics without ambiguity.
  - Keep `compile.ts` short; push logic into the modules above.

## TypeScript

- No explicit `any`: Do not use `any` in production or test code. Prefer:
  - `unknown` for values whose shape is not yet known, with explicit narrowing.
  - Generics with constraints to model intent.
  - Precise union/intersection types over broad catch-alls.
  - `never` where something should be impossible.
- Keep `strict` mode on (already enabled) and do not relax compiler checks.
- Avoid `as` type assertions; prefer type-safe refinements. When unavoidable, prefer `satisfies` or narrow earlier.

## Imports

- Omit file extensions for local TS imports and re-exports:
  - Good: `import x from './foo'`
  - Bad: `import x from './foo.js'`
- Keep relative paths simple; prefer `./foo` over `./foo/index`.
- Do not reach across packages with deep relative paths; export from the package entrypoints instead.

## Linting (recommended)

- ESLint with flat config (see `eslint.config.mjs`) enforces:
  - No explicit `any` via `@typescript-eslint/no-explicit-any`.
  - No relative imports ending with `.js` via `no-restricted-imports` patterns.
- Suggested install (run once in repo root):
  - `pnpm add -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin`
  - Then run `pnpm run lint`.

## Tests

- Runner: Use Vitest for all tests.
- Location & naming: Colocate tests next to source, using `filename.spec.ts`.
- Single behavior: Each `it`/`test` verifies one behavior. If you feel the need to split assertions by concern, create another test.
- Short and focused: Keep tests tight; favor clarity over setup indirection. Aim for < ~15 lines per test.
- AAA blocks without comments: Structure code into three blocks separated by one blank line: declarations, execution, assertions. Do not add comments like `// Arrange`.
- No `any`, no assertions: Use exported type guards from `@owt/ast` (e.g., `isComponent`, `isElement`, `isIfBlock`) to narrow types. Avoid `as`.
- Deterministic inputs: Prefer inlined literals or local factories; avoid hidden fixture files.
- Descriptive names: Use behavior-focused titles, e.g., `parses if/else into branches`.

Example (good):

```
it('parses var/val and if/else', () => {
  const src = `export component App(){ var c=1; val d=c*2; if (c>0){<p/>} else {<span/>} }`;

  const ast = parse(src);

  const comp = ast.body.find(isComponent);
  const ifBlock = comp?.body.find(isIfBlock);
  expect(comp?.type).toBe('Component');
  expect(ifBlock?.branches?.[0]?.consequent?.[0]?.type).toBe('Element');
});
```

Anti-example (avoid):

```
it('does many things at once', () => {
  // Arrange
  const src = makeHugeFixture(); const ast: any = parse(src); const comp = ast.body[0] as any;
  // Act
  const el = comp.body.find((x: any) => x.type==='Element' && x.name==='ul');
  // Assert
  expect(comp).toBeTruthy(); expect(el).toBeTruthy();
});
```

## Exceptions

- Generated code may include `/* eslint-disable */` in emitted output. Do not mirror those patterns in source.
- If a rule blocks clear progress, open a PR to discuss rather than adding inline disables.

## Migration Notes

- Existing files have been updated to remove `.js` from local imports.
- Banning explicit `any` is enforced by linting; refactor progressively if violations remain.
