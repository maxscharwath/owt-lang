Styles

Current
- `<style>` blocks are recognized during parsing but not yet emitted. CSS scoping will be added in a follow-up.

Planned
- Hash-based scoping per component: rewrite selectors to `[data-owt-<hash>] ...` and apply attribute to component root.
- Virtual CSS module emission via the Vite plugin.

