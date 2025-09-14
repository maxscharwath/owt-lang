State: var / val

Keywords
- `var name [: Type]? = Expr?;` — writable reactive state that persists across renders.
- `val name [: Type]? = Expr;` — read-only binding; becomes a reactive computed if it reads `var`s.

Rules
- A `var` initializer must not reference other `var`s (use `val` for derived state). This is validated at compile time.
- Semicolons are optional.

Reactivity
- Text nodes renderings of simple `var`/`val` are reactive and update in place.
- Selected attributes are reactive by property:
  - `value`, `textContent` update when dependencies change.
  - Boolean attributes (e.g. `disabled`, `checked`) are assigned as properties.
- Event handlers detect which `var`s changed and notify subscribers, updating only affected regions.

Example
```owt
var count = 0;
val doubled = count * 2;

<button onClick={() => count++}>+1</button>
<p>{count} / {doubled}</p>
```
