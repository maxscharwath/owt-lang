OWT Runtime

Minimal runtime helpers and mounting API for compiled OWT components.

API:
- `mount(Component, { props, target })`: Instantiates and mounts a compiled OWT component.
- Types for `ComponentInstance` and `ComponentFn`.
 - `LoopMeta` type for `for` block meta (`index`, `first`, `last`, `even`, `odd`).

Helpers exported for generated code:
- `range(a, b)`, `rev(x)`, `toArray(x)`
- Dev logging hooks: `setDevLogger`, `devLog`

Note: The compiler embeds tiny helpers and subscribes to reactive updates; the runtime focuses on mounting and shared utilities.
