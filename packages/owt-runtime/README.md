OWT Runtime

Minimal runtime helpers and mounting API for compiled OWT components.

API:
- `mount(Component, { props, target })`: Instantiates and mounts a compiled OWT component.
- Types for `ComponentInstance` and `ComponentFn`.

Note: The initial compiler embeds some tiny helpers inline for performance and simplicity. The runtime focuses on mounting.

