# Editor support

All editors use the same language server, `@owt/language-server`, so features are identical everywhere:

- diagnostics: OWT syntax and compiler errors, TypeScript type errors in code **and markup** (unknown attributes, wrong prop types, missing props, assignments to `val`...), CSS errors in `<style>`;
- completions: TypeScript in expressions, element names, attribute names and values, event names, component props, CSS properties;
- hover, go to definition, find references, rename (across `.owt` and `.ts` files), document symbols, folding;
- completions for event modifiers after `|` (`onKeyDown|` → `enter`, `escape`, `ctrl`, `preventDefault`...);
- auto-closing tags, linked editing of opening/closing tag names, document formatting;
- semantic highlighting.

Type checking uses the TypeScript version of your project when it provides the JavaScript API (TypeScript 5.x/6.x); otherwise the server falls back to its bundled TypeScript 6.

## VS Code

Build and install the extension from this repository:

```bash
pnpm install
pnpm build
pnpm package:vscode            # creates packages/owt-vscode/owt-vscode-<version>.vsix
code --install-extension packages/owt-vscode/owt-vscode-*.vsix
```

The extension also registers the OWT TypeScript plugin, so `.ts` files that import `.owt` components get full types. Commands (`Ctrl+Shift+P`):

- **OWT: Show Compiled Output** — the JavaScript and CSS generated for the current file, updated as you type;
- **OWT: Show Virtual TypeScript** — the TypeScript used for type checking;
- **OWT: Restart Language Server**.

## JetBrains IDEs

See [`packages/owt-jetbrains`](../packages/owt-jetbrains/README.md). The plugin registers the `.owt` file type, highlighting (TextMate grammar) and connects the IDE's LSP client to the OWT language server (IntelliJ IDEA Ultimate, WebStorm, PhpStorm, PyCharm Professional, GoLand, RubyMine, Rider... 2025.2+).

## Neovim (nvim-lspconfig)

```lua
vim.filetype.add({ extension = { owt = 'owt' } })

vim.lsp.config('owt', {
  cmd = { 'npx', 'owt-language-server', '--stdio' },
  filetypes = { 'owt' },
  root_markers = { 'tsconfig.json', 'package.json' },
  init_options = {
    typescript = { tsdk = vim.fs.root(0, 'node_modules') .. '/node_modules/typescript/lib' },
  },
})
vim.lsp.enable('owt')
```

## Zed

`settings.json`:

```json
{
  "file_types": { "OWT": ["owt"] },
  "lsp": {
    "owt-language-server": {
      "binary": { "path": "npx", "arguments": ["owt-language-server", "--stdio"] }
    }
  }
}
```

## Helix

`languages.toml`:

```toml
[language-server.owt]
command = "npx"
args = ["owt-language-server", "--stdio"]

[[language]]
name = "owt"
scope = "source.owt"
file-types = ["owt"]
language-servers = ["owt"]
roots = ["package.json", "tsconfig.json"]
```

## Command line

Type-check a project (including `.owt` files) in CI:

```bash
npx owt-tsc --noEmit
```

`owt-tsc` accepts every `tsc` option (`-p`, `--watch`, `--declaration`...).
