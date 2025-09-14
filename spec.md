# OWT Language Specification

Version: Draft-0.6
Status: Work-in-progress

Overview
- Goal: compact, typed, reactive UI language that compiles to TypeScript + tiny runtime helpers.
- Files: `.owt` may include regular ES imports at top; they are passed through to output.
- Core ideas: two state keywords (`var`, `val`), HTML-like markup, and plain TypeScript expressions.

Components
- Declare: `export component Name(<param>) { ... }`
- Props typing: parameter may include full TypeScript type annotations. The compiler preserves the signature in the generated function type.
- Destructuring: you can destructure the single `props` parameter in the signature for convenience.
  - Examples:
    - `export component Button(props: { text: string, onClick: () => void }) { ... }`
    - `export component Button({ text, onClick }: { text: string; onClick: () => void }) { ... }`
    - Reserved identifiers like `class` are supported; they are safely re-bound internally.
- Component usage: capitalized tags are treated as component invocations: `<Button text="Ok" />`.

State: var / val
- `var name [: Type]? = Expr?;`
  - Writable reactive state that persists across renders.
  - Restriction: a `var` initializer may not reference other `var`s; use `val` for derived state.
- `val name [: Type]? = Expr;`
  - Read-only binding. If its initializer reads `var`s, it becomes a reactive “computed” that updates when those `var`s change.
- Semicolons are optional in practice; the parser accepts either style.

Reactivity Model
- Text nodes: `{x}` where `x` is a simple `var` or `val` becomes reactive and updates in place.
- Attributes:
  - Static: `href="/"` sets a literal attribute.
  - Expression: `value={expr}` is evaluated; select attributes are bound reactively as properties:
    - Inputs: `value`, `textContent` update when their source changes.
    - Boolean attributes (e.g. `disabled`, `checked`) are set as properties.
  - Shorthand: `{onClick}` or `{disabled}` means “use current binding by name”.
  - Spread: `{...props}` merges an object of attributes/props.
- Events: attributes beginning with `onX` attach listeners (`onClick`, `onInput`, ...). The compiler:
  - Executes the handler (assignment, lambda, or function reference).
  - Detects which `var`s changed and notifies subscribers, updating only affected DOM parts.
  - For shorthand events, the variable is assumed to be a callable.

Control Flow
- If / else-if / else:
  - `if (cond) { ... } else if (cond2) { ... } else { ... }`
  - Re-evaluated when any local `var` changes.
- For-of with optional empty:
  - `for (item of Expr [, meta]) { ... } empty { ... }`
  - `meta` is either an identifier (e.g., `meta`) or a destructuring pattern `{ index, first, last, even, odd }`.
  - Ranges: `a..b` produces an inclusive sequence of integers from `a` to `b`.
  - Reverse iteration: `for (i of rev 1..10) { ... }` or `for (x of rev items) { ... }`.
  - The compiler computes `meta.index`, `meta.first`, `meta.last`, `meta.even`, `meta.odd` for each iteration.

Elements and Components
- Lowercase tag names produce DOM elements. Uppercase tag names invoke components.
- Attributes support static, expression, shorthand, and spread forms.
- Self-closing tags are supported: `<input />`.
- Closing tags must match and are validated.

Slots
- Placeholders: `<slot name="header" />` is parsed to mark slot positions inside a component.
- Passing slot content from parents is not yet wired into codegen. Planned: `slot(name) { ... }` blocks.

Styles
- `<style> ... </style>` blocks inside components are recognized. Emission and scoping are not yet implemented.

Functions
- You may declare local functions in a component: `function add() { ... }`.
- The compiler rewrites references so that reads/writes to local `var`s go through the component context and notify dependents when changed.

Errors and Limitations
- Mismatched closing tags throw a compile-time error.
- `switch`/pattern matching and `for await` are not implemented yet (tokens exist but grammar/codegen are pending).
- Default parameter values in component signatures are parsed but not applied to `props` yet.

Grammar (EBNF)
Note: `TsExpr`, `TsType`, and `Param` are delegated to TypeScript’s grammar; the parser captures them as raw strings.

Program        ::= { ImportStmt | ComponentDecl | Comment }
ImportStmt     ::= ES import line (passed through)
Comment        ::= LineComment | BlockComment

ComponentDecl  ::= ["export"] "component" Identifier "(" [ Param ] ")" Block
Param          ::= Identifier
                 | Pattern [":" TsType]
                 | Identifier [":" TsType] ["=" TsExpr]

Block          ::= "{" { Statement | Node } "}"

Statement      ::= VarDecl | ValDecl | IfBlock | ForBlock | FunctionDecl

VarDecl        ::= "var" Identifier [":" TsType] ["=" TsExpr] [";"]
ValDecl        ::= "val" Identifier [":" TsType] "=" TsExpr [";"]

FunctionDecl   ::= "function" Identifier "(" Params? ")" [":" TsType] "{" TsExpr "}"
Params         ::= any Ts parameter list (raw)

IfBlock        ::= "if" "(" TsExpr ")" Block { "else" "if" "(" TsExpr ")" Block } [ "else" Block ]

