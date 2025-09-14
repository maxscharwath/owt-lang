Control Flow

Supported
- If/Else: `if (...) { ... } else if (...) { ... } else { ... }`.
- For-of with meta and empty: `for (item of expr, meta) { ... } empty { ... }`.
  - `expr` may be an array/iterable, a range literal `a..b` (inclusive), or prefixed with `rev` to iterate in reverse: `rev 1..10`, `rev items`.
  - `meta` can be an identifier (e.g. `meta`) or a destructuring pattern: `{ index, first, last, even, odd }`.
  - When provided, meta values are computed per-iteration.

Behavior
- Control blocks re-evaluate when local `var`s change. If/for sections are reconciled by removing and re-inserting the affected region.

Planned
- `switch` with literal patterns and optional `if` guards.
- `for await` for streaming.
