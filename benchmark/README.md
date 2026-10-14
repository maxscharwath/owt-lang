# OWT benchmark

A [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark) (keyed suite)
style comparison of **OWT** against **Vue 3.5**, **React 19** and a hand-written **vanilla JS**
baseline. Every app renders the same table of rows with the same buttons, is built with Vite in
production mode, and is driven by Playwright/Chromium. Every timed click is checked against a
reference model.

```sh
# from the repo root: build all apps, then run every benchmark (~7 min on 4 cores)
pnpm bench                                   # same as: pnpm --filter owt-benchmark bench

# from benchmark/
node scripts/run.mjs --only vue,react --ops run,update --runs 5
node scripts/run.mjs --skip-build            # reuse benchmark/dist
node scripts/run.mjs --help
pnpm build                                   # node scripts/build.mjs [app...]: build into dist/<app>/
pnpm serve                                   # node scripts/serve.mjs [port]: open http://127.0.0.1:8080/vue/
```

Results are printed as Markdown and written to `results/latest.md` and `results/latest.json`
(every sample, the stats, the machine, the browser and the package versions).

## Layout

| Path | What |
| :--- | :--- |
| `apps/vanilla/` | Hand-written keyed baseline: the row `<tr>` is cloned from a prototype, clicks are delegated on `<tbody>`, each operation touches only the nodes it must. |
| `apps/vue/` | `<script setup>` SFC mirroring `frameworks/keyed/vue`: rows in a `shallowRef` (replaced by a copy on structural changes), one `ref` per label, `v-for` with `:key="row.id"`. No `v-memo`. |
| `apps/react/` | Mirrors `frameworks/keyed/react-hooks`: one `useReducer` holding `{ data, selected }`, `memo` rows, `key={item.id}`, `createRoot`. |
| `apps/owt/` | `App.owt` (a `var rows` array mutated in place, a `for (row of rows)` loop, `class:danger`), mounted with `mount(App, { target })` from `owt`; `vite.config.ts` uses `@owt/vite`. |
| `shared/data.ts` | The standard adjectives/colours/nouns label generator, with a seeded PRNG (mulberry32) in place of `Math.random()`, so every framework renders exactly the same rows. Ids and PRNG state restart on every page load. |
| `shared/style.css` | A minimal Bootstrap-3-like stylesheet covering only the benchmark classes. Inlined into each `index.html` by `shared/vite.ts`, so there are no network fetches and the CSS is not counted in the JS bundle size. |
| `shared/vite.ts` | Shared Vite settings: output in `dist/<app>/`, `base: './'`, no modulepreload polyfill, CSS inlining, empty favicon. |
| `scripts/build.mjs` | Builds each app with Vite's JS API (`root` = the app, its own `vite.config.ts`, production mode). A failing build is logged and recorded in `dist/build-status.json`, and the other apps still build. |
| `scripts/serve.mjs` | Dependency-free static server for `dist/`. |
| `scripts/run.mjs` | The runner (see below). |

Every app produces the standard DOM: `#main > .container` holds a `.jumbotron` with the buttons
`#run`, `#runlots`, `#add`, `#update`, `#clear` and `#swaprows`, then
`table.table.table-hover.table-striped.test-data > tbody#tbody`. Each row has this markup:

```html
<tr class="danger?">
  <td class="col-md-1">{id}</td>
  <td class="col-md-4"><a>{label}</a></td>
  <td class="col-md-1"><a><span class="remove glyphicon glyphicon-remove" aria-hidden="true"></span></a></td>
  <td class="col-md-6"></td>
</tr>
```

## Benchmarks

Each iteration opens a **fresh page** in a new browser context, runs the un-measured setup steps,
forces a GC, and then times **one** click. The setup steps follow js-framework-benchmark.
`--warmup` sets W (default 5).

