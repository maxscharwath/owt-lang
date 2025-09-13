State: var / val

Current behavior (initial cut)
- `var` and `val` declarations are parsed but not yet transformed; reactivity is implemented by full re-render after event handlers.
- `val` recomputes on re-render.

Planned
- Transform `var` to reactive signals and `val` to computed values with fine-grained updates.
- Track identifier references within expressions to update only affected nodes.

