# OWT VS Code Plugin

Syntax highlighting, snippets, basic IntelliSense, and diagnostics for `.owt` files.

Features:
- Language id `owt` for `*.owt` files
- TextMate syntax highlighting with TypeScript embedded in `{ ... }`
- Snippets for components, `var`/`val`, `if`/`else`, `for ... empty`, and `switch`
- Keyword completions and hovers informed by the OWT spec
- Live diagnostics via the built-in `@owt/parser`

## Development

In the monorepo, build with:

```
pnpm --filter owt-vscode-plugin build
```

Then open this folder in VS Code and run the `Extension` launch target.

