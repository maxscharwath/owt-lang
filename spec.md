# OWT Language Specification

Version: Draft-0.4  
Status: Work-in-progress  

---

## Overview

OWT is a modern reactive UI language and compiler designed for simplicity, strong typing, and efficient rendering.  
It compiles `.owt` files into highly optimized TypeScript + runtime calls.

**Design principles:**
- Minimal keywords (`var`, `val`).
- Full TypeScript type support in component signatures and variables.
- Reactive-by-default: any `var` or `val` change re-renders only the affected component.
- Clean, modern syntax with no JSX/React complexity.
- Small compiled output optimized for fine-grained updates.

---

## 1. Components

Defined with `component` keyword.

```owt
export component Button(props: { text: string, onClick: () => void }) {
  <button onClick={props.onClick}>
    {props.text}
  </button>
}
```

Usage:

```owt
export component App() {
  <Button text="Click me" onClick={() => console.log("Clicked!")} />
}
```

- Props are fully typed.
- Shorthand props supported:  
  `<div {onClick}>{text}</div>`
- Object spread supported:  
  `<div {...props}>{text}</div>`

---

## 2. Reactive State

OWT uses **two keywords only**: `var` and `val`.

### 2.1 `var`

- Writable **reactive signal**.
- Persists across renders.
- Cannot depend on another `var` in its initializer.

```owt
var counter = 0
var title: string = "Hello"
```

Mutations trigger re-render:

```owt
<button onClick={() => counter++}>+</button>
<button onClick={() => counter = 0}>Reset</button>
```

### 2.2 `val`

- Read-only binding: static constant or **reactive derived constant**.
- If initializer does not read any `var`: static constant.
- If initializer reads `var`s: computed value, auto-tracks dependencies.

```owt
var counter = 0
var step = 2
val doubled = counter * step   // recomputes when counter or step changes
```

**Note:** `val` is never writable.  
If you need mutable state, use `var`.

---

## 3. Expressions and Interpolation

- Curly braces embed expressions inside HTML.
- TypeScript expressions are valid.

```owt
<h1>{title}</h1>
<p>Counter: {counter}</p>
<p>Doubled: {doubled}</p>
```

---

## 4. Control Flow

### 4.1 `if / else if / else`

```owt
if (count > 0) {
  <p>Positive</p>
} else if (count < 0) {
  <p>Negative</p>
} else {
  <p>Zero</p>
}
```

### 4.2 `for ... empty`

- Iterates arrays, ranges, and generators.
- Provides **meta** object for scoped loop variables:  
  `{ index, first, last, even, odd }`.

```owt
<ul>
  for (todo of todos, meta) {
    <li>
      {meta.index}: {todo.text}
      {meta.first ? "(first)" : ""}
      {meta.odd ? "odd" : "even"}
    </li>
  } empty {
    <li>No items</li>
  }
</ul>
```

- OWT introduces a **range literal** using `start..end`.
- Produces an inclusive range from `start` up to `end`.
- If `start > end`, the range is considered empty.
- The `rev` keyword modifier can be used directly in the `for (x of ...)` loop to iterate backwards over arrays or ranges.

```owt
<ul>
  for (i of 0..10, meta) {
    <li>{meta.index + 1}. {i}</li>
  }
</ul>

<ul>
  for (i of rev 1..10, meta) {
    <li>{meta.index + 1}. {i}</li>
  }
</ul>

<ul>
  for (item of rev todos, meta) {
    <li>{meta.index}: {item.text}</li>
  }
</ul>
```

- The above produces numbers `0` through `10`.  
- The `rev` modifier reverses the iteration order.  
- Works seamlessly with `meta` properties like `first`, `last`, etc.

---

### 4.3 `switch` with pattern matching

- Type-safe.
- Supports literal cases, conditions, and destructuring.

```owt
switch (status) {
  case "loading" {
    <p>Loading...</p>
  }
  case "error" if (err.code === 500) {
    <p>Server error</p>
  }
  case { kind: "ok", value } {
    <p>Value: {value}</p>
  }
  default {
    <p>Unknown</p>
  }
}
```

---

## 5. Slots / Children

- A component can define **slot placeholders**.
- Parent passes children into slots.

### Define slots

```owt
component Card() {
  <div class="card">
    <slot name="header" />
    <div class="body">
      <slot />
    </div>
    <slot name="footer" />
  </div>
}
```

### Use slots

```owt
<Card>
  slot(header) { <h1>Title</h1> }
  <p>Main content here</p>
  slot(footer) { <button>OK</button> }
</Card>
```

Rules:
- Default slot: unnamed.
- Named slots: `slot(name)`.

---

## 6. Async Support

- Async expressions supported.
- `for await` for streaming.

```owt
val data = await fetchData()

<ul>
  for await (item of stream, meta) {
    <li>{meta.index}: {item}</li>
  }
</ul>
```

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
