Components

Summary
- Declared with `export component Name(props: Props) { ... }`.
- Body is HTML-like markup with `{ ... }` expression interpolation.

Compilation
- Compiles to a function `Name(props)` that uses DOM APIs to construct a `DocumentFragment` and returns a component instance with `mount/update/destroy`.

Notes
- Event handlers (attributes starting with `onX`) run and then trigger a full component re-render for now.

