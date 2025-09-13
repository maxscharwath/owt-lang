Slots

Current
- `<slot name="header" />` placeholders are parsed. Passing slot content from parents is not yet wired in codegen.

Planned
- Parent slot blocks `slot(name) { ... }` to compile to `props.__slots[name]` closures.
- Default slot support.

