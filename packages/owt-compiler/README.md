OWT Compiler

Compiles `.owt` source to TypeScript that uses the `owt-runtime` to build and update the DOM.

Pipeline (initial):
- Parse with `owt-parser` to an AST
- Generate TS code + optional CSS string

Notes:
- Fine-grained updates:
  - Text nodes bound to simple `var`/`val` update in place via subscriptions.
  - Selected attributes (`value`, `textContent`, and boolean attrs) update as properties.
  - `if` / `for` regions re-render when local `var`s change.
- Event handlers: assignment/lambda/function handlers are supported; changed `var`s are detected and notified.
- Future: expand reactive coverage (more attributes, diffing in lists, slot content), CSS emission/scope.