| id | Benchmark | Setup (not measured) | Measured click | CPU throttling |
| :--- | :--- | :--- | :--- | :---: |
| `run` | create rows | W x (create 1,000, clear) | `#run`: create 1,000 rows | - |
| `replace` | replace all rows | W x create 1,000 | `#run`: replace all 1,000 rows | - |
| `update` | partial update | create 1,000, W x update | `#update`: append `' !!!'` to every 10th label | 4x |
| `select` | select row | create 1,000, W x select (rows 5..) | click the label of row 2 | 4x |
| `swap` | swap rows | create 1,000, W x swap | `#swaprows`: swap rows 2 and 999 | 4x |
| `remove` | remove row | create 1,000, remove rows W+4 .. 5 | click the remove icon of row 4 | 4x |
| `runlots` | create many rows | W x (create 1,000, clear) | `#runlots`: create 10,000 rows | - |
| `add` | append rows to large table | W x (create 1,000, clear), create 1,000 | `#add`: append 1,000 rows | - |
| `clear` | clear rows | W x (create 1,000, clear), create 1,000 | `#clear`: remove all 1,000 rows | - |

Each benchmark uses 10 measured iterations by default and 5 for `runlots`
(`--runs N` sets N, with `ceil(N/2)` for `runlots`; `--runs-lots M` sets the second number).
Before those, each framework gets one more full iteration (fresh page, setup, measured click)
that is verified but discarded. The frameworks are measured **round-robin**: iteration *i* of
every framework runs before iteration *i + 1* of any of them, so background noise and thermal
drift spread evenly. Each benchmark launches a new browser.

### Timing

The duration is measured inside the page, as close as possible to what js-framework-benchmark
reads from Chrome traces ("click to paint"):

```js
const start = performance.now();
element.click();                       // synchronous event handlers run here
await rAF(); await rAF(); await setTimeout(0);
duration = performance.now() - start;  // includes microtasks, script, style, layout, paint of the next frame
```

- The click is dispatched with `element.click()` from `page.evaluate`, so Playwright's
  input-pipeline latency is not part of the sample.
- Microtask-scheduled work (Vue's scheduler, React's sync lane) and rAF-batched work both land
  before the frame. The first frame's style, layout and paint finish before the second rAF.
- Chromium runs with `--disable-frame-rate-limit --disable-gpu-vsync`. Otherwise every
  `requestAnimationFrame` waits for the next 60 Hz vsync tick, which adds 0-16 ms of random
  quantization to every sample. With the flags, the end mark lands within about 1 ms of the first
  painted frame (checked by recording `setTimeout(0)` after the first rAF, see `JS` below).
- CPU throttling uses CDP `Emulation.setCPUThrottlingRate` (`--throttle`, default 4). It is
  switched on just before the measured click and off right after it, so setup and verification
  run at full speed.
- `HeapProfiler.collectGarbage` runs right before the measured click, so the sample does not
  pay for garbage from the setup steps.
- The details table also reports **JS**: the median time from the click to the first
  `requestAnimationFrame` callback. That is the framework's own work (handler, scheduling,
  reconciliation, DOM calls) before the browser starts style, layout and paint. Rendering often
  dominates the total, so this column shows the differences between frameworks more clearly.

### Correctness (fails loudly)

The runner keeps a **reference model** in Node: the same `createDataGenerator()` from
`shared/data.ts`, the same seed, and the same sequence of actions. After **every** click, both
setup and measured, it reads the whole `#tbody` and compares it with the model: row count, the
id and label of every row, and the `danger` class on exactly the selected row. So "update" must
change exactly every 10th label, "swap" must exchange ids 2 and 999, "remove" must drop exactly
row 4, and so on. A page error or a `console.error` also fails the run.

Before timing anything, a **preflight** runs on every app. It checks the button ids, the table
classes, the four cells of a row, the `<a>` around the label and the
`span.remove.glyphicon.glyphicon-remove`. It also runs select, update, swap, remove, add, replace
and clear once. A **keyed check** tags every `<tr>` with the id it shows. A framework that patches
rows in place instead of moving or recreating them (swap, replace) is reported as **not keyed**
in the output, but it is still measured.

