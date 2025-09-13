OWT Parser

Parses `.owt` files into the typed AST from `owt-ast`.

Design goals:
- Small, predictable tokenizer.
- Simple recursive-descent parser for core syntax:
  - export component declarations
  - HTML-like elements with attributes (static, `{expr}`, `{...spread}`, `{shorthand}`)
  - text and `{expr}` nodes
  - `var` / `val` statements
  - basic control flow: `if/else if/else`, `for (..., meta) ... empty {}`
  - `<style>` extraction

Out of scope (initial): pattern `switch`, async `for await`.

