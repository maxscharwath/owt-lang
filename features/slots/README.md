Slots

Current
- `<slot name="header" />` placeholders are parsed inside components to mark insertion points.
- Passing slot content from parents is not yet wired into codegen.

Planned
- Parent slot blocks: `slot(name) { ... }` compiled to closures in `props`.
- Default slot support and multiple named slots per component.
