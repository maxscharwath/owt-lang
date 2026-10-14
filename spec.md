# OWT Language Reference

Version: 1.0 (beta)

OWT is a typed UI language: TypeScript for logic, HTML for markup, two keywords for state (`var`, `val`) and readable control flow (`if`, `for`, `switch`, `match`, `await`, `try`). The compiler turns `.owt` files into small, fast JavaScript that updates the DOM directly through fine-grained signals — there is no virtual DOM and no re-rendering of components.

- [Files and modules](#files-and-modules)
- [Components](#components)
- [State: `var` and `val`](#state-var-and-val)
- [Markup](#markup)
- [Attributes and directives](#attributes-and-directives)
- [Control flow](#control-flow)
- [Using components](#using-components)
- [Special elements](#special-elements)
- [Styles](#styles)
- [Runtime API](#runtime-api)
- [TypeScript](#typescript)
- [Tooling](#tooling)
- [Grammar](#grammar)
- [Migrating from 0.x](#migrating-from-0x)

---

## Files and modules

An `.owt` file is a TypeScript module that can also declare components.

```owt
import { Button } from './Button.owt'          // .owt files import each other
import { format } from './utils'
import type { User } from './types'            // type-only imports are erased

const MAX = 10                                  // any module-level TypeScript
export function helper() { /* ... */ }

export component UserList(users: User[]) { ... }   // exported component
component Row(user: User) { ... }                  // file-private component
export default component Page() { ... }            // default export
```

- A file may contain any number of components and any TypeScript (imports, types, interfaces, enums, functions, constants, exports).
- Unused imports and type-only imports are removed, like `tsc --isolatedModules`.
- A `<style>` at module level contains global CSS.

## Components

```owt
export component Greeting(props: { name: string }) {
  <h1>Hello {props.name}!</h1>
}
```

A component is compiled to a function `(props) => Node`. Its body runs **once** per instance: it declares state and helpers, then describes the markup. Updates never re-run the body; only the parts of the DOM that depend on changed values are touched.

### Parameters

There are three ways to declare props:

| Form | Example | Notes |
|---|---|---|
| Props object | `component Card(props: CardProps)` | the single parameter **named `props`** receives the whole object |
| Destructuring | `component Card({ title, size = 'md', ...rest }: CardProps)` | defaults apply when the prop is `undefined`, `...rest` collects the remaining props |
| Named props | `component Icon(name: string, size = 16, class?: string)` | every parameter is a prop; reserved words such as `class` are allowed |

All forms stay reactive: reading a prop always returns its current value. Inside any component, `props` refers to the whole props object unless you declare something named `props` yourself.

Generic components take type parameters:

```owt
export component List<T>(items: T[], render: (item: T) => string) { ... }
```

### Body

The component body is TypeScript with markup:

- `var` / `val` declarations (see below);
- any TypeScript statement: `const`, `let`, `function`, `class`, expression statements (`console.log(...)`, `onMount(...)`);
- markup: elements, `{expressions}` and control-flow blocks;
- `<style>` blocks.

Statements run in order, once. A line starting with `<` is markup; `if`, `for`, `switch`, `match`, `await`, `try` and `key` blocks at the start of a line are markup blocks (use them inside functions for imperative logic; a call like `match(x)` without a `{ }` body stays a statement). `return` and `await` at the top level of a component are errors: setup is synchronous (use `await` blocks or `onMount(async () => ...)`).

## State: `var` and `val`

```owt
var count = 0                          // reactive state
var todos: Todo[] = []                 // deeply reactive
val doubled = count * 2                // derived, recomputed when count changes
val remaining = todos.filter((t) => !t.done).length
```

### `var`

- Assigning updates everything that reads the variable: `count = 1`, `count++`, `count += 2`, `[a, b] = [b, a]`.
- Objects and arrays are **deeply reactive**: `todos.push(x)`, `todos[0].done = true`, `delete obj.key` all trigger updates. Only plain objects and arrays are proxied; class instances, `Map`, `Date`, DOM nodes... are left untouched (use `markRaw(obj)` to opt out).
- Initial values are evaluated once. A `var` initialized from a prop does not follow later prop changes (use `val` for that).
- A `var` that is never re-assigned (only mutated) compiles to a plain reactive object: no signal overhead.

### `val`

- Read-only. Assigning to a `val` is a compile error.
- Lazy and cached: computed on first read, recomputed only when a dependency changed and someone reads it.
- A `val` initialized with a literal compiles to a constant.

`val` can also appear at the top of any block body (`if`, `for`, slot definitions...), where it can use the loop item:

```owt
for (user of users) {
  val label = `${user.first} ${user.last}`
  <li>{label}</li>
}
```

### Functions

Functions declared in the component can read and write state directly:

```owt
function add() {
  if (!draft.trim()) return
  todos.push({ id: crypto.randomUUID(), text: draft, done: false })
  draft = ''
}
```

## Markup

```owt
<section class="app">
  <h1>{title}</h1>
  <p>You have {count} {count === 1 ? 'item' : 'items'}.</p>
  <!-- HTML comments are allowed -->
</section>
```

- Lowercase tags are HTML/SVG/MathML elements, capitalized or dotted tags (`<Button>`, `<Icons.Plus>`) are components.
- `{expression}` interpolates any TypeScript expression. `null`, `undefined` and booleans render nothing.
- Void elements (`<input>`, `<br>`, `<img>`...) don't need `/>`.
- Whitespace follows JSX rules: lines are trimmed and joined with a space, blank lines are removed, text on a single line is kept as written. `<pre>` and `<textarea>` keep their whitespace.
- HTML entities (`&nbsp;`, `&copy;`, `&#8212;`...) work in text.
- Markup that the HTML parser would restructure (`<div>` inside `<p>`, `<tr>` directly in `<table>`...) is a compile error, so what you write is what you get.
- `<svg>`/`<math>` children are created in the right namespace; a component whose root is an SVG element (e.g. `<path>`) works inside a parent `<svg>`.

## Attributes and directives

| Syntax | Meaning |
|---|---|
| `title="Hello"` | static attribute |
| `title={expr}` | dynamic attribute (removed when `null`/`undefined`/`false`) |
| `hidden` | boolean attribute |
| `{disabled}` | shorthand for `disabled={disabled}` |
| `{...attrs}` | spread an object of attributes / event handlers |
| `class={['btn', { active: on }]}` | strings, arrays and objects (clsx-style) |
| `class:active={on}` | toggle a single class (`class:active` alone means `class:active={active}`) |
| `style={{ color, marginTop: '1rem' }}` | style string or object |
| `style:color={c}` / `style:--size="2px"` | single style property, CSS variables included |
| `value={x}`, `checked={x}`, `innerHTML={html}` | set as DOM properties |
| `onClick={handler}` | event listener (`onKeyDown` → `keydown`, `onDoubleClick` → `dblclick`) |
| `onClickCapture={h}` | capture phase listener |
| `on:my-event={h}` | listener for a custom (case-sensitive) event name |
| `bind:value={name}` | two-way binding |
| `ref={el}` / `bind:this={el}` | element reference (also accepts a callback `ref={(el) => ...}`) |
| `use:action={params}` | attach an action |
| `transition:fade`, `in:fly={{ y: 20 }}`, `out:slide` | animate when entering / leaving |

### Events

The handler is any expression:

- a function: `onClick={() => count++}`, `onClick={save}`;
- an assignment or update, run as a statement: `onClick={count = 0}`, `onClick={open = !open}`; the event is available as `event`.

Common bubbling events (`click`, `input`, `keydown`, `pointerdown`...) are delegated to the document, so large lists don't pay for thousands of listeners. `event.stopPropagation()` works as usual.

### Bindings

| Binding | Elements | Value |
|---|---|---|
| `bind:value` | `<input>`, `<textarea>`, `<select>` | string (number for `type="number"`/`"range"`, array for `<select multiple>`) |
| `bind:checked` | checkbox | boolean |
| `bind:group` | radio / checkbox with a `value` | selected value / array of values |
| `bind:this` | any element | the element (set to `null` on destroy) |
| `bind:open`, `bind:files`, `bind:textContent`, `bind:innerHTML`, `bind:innerText`, `bind:currentTime`, `bind:volume`, `bind:muted`, `bind:playbackRate`, `bind:indeterminate` | matching elements | the DOM property |
| `bind:clientWidth`, `bind:clientHeight`, `bind:offsetWidth`, `bind:offsetHeight` | any element | read-only size, via `ResizeObserver` |

The target can be a `var`, a bindable prop or a property (`bind:value={todo.text}`).

### Actions

An action is a function called with the element after it is mounted:

```ts
export function tooltip(el: HTMLElement, text: string) {
  el.title = text
  return { update: (next: string) => (el.title = next), destroy: () => {} }
}
```

```owt
<button use:tooltip={`Delete ${item.name}`}>×</button>
```

### Transitions

`transition:fn` animates an element when it enters and leaves the document, `in:fn` only when it enters, `out:fn` only when it leaves. Built-in transitions come from `owt/transition`:

```owt
import { fade, fly, slide } from 'owt/transition'

if (open) {
  <div class="backdrop" transition:fade={{ duration: 150 }} />
  <aside in:fly={{ x: -300 }} out:fade>…</aside>
}
for (todo of todos; track todo.id) {
  <li transition:slide>{todo.text}</li>
}
```

| Transition | Parameters (all optional) | Effect |
|---|---|---|
| `fade` | `delay`, `duration`, `easing` | opacity |
| `fly` | `x`, `y` (px or CSS length), `opacity`, timing | translate and fade |
| `scale` | `start` (scale of the hidden state), `opacity`, timing | scale and fade |
| `blur` | `amount` (px or CSS length), `opacity`, timing | blur and fade |
| `slide` | `axis` (`'y'` or `'x'`), timing | height (or width), padding, margin and border |

Easings are CSS easing functions (`'ease-out'`, `'cubic-bezier(...)'`, `'linear(...)'`); `owt/transition` also exports `cubicIn`, `cubicOut`, `cubicInOut`, `quintOut`, `expoOut` and `backOut`.

Transitions are **local**: an element animates when the block content that directly contains it (an `if` branch, a `for` row, an `await` state, a `key` block...) is added or removed by an update. Child components belong to the block that contains them. Content rendered by the initial mount, or by a block that is itself being created, appears without intro. Leaving content stays in the document, with its effects already stopped, until all its outros have finished. A `transition:` that is interrupted while coming in plays backwards from where it is.

A transition is a function returning [Web Animations](https://developer.mozilla.org/docs/Web/API/Web_Animations_API) keyframes from the hidden to the visible state; the outro plays them in reverse:

```ts
import type { TransitionConfig } from 'owt/transition'

export function spin(node: Element, params: { turns?: number; duration?: number } = {}): TransitionConfig {
  return {
    duration: params.duration ?? 400,
    easing: 'ease-out',
    keyframes: [{ transform: `rotate(${params.turns ?? 1}turn) scale(0)` }, { transform: 'none' }],
  }
}
```

The third argument tells the direction (`{ direction: 'in' | 'out' | 'both' }`); returning `null` skips the animation. Elements receive `introstart`, `introend`, `outrostart` and `outroend` events (`onIntroEnd={...}`).

## Control flow

Blocks start at the beginning of a line (or right after a tag) and use braces. Bodies contain markup.

### if

```owt
if (user === null) {
  <Login />
} else if (user.admin) {
  <AdminPanel {user} />
} else {
  <Dashboard {user} />
}
```

Branches are only re-created when the selected branch changes. TypeScript narrowing works inside branches.

**Null-safe bindings.** `if (val name = expression)` evaluates the expression once and renders the branch when the value is not `null` or `undefined`. Inside the branch, `name` is the value with `null` and `undefined` removed from its type. It works like `if let` in Swift and Rust, or `?.let` in Kotlin:

```owt
if (val user = users.find((u) => u.id === selectedId)) {
  <UserCard name={user.name} />     // user: User, not User | undefined
} else if (val draft = drafts.get(selectedId)) {
  <DraftCard {draft} />
} else {
  <p>Nothing selected</p>
}
```

Unlike a plain `if`, only `null` and `undefined` skip the branch: `0`, `''` and `false` render it. The name only exists inside its branch. If the value changes but stays non-null, the branch is kept and updates in place.

### for

```owt
for (todo of todos, { index, first, last }; track todo.id) {
  <li class:first>{index + 1}. {todo.text}</li>
} empty {
  <li>Nothing to do</li>
}
```

- `item` can be a name or a destructuring pattern: `for ({ id, name } of users)`, `for ([key, value] of Object.entries(map))`.
- The iterable can be an array (reactive arrays are tracked efficiently), any iterable, an array-like, a number `n` (`0..n-1`), or a range `a..b` (inclusive): `for (i of 1..10)`.
- `rev` iterates in reverse without mutating: `for (i of rev 1..count)`, `for (x of rev items)`.
- The optional meta is a name (`meta.index`) or a pattern of `index`, `first`, `last`, `even`, `odd`, `length`. Meta values are reactive.
- `track <expr>` sets the key used to match items between updates. Without `track`, items are matched by identity. With `track`, an item that is replaced by a new object with the same key keeps its DOM and updates in place. `track index` keys by position.
- `empty { }` renders when the list is empty.

Updates use a keyed diff with minimal DOM moves (longest increasing subsequence), and clearing a list that is the only child of its parent is O(1).

### switch

```owt
switch (status) {
  case 'idle' { <p>Ready</p> }
  case 'loading', 'saving' { <Spinner /> }
  case 'error' if (retryable) { <Retry /> }
  default { <p>Done</p> }
}
```

Cases compare with `===`, accept several values and an optional `if (guard)`. There is no fall-through.

### match

`match` is pattern matching, like `match` in Rust, `switch` in Swift or `when` in Kotlin. Cases destructure the value and test its shape. Without a `default`, TypeScript checks that every possible value is handled.

```owt
type Shape =
  | { kind: 'circle'; radius: number }
  | { kind: 'rect'; width: number; height: number }
  | { kind: 'group'; items: Shape[] }

match (shape) {
  case { kind: 'circle', radius } { <Circle r={radius} /> }
  case { kind: 'rect', width: w, height: h } if (w === h) { <Square size={w} /> }
  case { kind: 'rect', width, height } { <Rect {width} {height} /> }
  case { kind: 'group', items: [] } { <p>Empty group</p> }
  case { kind: 'group', items: [first, ...others] } { <Group {first} {others} /> }
}
```

| Pattern | Matches | Binds |
|---|---|---|
| `_` | anything | nothing |
| `'circle'`, `42`, `-1`, `true`, `null`, `undefined` | that value (`===`) | nothing |
| `Status.Active`, `MAX + 1`, any other expression | that value (`===`) | nothing |
| `{ kind: 'circle', radius }` | an object (not `null`) whose properties match | `radius` |
| `{ size: s }`, `{ user: { name } }` | nested properties | `s`, `name` |
| `[a, b]` | an array of exactly two elements | `a`, `b` |
| `[first, ...rest]` | an array with at least one element | `first`, `rest` |
| `'a', 'b'` (several patterns) | any of them (they cannot bind names) | nothing |

- At the top level, names compare by value (`case MAX`) and `_` matches anything. Inside object and array patterns, names bind (like destructuring) and `_` ignores a value.
- `case pattern if (guard)` also requires the guard, which can use the names bound by the pattern.
- The first matching case renders. When the value changes and the same case still matches, its content stays and its bindings update in place.
- **Exhaustiveness**: without `default`, a `match` that does not handle every member of the value's type is a type error. For example: `Argument of type '{ kind: "group"; ... }' is not assignable to parameter of type 'never'`. The error is reported on `match` and names the unhandled members. Add the missing cases, or a `default { }` / `case _ { }`.
- Exhaustiveness is worked out from the value's direct literal properties and values (`kind: 'circle'`, `case 'idle'`). A case that also tests nested values, array lengths or a guard only partly handles its member. End such a group with a broader case (`case { kind: 'group' }`) or a `default`. Nested object patterns like `{ error: { message } }` rely on the property's type: they are only an error when that property can be `null`.
- Impossible patterns are type errors too: `case { kind: 'triangle' }` when no member has that kind, or a misspelled property such as `{ radiuss }`.
- At runtime, a value that matches no case renders nothing. A case after a catch-all case (`case _` without a guard) gets an "unreachable" warning.

### await

```owt
await (fetchUser(id)) {
  <p>Loading…</p>
} then (user) {
  <p>{user.name}</p>
} catch (error) {
  <p class="error">{error.message}</p>
}
```

The pending block, `then` and `catch` are all optional (at least one is required). When the expression produces a new promise, the block switches back to pending; results of outdated promises are ignored. Non-promise values render `then` immediately. Unhandled rejections propagate to the closest `try` boundary.

### try (error boundaries)

```owt
try {
  <Chart data={data} />
} catch (error, reset) {
  <p>Chart failed: {error.message}</p>
  <button onClick={reset}>Retry</button>
}
```

Catches errors thrown while rendering or updating the body (including errors from effects and unhandled `await` rejections). `reset()` renders the body again.

### key

```owt
key (userId) {
  <Profile id={userId} />
}
```

Destroys and re-creates the content when the key changes (resets component state, restarts transitions...).

## Using components

```owt
<Button label="Save" disabled={!dirty} onPress={save} />
```

- Props are passed lazily: a prop like `disabled={!dirty}` is a getter, so the child always reads the current value and only the parts of the child that use it update.
- `{...props}` spreads an object of props; later attributes win.
- `bind:value={x}` passes a two-way binding: when the child assigns the prop (`value = 3`), the parent's `x` is updated. Assigning a prop that is not bound logs a warning in development.
- A tag whose name is a reactive value is a dynamic component: `var View = Home` then `<View />` re-mounts when `View` changes.

### Children and slots

Content between the tags is passed as the default slot (`children`). Named slots are defined with `slot name(args) { ... }`:

```owt
<Card title="Users">
  slot header({ title, count }) {
    <h2>{title} ({count})</h2>
  }
  <UserList {users} />
</Card>
```

The child renders them with `<slot>` outlets; attributes become the slot arguments and children are the fallback:

```owt
export component Card(title: string) {
  <section>
    <slot name="header" title={title} count={3}>
      <h2>{title}</h2>
    </slot>
    <slot />
    <slot name="footer">Default footer</slot>
  </section>
}
```

Slots are plain props of type `Snippet<Args>` (from `owt`), so they can be declared in the props type for typed arguments:

```owt
import type { Snippet } from 'owt'
export component Table<T>(rows: T[], row: Snippet<{ item: T }>) { ... }
```

### Portal

`Portal` from `owt` renders its children elsewhere (default `document.body`):

```owt
import { Portal } from 'owt'
<Portal target="#modals"> <div class="modal">...</div> </Portal>
```

## Special elements

| Element | Purpose |
|---|---|
| `<window onResize={...} onKeyDown={...} />` | listen to `window` events for the component's lifetime |
| `<document onVisibilityChange={...} />` | listen to `document` events |
| `<body onClick={...} />` | listen to `document.body` events |
| `<head> <title>{title}</title> <meta .../> </head>` | reactive document title (restored on destroy) and extra head content |

## Styles

```owt
export component Card() {
  <div class="card"><h2>Title</h2></div>

  <style>
    .card { padding: 1rem; }
    .card h2 { margin: 0; }
    :global(body) { margin: 0; }
    .card :global(a) { color: inherit; }
  </style>
}
```

- Styles are **scoped**: selectors only match elements of this component (each element gets a class like `owt-1k2j3h`, the first compound selector gets `.owt-1k2j3h`, the next ones `:where(.owt-1k2j3h)` so specificity grows by one class only).
- `:global(...)` (or `:global` followed by a selector) opts out; `<style global>` makes the whole block global.
- Nesting (`&`), `@media`, `@supports`, `@container`, `@layer` are supported; `@keyframes` and `@font-face` are left untouched.
- With Vite, component CSS goes through the normal CSS pipeline (PostCSS, Tailwind, minification, extraction, HMR).

## Runtime API

Everything is exported from `owt`, except the built-in transitions (`owt/transition`).

| API | Description |
|---|---|
| `mount(Component, { target, props?, anchor?, context? })` | mount an app, returns `{ destroy() }` |
| `onMount(fn)` | run after the component is in the document; a returned function runs on destroy |
| `onDestroy(fn)` / `onCleanup(fn)` | run when the component / current scope is destroyed |
| `effect(fn)` | run after render and whenever what it reads changes; may return a cleanup |
| `watch(source, callback, { immediate? })` | run `callback(value, previous)` when `source()` changes |
| `state(value)` / `signal(value)` / `computed(fn)` | reactive values for plain TypeScript modules (`.value`) |
| `reactive(object)` / `toRaw` / `markRaw` / `isReactive` | deep reactivity for shared stores |
| `untrack(fn)` | read without subscribing |
| `batch(fn)` | apply several writes, then update the DOM once, synchronously |
| `tick()` / `flushSync()` | wait for / force pending DOM updates (updates are applied in a microtask) |
| `createContext<T>()`, `setContext(key, value)`, `getContext(key)` | values provided to descendants |
| `Portal` | render children elsewhere |
| `range(a, b)`, `rev(list)` | helpers behind `a..b` and `rev` |
| types | `Component<P>`, `Snippet<A>`, `LoopMeta`, `Action<E, P>`, `Transition<E, P>`, `TransitionConfig` |

Shared state is just TypeScript:

```ts
// store.ts
import { reactive } from 'owt'
export const cart = reactive({ items: [] as Item[], get total() { return this.items.length } })
```

Any component reading `cart.items` updates when it changes.

## TypeScript

- Everything is TypeScript: props, `var`/`val` annotations, generics, interfaces, enums, `satisfies`, `as`, non-null `!`.
- Types are erased by the compiler (no `tsc` step). `enum` is supported; constructor parameter properties, namespaces with values and `import x = require()` are not.
- Markup is type-checked by the editor tooling and `owt-tsc`: element attributes and event types (`event.currentTarget` is the element), component props (missing, unknown and mistyped props), narrowing inside `if`/`switch`/`match`, loop item types, slot argument types, binding targets (binding to a `val` is an error), exhaustive `match` blocks.

### Null safety

OWT is null-safe when the project uses `"strict": true`, or at least `"strictNullChecks": true` (the `owt-tsc` CLI and the editor warn when it is off):

- `null` and `undefined` are only allowed where the type says so. `user.name` on a `User | undefined` is an error until the value is narrowed: with `if (user)`, `if (val u = …)`, `match`, `?.` or `??`.
- A `var` without an initializer starts as `undefined`, so its type must accept it. `var el: HTMLElement` is an error; write `var el: HTMLElement | null = null` (typical for `ref={el}`) or `var name: string | undefined`.
- Optional props (`title?: string`) are `string | undefined` inside the component. Give them a default (`title = 'Untitled'`) to get a `string`.
- `bind:this` and `ref` set `null` when the element is destroyed, so their variables must accept `null`.
- `"noUncheckedIndexedAccess": true` is recommended: `items[0]` is then `T | undefined`, which `if (val first = items[0])` handles nicely.

## Tooling

| Package | Purpose |
|---|---|
| `owt` | runtime (≈7 KB gzipped for a typical app) |
| `@owt/vite` | Vite 7/8 plugin: compilation, scoped CSS modules, HMR that keeps state of unaffected components, error overlay with code frames |
| `@owt/compiler` | `compile(source, { filename, dev, hmr, css })` for other build tools |
| `@owt/language-server` | LSP server (diagnostics, completions, hover, go to definition, references, rename, symbols, folding, auto-closing tags, linked tag editing, CSS features in `<style>`) |
| `@owt/typescript-plugin` | lets `.ts` files import `.owt` components with full types |
| `owt-tsc` | `tsc` with `.owt` support for CI: `owt-tsc --noEmit` |
| VS Code extension | `packages/owt-vscode` |
| JetBrains plugin | `packages/owt-jetbrains` |

## Grammar

`TsExpression`, `TsStatement`, `TsType`, `TsPattern` and `TsParameters` follow the TypeScript grammar.

```ebnf
File            = { TsStatement | ComponentDecl | StyleBlock } ;
ComponentDecl   = [ "export" [ "default" ] ] "component" Identifier [ TypeParameters ]
                  "(" [ ComponentParams ] ")" "{" { BodyItem } "}" ;
ComponentParams = "props" [ ":" TsType ]                       (* whole props object *)
                | TsObjectPattern [ ":" TsType ]                (* destructured props *)
                | NamedParam { "," NamedParam } ;               (* named props *)
NamedParam      = [ "..." ] Name [ "?" ] [ ":" TsType ] [ "=" TsExpression ] ;

BodyItem        = VarDecl | ValDecl | TsStatement | Node | StyleBlock ;
VarDecl         = "var" Identifier [ ":" TsType ] [ "=" TsExpression ] { "," ... } [ ";" ] ;
ValDecl         = "val" Identifier [ ":" TsType ] "=" TsExpression { "," ... } [ ";" ] ;

Node            = Element | Text | ExpressionTag | Block | Comment ;
Element         = "<" TagName { Attribute } ( "/>" | ">" { Node | SlotDef } "</" TagName ">" ) ;
TagName         = Name { ( "." | "-" | ":" ) Name } ;
Attribute       = AttrName [ "=" ( String | Unquoted | "{" TsExpression "}" ) ]
                | "{" Identifier "}"
                | "{" "..." TsExpression "}" ;
AttrName        = [ ( "bind" | "class" | "style" | "use" | "on" | "transition" | "in" | "out" ) ":" ] Name ;
ExpressionTag   = "{" [ TsExpression ] "}" ;
Comment         = "<!--" ... "-->" ;

Block           = IfBlock | ForBlock | SwitchBlock | MatchBlock | AwaitBlock | TryBlock | KeyBlock ;
Body            = "{" [ ValDecl ] { Node } "}" ;
IfBlock         = "if" "(" Condition ")" Body { "else" "if" "(" Condition ")" Body } [ "else" Body ] ;
Condition       = TsExpression | "val" Identifier "=" TsExpression ;   (* null-safe binding *)
ForBlock        = "for" "(" TsPattern "of" [ "rev" ] Iterable [ "," Meta ] [ ";" "track" TsExpression ] ")" Body
                  [ "empty" Body ] ;
Iterable        = TsExpression | TsExpression ".." TsExpression ;
Meta            = Identifier | "{" MetaName { "," MetaName } "}" ;
SwitchBlock     = "switch" "(" TsExpression ")" "{" { Case } [ "default" Body ] "}" ;
Case            = "case" TsExpression { "," TsExpression } [ "if" "(" TsExpression ")" ] Body ;
MatchBlock      = "match" "(" TsExpression ")" "{" { MatchCase } [ "default" Body ] "}" ;
MatchCase       = "case" Pattern { "," Pattern } [ "if" "(" TsExpression ")" ] Body ;
Pattern         = "_" | Literal | TsExpression | "{" [ PatternProp { "," PatternProp } ] "}"
                | "[" [ Pattern { "," Pattern } ] [ "," "..." Identifier ] "]" ;
PatternProp     = Name [ ":" ( Pattern | Identifier ) ] ;
AwaitBlock      = "await" "(" TsExpression ")" [ Body ] [ "then" [ "(" TsPattern ")" ] Body ]
                  [ "catch" [ "(" TsPattern ")" ] Body ] ;
TryBlock        = "try" Body "catch" [ "(" TsPattern [ "," Identifier ] ")" ] Body ;
KeyBlock        = "key" "(" TsExpression ")" Body ;
SlotDef         = "slot" Identifier [ "(" TsPattern ")" ] Body ;    (* inside component elements *)

StyleBlock      = "<style" [ "global" ] [ "lang" "=" String ] ">" CSS "</style>" ;
```

Blocks and `slot` definitions are recognized at the start of a line (or right after a tag): text like `Click if (needed)` in the middle of a sentence stays text.

## Migrating from 0.x

- The runtime is new: components return DOM nodes and update through signals. `mount(App, { target, props })` works as before (`owt/dom` still exports it) and returns `{ destroy() }`.
- `for (item of list, meta)` and `{ index, first, last, even, odd }` destructuring are unchanged; add `; track item.id` for lists whose items are replaced by new objects.
- Event handlers, `if`/`else`, ranges and `rev` are unchanged. Inline assignments in handlers (`onClick={count = 0}`) are still supported.
- Named props with defaults (`component Icon(class: string = "w-4")`) now apply the default.
- `<style>` blocks are now scoped and emitted; `<slot>` and slot content now work.
- Text directly at the top level of a component body is no longer allowed (wrap it in an element); this keeps TypeScript statements unambiguous.
