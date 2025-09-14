Components

Summary
- Declare with `export component Name(param) { ... }`.
- Body is HTML-like markup with `{ ... }` expression interpolation.
- Capitalized tags invoke components; lowercase tags create DOM elements.

Props
- The single parameter may be any TS parameter pattern:
  - Identifier: `props: Props`
  - Destructured: `{ text, onClick }: Props`
  - Reserved names like `class` are supported; they are safely re-bound internally.
- Default values in the signature are parsed but not yet applied to props.

Attributes
- Static: `class="btn"`
- Expression: `title={expr}`
- Shorthand: `{onClick}` or `{disabled}`
- Spread: `{...props}`

Events
- Attributes beginning with `onX` attach listeners.
- Handlers may be assignments (`count = 0`), lambdas (`(e) => ...`), or function references.
- After a handler runs, changed `var`s are detected and only affected regions update.

Compilation
- Compiles to a function `Name(props)` that returns `{ mount, update, destroy }`.
- Generated code uses DOM APIs directly and small helpers imported from `owt`.
