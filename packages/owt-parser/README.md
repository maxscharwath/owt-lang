OWT Parser

Parses `.owt` files into the typed AST from `owt-ast`.

Design goals:
- Small, predictable tokenizer.
- Simple recursive-descent parser for core syntax:
  - export component declarations
  - HTML-like elements with attributes (static, `{expr}`, `{...spread}`, `{shorthand}`)
  - text and `{expr}` nodes
  - `var` / `val` statements and local `function` declarations
  - control flow: `if/else if/else`, `for (item of expr, meta) ... empty {}`
    - meta identifier or destructuring pattern
  - `<style>` block recognition

Out of scope (initial): pattern `switch`, async `for await`.
