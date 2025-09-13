OWT Compiler

Compiles `.owt` source to TypeScript that uses the `owt-runtime` to build and update the DOM.

Pipeline (initial):
- Parse with `owt-parser` to an AST
- Generate TS code + optional CSS string

Notes:
- Initial implementation re-renders the component on any event handler execution. This keeps reactivity simple while maintaining correct behavior for `val` recomputation.
- Future: finer-grained updates via dependency tracking for `var`/`val` and node-level updates.