A failure prints `!!! <app> FAILED ...`, appears as `FAILED` in the tables and in the
`failures` array of `latest.json`, and makes the process exit with status 1. The other apps still
finish.

### Memory

For `--mem-runs` fresh pages (default 3), the runner calls CDP `HeapProfiler.collectGarbage`
twice and then reads `Runtime.getHeapUsage().usedSize` at two points: when the page is ready, and
after creating 1,000 rows. It reports the median. `performance.memory` is not used because it is
coarse and unavailable without flags in headless mode.

### Bundle size

Bundle size is the sum of all `.js` files in `dist/<app>/`, raw and gzip at level 9 (Node `zlib`).
The CSS is identical for every app, is inlined in the HTML, and is not counted.

### Statistics

For each benchmark and framework the runner reports the median, the mean, the sample standard
deviation (n-1), the minimum and the maximum. The **slowdown** of a framework is its median
divided by the fastest median for that benchmark. The last row is the **geometric mean of the
slowdowns** across benchmarks, as in js-framework-benchmark. This runner uses medians where
js-framework-benchmark uses means, because medians hold up better with 5-10 samples.

### Differences from js-framework-benchmark

- The timing is taken in the page, not from a Chrome performance trace. It covers the same
  span, from the start of the event to the paint of the next frame, without trace overhead.
  Rasterization and compositing on other threads are not included, and they are not included
  in js-framework-benchmark's paint end either.
- The stylesheet is a small Bootstrap-like subset, not full Bootstrap 3, so style recalculation
  is somewhat cheaper for everyone.
- CPU throttling is 4x for update, select, swap and remove. js-framework-benchmark uses 2x for
  remove and also throttles some other benchmarks. Change the rate with `--throttle`.
- The labels come from a seeded PRNG, and the runner verifies the complete table after every
  step.
- Chromium runs headless. Absolute numbers depend on the machine; only the ratios carry over.

## Browser

The runner uses Playwright's own Chromium when it is installed. Otherwise it uses the newest
full `chromium-*/chrome-linux/chrome` under `$PLAYWRIGHT_BROWSERS_PATH`, run in new headless
mode, and falls back to `chromium_headless_shell-*` only when no full build exists. Override the
choice with `--chrome <path>` or `CHROME_PATH`.

## OWT requirements

The OWT app is loaded through `@owt/vite`, whose `package.json` points at `dist/index.mjs`.
Build the plugin and its compiler first: `pnpm --filter "@owt/vite..." build`, or the root
`pnpm build`. The `owt` runtime is consumed from `packages/owt/src` and needs no build. If the
plugin is not built, or the compiler rejects `App.owt`, the runner **skips OWT** with the reason,
for example:

```
>>> SKIPPING owt: build failed: [plugin externalize-deps] | Error: Failed to resolve entry for package "@owt/vite". ...
```

The other apps are still measured. To debug OWT on its own:

1. Run `node scripts/build.mjs owt`, then `pnpm serve` and open `/owt/`.
2. Run `node scripts/run.mjs --only owt,vanilla --runs 3`. The preflight and the per-step
   verification say which feature misbehaves. `App.owt` relies on:
   - `import { buildData, type Row } from '../../../shared/data'` (an inline `type` specifier) in an `.owt` file;
   - `var rows: Row[]` deep reactivity for in-place mutation: `rows.push(...)`, `rows.splice(i, 1)`,
     `rows[1] = rows[998]` index assignment, and nested `rows[i]!.label += ' !!!'`;
   - reassignment (`rows = buildData(1000)`) and `var selected` used in `class:danger={selected === row.id}`;
   - a **keyed** `for (row of rows)` loop, by item identity, that moves DOM nodes on swap and
     creates new ones on replace. The keyed check reports a non-keyed loop;
   - `onClick={run}` and inline `onClick={() => selected = row.id}` handlers on elements;
   - `mount(App, { target })` exported from `owt`.

`apps/owt/src/env.d.ts` declares `*.owt` modules for TypeScript. `tsconfig.json` type-checks
every app's sources and Vite config (`tsc -p benchmark`). Vue SFC templates are not checked.
