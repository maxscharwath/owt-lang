Types

Support
- Full TypeScript in component prop signatures is preserved in the generated output, enabling type-checking.
- Type annotations on `var`/`val` and function return types are accepted and preserved where relevant.
- Type-only imports are stripped from the output JavaScript by the Vite plugin.

Planned
- Deeper static analysis of `var`/`val` dependencies and expression types for improved editor tooling and optimizations.