ForBlock       ::= "for" "(" Identifier "of" TsExpr [ "," ( Identifier | "{" IdentList "}" ) ] ")" Block [ "empty" Block ]
IdentList      ::= Identifier { "," Identifier }
// Semantics: TsExpr may start with the modifier `rev` and may include range literals `a..b`.

Node           ::= Element | Text | Expr
Element        ::= "<" TagName { Attribute } [ "/" ] ">" { Node | IfBlock | ForBlock } "</" TagName ">"
                 | "<" TagName { Attribute } "/>"
TagName        ::= Identifier | "slot"
Attribute      ::= Identifier ["=" ( StringLiteral | "{" TsExpr "}" )]
                 | "{" Identifier "}"
                 | "{" "..." TsExpr "}"

Expr           ::= "{" TsExpr "}"
Text           ::= any text until a markup or control token

Tokens (lexical)
- Keywords: `export`, `component`, `var`, `val`, `function`, `if`, `else`, `for`, `empty`.
- Punctuators: `< > / = : ; { } ( ) [ ] , . + - * % ! & | ?` and string/number literals.
- Additional tokens (not yet used): `switch`, `case`, `default`.

Examples
- Component with state and events:
```owt
export component Counter() {
  var count = 0;
  val doubled = count * 2;

  <div>
    <p>Count: {count} (×2 = {doubled})</p>
    <button onClick={() => count++}>+</button>
    <button onClick={() => count = 0}>Reset</button>
  </div>
}
```

- For with meta destructuring and reverse range:
```owt
<ul>
  for (i of rev 1..10, { index, first, last }) {
    <li>{index + 1}: {i} {first ? '(first)' : ''} {last ? '(last)' : ''}</li>
  } empty {
    <li>No items</li>
  }
</ul>
```

Tooling
- Vite plugin: transforms `.owt` files and injects a lightweight dev logger in dev mode.
- Runtime exports: `mount`, `range`, `rev`, `toArray`, and types like `LoopMeta`.


---

## 7. Styles

- Inline `<style>` blocks are **scoped** automatically.
- Compiler rewrites CSS selectors to apply only inside component.

```owt
<style>
  .card {
    border: 1px solid #ccc;
    padding: 1rem;
  }
</style>
```

---

## 8. Types

- TypeScript fully supported in props, vars, vals, and functions.

```owt
var todos: { text: string; done: boolean }[] = []
```

- Pattern matching + type narrowing works with tagged unions.

---

## 9. Example App

```owt
export component TodoApp() {
  var todos: { text: string }[] = []
  val total = todos.length

  function addTodo() {
    todos = [...todos, { text: `Todo ${todos.length + 1}` }]
  }

  <div>
    <h2>Todos ({total})</h2>

    <ul>
      for (i of 1..5, meta) {
        <li>{meta.index + 1}. {i}</li>
      } empty {
        <li>No items</li>
      }
    </ul>

    <button onClick={addTodo}>Add</button>
  </div>
}
```

---

## 10. Summary

- **Two keywords only**:  
  - `var`: writable, reactive, persisted  
  - `val`: constant (static or reactive derived)
- Components with typed props.
- Control flow: `if/else`, `for ... empty`, `switch`.
- **Range syntax**: inclusive ranges `a..b`. Use `rev` modifier in `for (x of ...)` to iterate backwards.
- Pattern matching on unions.
- Async blocks.
- Scoped styles.
- Slot-based composition.
- Expressions are standard TypeScript.

---

## 11. Grammar

```
Program       ::= { ComponentDecl }

ComponentDecl ::= "export"? "component" Identifier "(" [ ParamList ] ")" Block

ParamList     ::= Identifier ":" Type { "," Identifier ":" Type }

VarDecl       ::= "var" Identifier [ ":" Type ] "=" Expr
ValDecl       ::= "val" Identifier [ ":" Type ] "=" Expr

Expr          ::= Literal
                | Identifier
                | Expr BinaryOp Expr
                | "(" Expr ")"
                | FunctionExpr
                | AwaitExpr
                | RangeExpr
                | ObjectExpr
                | ArrayExpr
                | JSXElement

RangeExpr     ::= Expr ".." Expr
// Semantics: produces all integers from start to end inclusive if start ≤ end; otherwise produces an empty sequence.

IfStmt        ::= "if" "(" Expr ")" Block
                  { "else if" "(" Expr ")" Block }
                  [ "else" Block ]

ForStmt       ::= "for" "(" Identifier "of" [ "rev" ] Expr [ "," Identifier ] ")" Block
                  [ "empty" Block ]

SwitchStmt    ::= "switch" "(" Expr ")" "{" { CaseClause } [ DefaultClause ] "}"

CaseClause    ::= "case" Pattern [ Guard ] Block
DefaultClause ::= "default" Block
Guard         ::= "if" "(" Expr ")"

SlotDecl      ::= "<slot" [ "name=" Identifier ] "/>"

AsyncForStmt  ::= "for" "await" "(" Identifier "of" Expr [ "," Identifier ] ")" Block

StyleBlock    ::= "<style>" CSS "</style>"

Type          ::= TypeScriptType

Block         ::= "{" { Statement } "}"
Statement     ::= VarDecl | ValDecl | IfStmt | ForStmt | SwitchStmt
                | AsyncForStmt | Expr | SlotDecl | StyleBlock
```
