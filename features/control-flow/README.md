Control Flow

Supported
- `if / else if / else` blocks. Conditions are evaluated at render time; branches are rendered accordingly.
- `for (item of iterable, meta)` with optional `empty {}` fallback. Iterates arrays; `meta` placeholder is parsed but not yet computed.

Planned
- `switch` with literal cases and `if` guards.
- `for await` for streaming.

