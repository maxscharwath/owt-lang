Styles

Current
- `<style>` blocks inside components are recognized by the parser.
- Emission and scoping are not yet implemented in codegen.

Planned
- Hash-based scoping per component: rewrite selectors to `[data-owt-<hash>] ...` and apply attribute to the component root.
- Virtual CSS module emission via the Vite plugin.
