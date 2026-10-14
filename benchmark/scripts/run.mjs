#!/usr/bin/env node
// js-framework-benchmark style runner for OWT vs Vue vs React vs vanilla JS.
//
//   node scripts/run.mjs [--runs 10] [--runs-lots 5] [--warmup 5] [--only vue,react]
//                        [--ops run,update] [--throttle 4] [--mem-runs 3]
//                        [--skip-build] [--chrome /path/to/chrome]
//
// See ../README.md for the methodology.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { cpus, totalmem } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { gzipSync } from 'node:zlib';
import { chromium } from 'playwright';
import { createDataGenerator } from '../shared/data.ts';
import { ALL_APPS, BENCH_DIR, BUILD_STATUS_FILE, DIST_DIR, buildApps, summarizeError } from './build.mjs';
import { startServer } from './serve.mjs';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const HELP = `Usage: node scripts/run.mjs [options]

  --runs <n>        measured iterations per benchmark (default 10)
  --runs-lots <n>   measured iterations for 10k-row benchmarks (default: ceil(runs / 2) = 5)
  --warmup <n>      in-page warmup steps before each measurement (default 5, like js-framework-benchmark)
  --only <list>     apps to run, comma separated (default: ${ALL_APPS.join(',')})
  --ops <list>      benchmarks to run, comma separated (default: all; see below)
  --throttle <n>    CPU slowdown applied to update/select/swap/remove (default 4, 1 = off)
  --mem-runs <n>    page loads for the memory benchmark (default 3, 0 = skip)
  --skip-build      reuse benchmark/dist instead of rebuilding
  --chrome <path>   Chromium/Chrome executable (default: Playwright's, else newest in $PLAYWRIGHT_BROWSERS_PATH)
  -h, --help        show this help
`;

const { values: args } = parseArgs({
  options: {
    runs: { type: 'string', default: '10' },
    'runs-lots': { type: 'string' },
    warmup: { type: 'string', default: '5' },
    only: { type: 'string' },
    ops: { type: 'string' },
    throttle: { type: 'string', default: '4' },
    'mem-runs': { type: 'string', default: '3' },
    'skip-build': { type: 'boolean', default: false },
    chrome: { type: 'string' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (args.help) {
  console.log(HELP + `\nBenchmarks: ${opsHelp()}`);
  process.exit(0);
}

function intArg(name, min) {
  const value = Number(args[name]);
  if (!Number.isInteger(value) || value < min) {
    console.error(`--${name} must be an integer >= ${min} (got ${args[name]})`);
    process.exit(2);
  }
  return value;
}

const RUNS = intArg('runs', 1);
const RUNS_LOTS = args['runs-lots'] === undefined ? Math.max(1, Math.ceil(RUNS / 2)) : intArg('runs-lots', 1);
const WARMUP = intArg('warmup', 0);
const MEM_RUNS = intArg('mem-runs', 0);
const THROTTLE = Number(args.throttle);
if (!(THROTTLE >= 1)) {
  console.error(`--throttle must be a number >= 1 (got ${args.throttle})`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Benchmarks (same setup steps as js-framework-benchmark's keyed suite)
// ---------------------------------------------------------------------------

const sel = {
  label: (n) => `#tbody > tr:nth-of-type(${n}) > td:nth-of-type(2) > a`,
  remove: (n) => `#tbody > tr:nth-of-type(${n}) > td:nth-of-type(3) > a > span`,
};

/** Clicks + model updates shared by the benchmark definitions. */
const act = {
  run: (s) => s.click('#run', (m) => m.run(1000)),
  runLots: (s) => s.click('#runlots', (m) => m.run(10000)),
  add: (s) => s.click('#add', (m) => m.add(1000)),
  update: (s) => s.click('#update', (m) => m.update()),
  clear: (s) => s.click('#clear', (m) => m.clear()),
  swap: (s) => s.click('#swaprows', (m) => m.swap()),
  select: (s, n) => s.click(sel.label(n), (m) => m.select(n - 1)),
  remove: (s, n) => s.click(sel.remove(n), (m) => m.remove(n - 1)),
};

async function warmCreateClear(s) {
  for (let i = 0; i < WARMUP; i++) {
    await act.run(s);
    await act.clear(s);
  }
}

/**
 * init: un-measured setup steps (fresh page each iteration).
 * measure: the single measured click.
 */
const OPS = [
  {
    id: 'run',
    name: 'create rows',
    desc: 'creating 1,000 rows',
    init: warmCreateClear,
    measure: act.run,
  },
  {
    id: 'replace',
    name: 'replace all rows',
    desc: 'replacing all 1,000 rows',
    async init(s) {
      for (let i = 0; i < WARMUP; i++) await act.run(s);
      if (WARMUP === 0) await act.run(s);
    },
    measure: act.run,
  },
  {
    id: 'update',
    name: 'partial update',
    desc: 'updating every 10th row of 1,000 rows',
    throttle: true,
    async init(s) {
      await act.run(s);
      for (let i = 0; i < WARMUP; i++) await act.update(s);
    },
    measure: act.update,
  },
  {
    id: 'select',
    name: 'select row',
    desc: 'highlighting a selected row',
    throttle: true,
    async init(s) {
      await act.run(s);
      for (let i = 0; i < WARMUP; i++) await act.select(s, i + 5);
    },
    measure: (s) => act.select(s, 2),
  },
  {
    id: 'swap',
    name: 'swap rows',
    desc: 'swapping 2 rows of a 1,000-row table',
    throttle: true,
    async init(s) {
      await act.run(s);
      for (let i = 0; i < WARMUP; i++) await act.swap(s);
    },
    measure: act.swap,
  },
  {
    id: 'remove',
    name: 'remove row',
    desc: 'removing one row',
    throttle: true,
    async init(s) {
      await act.run(s);
      // Remove rows 9, 8, 7, 6, 5 (for 5 warmups), then the measured click removes row 4.
      for (let i = 0; i < WARMUP; i++) await act.remove(s, WARMUP - i + 4);
    },
    measure: (s) => act.remove(s, 4),
  },
  {
    id: 'runlots',
    name: 'create many rows',
    desc: 'creating 10,000 rows',
    lots: true,
    init: warmCreateClear,
    measure: act.runLots,
  },
  {
    id: 'add',
    name: 'append rows to large table',
    desc: 'appending 1,000 rows to a table of 1,000 rows',
    async init(s) {
      await warmCreateClear(s);
      await act.run(s);
    },
    measure: act.add,
  },
  {
    id: 'clear',
    name: 'clear rows',
    desc: 'clearing a table with 1,000 rows',
    async init(s) {
      await warmCreateClear(s);
      await act.run(s);
    },
    measure: act.clear,
  },
];

function opsHelp() {
  return OPS.map((op) => `${op.id} (${op.desc})`).join(', ');
}

function parseList(value, known, label) {
  if (!value) return known;
  const list = value.split(',').map((v) => v.trim()).filter(Boolean);
  const unknown = list.filter((v) => !known.includes(v));
  if (unknown.length) {
    console.error(`Unknown ${label}: ${unknown.join(', ')}. Known: ${known.join(', ')}`);
    process.exit(2);
  }
  return known.filter((v) => list.includes(v));
}

const requestedApps = parseList(args.only, ALL_APPS, 'app(s)');
const selectedOps = OPS.filter((op) => parseList(args.ops, OPS.map((o) => o.id), 'op(s)').includes(op.id));

// ---------------------------------------------------------------------------
// Reference model: replays the same actions in Node to verify the DOM
// ---------------------------------------------------------------------------

class Model {
  constructor() {
    this.buildData = createDataGenerator();
    this.rows = [];
    this.selected = 0;
  }
  run(count) {
    this.rows = this.buildData(count);
    this.selected = 0;
  }
  add(count) {
    this.rows = this.rows.concat(this.buildData(count));
  }
  update() {
    for (let i = 0; i < this.rows.length; i += 10) {
      this.rows[i] = { ...this.rows[i], label: this.rows[i].label + ' !!!' };
    }
  }
  clear() {
    this.rows = [];
    this.selected = 0;
  }
  swap() {
    if (this.rows.length > 998) {
      const a = this.rows[1];
      this.rows[1] = this.rows[998];
      this.rows[998] = a;
    }
  }
  select(index) {
    this.selected = this.rows[index].id;
  }
  remove(index) {
    this.rows.splice(index, 1);
  }
}

class VerificationError extends Error {}

/** Reads the rendered table: ids, labels and which rows carry the `danger` class. */
function readTable(page) {
  return page.evaluate(() => {
    const tbody = document.getElementById('tbody');
    if (!tbody) return null;
    const ids = [];
    const labels = [];
    const danger = [];
    const foreign = [];
    const trs = tbody.children;
    for (let i = 0; i < trs.length; i++) {
      const tr = trs[i];
      if (tr.tagName !== 'TR') {
        foreign.push(`${i + 1}:${tr.tagName}`);
        continue;
      }
      ids.push((tr.children[0]?.textContent ?? '').trim());
      labels.push((tr.children[1]?.textContent ?? '').trim());
      if (tr.classList.contains('danger')) danger.push(ids.length - 1);
    }
    return { ids, labels, danger, foreign };
  });
}

async function verifyTable(page, model, context) {
  const table = await readTable(page);
  const fail = (msg) => {
    throw new VerificationError(`${context}: ${msg}`);
  };
  if (!table) fail('no <tbody id="tbody"> in the page');
  if (table.foreign.length) fail(`unexpected non-<tr> children in tbody: ${table.foreign.slice(0, 5).join(', ')}`);
  const expected = model.rows;
  if (table.ids.length !== expected.length) fail(`expected ${expected.length} rows, found ${table.ids.length}`);
  for (let i = 0; i < expected.length; i++) {
    if (table.ids[i] !== String(expected[i].id)) {
      fail(`row ${i + 1}: expected id ${expected[i].id}, found "${table.ids[i]}"`);
    }
    if (table.labels[i] !== expected[i].label) {
      fail(`row ${i + 1} (id ${expected[i].id}): expected label "${expected[i].label}", found "${table.labels[i]}"`);
    }
  }
  const selectedIndex = expected.findIndex((r) => r.id === model.selected);
  const expectedDanger = selectedIndex >= 0 ? [selectedIndex] : [];
  if (table.danger.join() !== expectedDanger.join()) {
    const show = (list) => (list.length ? list.map((i) => `row ${i + 1}`).join(', ') : 'none');
    fail(`expected class "danger" on ${show(expectedDanger)}, found it on ${show(table.danger)}`);
  }
}

/** Checks the markup of the first row and the presence of the buttons. */
async function verifyMarkup(page, context) {
  const problems = await page.evaluate(() => {
    const out = [];
    for (const id of ['run', 'runlots', 'add', 'update', 'clear', 'swaprows']) {
      if (!document.querySelector(`button#${id}`)) out.push(`missing button#${id}`);
    }
    const table = document.querySelector('table.table.table-hover.table-striped.test-data > tbody#tbody');
    if (!table) out.push('missing table.table.table-hover.table-striped.test-data > tbody#tbody');
    const tr = document.querySelector('#tbody > tr');
    if (!tr) return out.concat('no rows rendered');
    const tds = Array.from(tr.children);
    const classes = tds.map((td) => `${td.tagName.toLowerCase()}.${td.className}`).join(' ');
    if (classes !== 'td.col-md-1 td.col-md-4 td.col-md-1 td.col-md-6') out.push(`unexpected row cells: ${classes}`);
    if (!tr.querySelector(':scope > td:nth-child(2) > a')) out.push('label is not wrapped in <a>');
    if (!tr.querySelector(':scope > td:nth-child(3) > a > span.remove.glyphicon.glyphicon-remove[aria-hidden="true"]')) {
      out.push('missing remove link <a><span class="remove glyphicon glyphicon-remove" aria-hidden="true">');
    }
    if (tds[3] && tds[3].childNodes.length && tds[3].textContent.trim()) out.push('last cell is not empty');
    return out;
  });
  if (problems.length) throw new VerificationError(`${context}: ${problems.join('; ')}`);
}

/**
 * Keyed check (like js-framework-benchmark's isKeyed test): every <tr> is tagged with the id
 * it displays; on the next check a tagged <tr> must still display that id. A framework that
 * patches rows in place (swap, replace) instead of moving / recreating them is non-keyed.
 */
function checkKeyed(page) {
  return page.evaluate(() => {
    const problems = [];
    const trs = document.getElementById('tbody')?.children ?? [];
    for (let i = 0; i < trs.length; i++) {
      const tr = trs[i];
      const id = (tr.children[0]?.textContent ?? '').trim();
      if (tr.__benchId !== undefined && tr.__benchId !== id && problems.length < 3) {
        problems.push(`row ${i + 1} (id ${id}) reuses the <tr> that displayed id ${tr.__benchId}`);
      }
      tr.__benchId = id;
    }
    return problems;
  });
}

// ---------------------------------------------------------------------------
// Browser plumbing
// ---------------------------------------------------------------------------

const CHROME_FLAGS = [
  // Let requestAnimationFrame run as soon as a frame is needed instead of waiting for
  // the next 60 Hz vsync tick: removes 0-16 ms of quantization noise from every sample.
  '--disable-frame-rate-limit',
  '--disable-gpu-vsync',
  '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--no-first-run',
];

function resolveChrome() {
  if (args.chrome) return args.chrome;
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  try {
    const bundled = chromium.executablePath();
    if (bundled && existsSync(bundled)) return undefined; // Playwright's own browser is installed.
  } catch {
    // fall through
  }
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!base || !existsSync(base)) return undefined;
  const candidates = [];
  for (const dir of readdirSync(base)) {
    const m = /^chromium(_headless_shell)?-(\d+)$/.exec(dir);
    if (!m) continue;
    const rev = Number(m[2]);
    const full = ['chrome-linux/chrome', 'chrome-linux64/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-win/chrome.exe'];
    const shell = ['chrome-linux/headless_shell', 'chrome-headless-shell-linux64/chrome-headless-shell'];
    // Prefer the full browser (new headless mode) over the old headless shell.
    for (const rel of m[1] ? shell : full) {
      const p = join(base, dir, rel);
      if (existsSync(p)) candidates.push({ p, rank: rev * 2 + (m[1] ? 0 : 1) });
    }
  }
  candidates.sort((a, b) => b.rank - a.rank);
  return candidates[0]?.p;
}

async function launchBrowser(executablePath) {
  return chromium.launch({ headless: true, executablePath, args: CHROME_FLAGS });
}

/** Clicks `selector` inside the page and waits for rAF -> rAF -> setTimeout(0). */
function timedClick(page, selector) {
  return page.evaluate(async (s) => {
    const el = document.querySelector(s);
    if (!el) throw new Error(`element not found: ${s}`);
    let beforeFrame = 0;
    const start = performance.now();
    el.click();
    await new Promise((resolve) => {
      requestAnimationFrame(() => {
        beforeFrame = performance.now() - start;
        requestAnimationFrame(() => setTimeout(resolve, 0));
      });
    });
    return { total: performance.now() - start, beforeFrame };
  }, selector);
}

function nextFrames(page) {
  return page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 0)))),
  );
}

/** One fresh page (own browser context) for one framework. */
class Session {
  constructor(app, page, cdp, context) {
    this.app = app;
    this.page = page;
    this.cdp = cdp;
    this.context = context;
    this.model = new Model();
    this.errors = [];
    this.steps = 0;
    page.on('pageerror', (err) => this.errors.push(`page error: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') this.errors.push(`console.error: ${msg.text()}`);
    });
  }

  static async open(browser, baseUrl, app) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const session = new Session(app, page, cdp, context);
    await page.goto(`${baseUrl}/${app}/`, { waitUntil: 'load' });
    try {
      await page.waitForSelector('#run', { timeout: 10_000 });
    } catch {
      session.assertNoErrors('page load');
      throw new VerificationError(`${app}: button#run did not appear within 10s after load`);
    }
    await nextFrames(page);
    session.assertNoErrors('page load');
    return session;
  }

  assertNoErrors(context) {
    if (this.errors.length) throw new VerificationError(`${this.app} ${context}: ${this.errors.join(' | ')}`);
  }

  /** Un-measured or measured click; always verifies the DOM against the model afterwards. */
  async click(selector, apply) {
    // CPU throttling (if requested for the measured click) only wraps the click itself,
    // not the verification that follows.
    const rate = this.throttleNextClick ?? 1;
    this.throttleNextClick = 1;
    if (rate > 1) await this.throttle(rate);
    let timing;
    try {
      timing = await timedClick(this.page, selector);
    } finally {
      if (rate > 1) await this.throttle(1);
    }
    apply(this.model);
    this.steps++;
    const context = `${this.app}, step ${this.steps} (click ${selector})`;
    this.assertNoErrors(context);
    await verifyTable(this.page, this.model, context);
    return timing;
  }

  async gc() {
    await this.cdp.send('HeapProfiler.collectGarbage');
  }

  async heapUsedMB() {
    await this.gc();
    await this.gc();
    const { usedSize } = await this.cdp.send('Runtime.getHeapUsage');
    return usedSize / 1024 / 1024;
  }

  async throttle(rate) {
    await this.cdp.send('Emulation.setCPUThrottlingRate', { rate });
  }

  async close() {
    await this.context.close();
  }
}

// ---------------------------------------------------------------------------
// Stats + formatting
// ---------------------------------------------------------------------------

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const variance = n > 1 ? sorted.reduce((acc, x) => acc + (x - mean) ** 2, 0) / (n - 1) : 0;
  return { n, median, mean, stddev: Math.sqrt(variance), min: sorted[0], max: sorted[n - 1] };
}

const fmt = (x, digits = 1) => (x === undefined || x === null || Number.isNaN(x) ? '-' : x.toFixed(digits));
const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;

function geomean(values) {
  return Math.exp(values.reduce((acc, v) => acc + Math.log(v), 0) / values.length);
}

// ---------------------------------------------------------------------------
// Bundle size
// ---------------------------------------------------------------------------

function listFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out;
}

function bundleSize(app) {
  const files = listFiles(join(DIST_DIR, app)).filter((f) => /\.m?js$/.test(f));
  let raw = 0;
  let gzip = 0;
  for (const f of files) {
    const buf = readFileSync(f);
    raw += buf.length;
    gzip += gzipSync(buf, { level: 9 }).length;
  }
  return { files: files.map((f) => f.slice(DIST_DIR.length + 1)), raw, gzip };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const startedAt = new Date();
  const skipped = {};
  const failures = [];

  // 1. Build (or reuse) the apps; skip whatever failed to build.
  let buildStatus = {};
  if (args['skip-build']) {
    try {
      buildStatus = JSON.parse(readFileSync(BUILD_STATUS_FILE, 'utf8'));
    } catch {
      buildStatus = {};
    }
  } else {
    console.log(`Building ${requestedApps.join(', ')} with Vite...`);
    buildStatus = await buildApps(requestedApps);
  }
  const apps = [];
  for (const app of requestedApps) {
    const status = buildStatus[app];
    if (status && !status.ok) {
      skipped[app] = `build failed: ${summarizeError(status.error)}`;
    } else if (!existsSync(join(DIST_DIR, app, 'index.html'))) {
      skipped[app] = `no build output in dist/${app} (run without --skip-build)`;
    } else {
      apps.push(app);
    }
  }
  for (const [app, reason] of Object.entries(skipped)) {
    console.log(`\n>>> SKIPPING ${app}: ${reason}\n`);
  }
  if (!apps.length) {
    console.error('Nothing to benchmark: no app built successfully.');
    process.exit(1);
  }

  const executablePath = resolveChrome();
  const server = await startServer(DIST_DIR, 0);
  const probe = await launchBrowser(executablePath);
  const browserVersion = probe.version();
  await probe.close();
  console.log(`Chromium ${browserVersion}${executablePath ? ` (${executablePath})` : ''}`);
  console.log(
    `Runs: ${RUNS} (${RUNS_LOTS} for 10k rows) + 1 discarded warmup iteration, ${WARMUP} warmup steps per iteration, ` +
      `CPU throttling ${THROTTLE}x for ${OPS.filter((o) => o.throttle).map((o) => o.id).join('/')}`,
  );

  // 2. Preflight: every app must render the standard markup and create correct rows.
  const browser = await launchBrowser(executablePath);
  const active = [];
  const nonKeyed = {};
  for (const app of apps) {
    let session;
    try {
      session = await Session.open(browser, server.url, app);
      await act.run(session);
      await verifyMarkup(session.page, `${app} preflight`);
      await checkKeyed(session.page);
      const keyedProblems = [];
      const steps = [
        ['select', (s) => act.select(s, 3)],
        ['update', act.update],
        ['swap', act.swap],
        ['remove', (s) => act.remove(s, 1)],
        ['add', act.add],
        ['replace', act.run],
      ];
      for (const [name, step] of steps) {
        await step(session);
        for (const problem of await checkKeyed(session.page)) keyedProblems.push(`after ${name}: ${problem}`);
      }
      await act.clear(session);
      if (keyedProblems.length) {
        nonKeyed[app] = keyedProblems.slice(0, 3).join('; ');
        console.error(`\n!!! WARNING: ${app} is NOT keyed (DOM rows are reused for other data):\n    ${nonKeyed[app]}\n`);
      }
      active.push(app);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failures.push({ app, op: 'preflight', message });
      console.error(`\n!!! ${app} FAILED PREFLIGHT, excluded from the benchmark:\n    ${message}\n`);
    } finally {
      await session?.close();
    }
  }
  await browser.close();
  if (!active.length) {
    await server.close();
    console.error('Nothing to benchmark: every app failed the preflight.');
    process.exit(1);
  }

  // 3. Timed benchmarks: round-robin over apps for every iteration to spread noise evenly.
  const results = {};
  for (const op of selectedOps) {
    const runs = op.lots ? RUNS_LOTS : RUNS;
    const rate = op.throttle ? THROTTLE : 1;
    results[op.id] = {};
    const samples = Object.fromEntries(active.map((app) => [app, []]));
    const broken = new Set();
    process.stdout.write(`${op.id.padEnd(8)} ${op.desc}${rate > 1 ? ` (${rate}x CPU slowdown)` : ''}: `);
    const opBrowser = await launchBrowser(executablePath);
    for (let iteration = -1; iteration < runs; iteration++) {
      for (const app of active) {
        if (broken.has(app)) continue;
        let session;
        try {
          session = await Session.open(opBrowser, server.url, app);
          await op.init(session);
          await session.gc();
          session.throttleNextClick = rate;
          const timing = await op.measure(session);
          if (iteration >= 0) samples[app].push(timing);
        } catch (err) {
          broken.add(app);
          const message = err instanceof Error ? err.message : String(err);
          failures.push({ app, op: op.id, message });
          console.error(`\n!!! ${app} FAILED "${op.id}": ${message}`);
        } finally {
          await session?.close();
        }
      }
      process.stdout.write('.');
    }
    await opBrowser.close();
    process.stdout.write('\n');
    for (const app of active) {
      if (broken.has(app) || !samples[app].length) continue;
      const totals = samples[app].map((s) => s.total);
      results[op.id][app] = {
        ...stats(totals),
        beforeFrameMedian: stats(samples[app].map((s) => s.beforeFrame)).median,
        samples: totals.map((x) => Number(x.toFixed(2))),
      };
    }
    const fastest = Math.min(...Object.values(results[op.id]).map((r) => r.median));
    for (const r of Object.values(results[op.id])) r.factor = r.median / fastest;
    console.log(
      '         ' +
        active
          .filter((app) => results[op.id][app])
          .map((app) => `${app} ${fmt(results[op.id][app].median)} ms`)
          .join(', '),
    );
  }

  // 4. Memory: JS heap after GC once the page is ready and after creating 1,000 rows.
  const memory = {};
  if (MEM_RUNS > 0) {
    process.stdout.write('memory   ');
    const memBrowser = await launchBrowser(executablePath);
    const ready = Object.fromEntries(active.map((app) => [app, []]));
    const run1k = Object.fromEntries(active.map((app) => [app, []]));
    for (let i = 0; i < MEM_RUNS; i++) {
      for (const app of active) {
        let session;
        try {
          session = await Session.open(memBrowser, server.url, app);
          ready[app].push(await session.heapUsedMB());
          await act.run(session);
          run1k[app].push(await session.heapUsedMB());
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          failures.push({ app, op: 'memory', message });
          console.error(`\n!!! ${app} FAILED "memory": ${message}`);
        } finally {
          await session?.close();
        }
      }
      process.stdout.write('.');
    }
    await memBrowser.close();
    process.stdout.write('\n');
    for (const app of active) {
      if (!ready[app].length || !run1k[app].length) continue;
      memory[app] = { readyMB: stats(ready[app]).median, run1kMB: stats(run1k[app]).median };
    }
  }

  await server.close();

  // 5. Bundle sizes.
  const bundles = Object.fromEntries(apps.map((app) => [app, bundleSize(app)]));

  // 6. Report.
  const geo = {};
  for (const app of active) {
    const factors = selectedOps.map((op) => results[op.id][app]?.factor).filter((f) => f !== undefined);
    if (factors.length) geo[app] = { value: geomean(factors), complete: factors.length === selectedOps.length };
  }

  const meta = {
    date: startedAt.toISOString(),
    durationSec: Math.round((Date.now() - startedAt.getTime()) / 1000),
    browser: `Chromium ${browserVersion} (headless)`,
    executablePath: executablePath ?? 'playwright default',
    chromeFlags: CHROME_FLAGS,
    node: process.version,
    cpu: `${cpus()[0]?.model ?? 'unknown'} x${cpus().length}`,
    memoryGB: Number((totalmem() / 1024 ** 3).toFixed(1)),
    runs: RUNS,
    runsLots: RUNS_LOTS,
    warmup: WARMUP,
    throttle: THROTTLE,
    memRuns: MEM_RUNS,
    versions: readVersions(),
  };

  const report = {
    meta,
    apps: active,
    skipped,
    failures,
    nonKeyed,
    ops: Object.fromEntries(
      selectedOps.map((op) => [
        op.id,
        { name: op.name, desc: op.desc, cpuThrottle: op.throttle ? THROTTLE : 1, results: results[op.id] },
      ]),
    ),
    geomean: geo,
    memory,
    bundles,
  };

  const markdown = renderMarkdown(report, apps);
  const outDir = join(BENCH_DIR, 'results');
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'latest.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(join(outDir, 'latest.md'), markdown);
  console.log('\n' + markdown);
  console.log(`Wrote ${join(outDir, 'latest.md')} and latest.json`);

  if (failures.length) {
    console.error(`\n${failures.length} correctness failure(s):`);
    for (const f of failures) console.error(`  - ${f.app} / ${f.op}: ${f.message}`);
    process.exit(1);
  }
}

function readVersions() {
  const pkg = (name) => {
    try {
      return JSON.parse(readFileSync(join(BENCH_DIR, 'node_modules', name, 'package.json'), 'utf8')).version;
    } catch {
      return undefined;
    }
  };
  return { vue: pkg('vue'), react: pkg('react'), 'react-dom': pkg('react-dom'), owt: pkg('owt'), vite: pkg('vite'), playwright: pkg('playwright') };
}

const LABELS = {
  vanilla: 'vanilla',
  vue: 'vue',
  react: 'react',
  owt: 'owt',
};

function renderMarkdown(report, builtApps) {
  const { meta, apps, skipped, failures } = report;
  const v = meta.versions;
  const header = (cols) => `| ${cols.join(' | ')} |\n|${cols.map((_, i) => (i ? '---:' : ':---')).join('|')}|\n`;
  const label = (app) => {
    const version = { vue: v.vue, react: v.react, owt: v.owt }[app];
    return `${LABELS[app] ?? app}${version ? ` ${version}` : ''}`;
  };
  let md = '# OWT benchmark results\n\n';
  md += `${meta.browser}, Node ${meta.node}, ${meta.cpu}, ${meta.date.slice(0, 16).replace('T', ' ')} UTC.\n`;
  md +=
    `${meta.runs} runs per benchmark (${meta.runsLots} for 10k rows) after ${meta.warmup} in-page warmup steps; ` +
    `fresh page per run; CPU throttling ${meta.throttle}x where noted. Durations are click -> next frame painted ` +
    `(rAF, rAF, setTimeout 0), in ms.\n`;
  for (const [app, reason] of Object.entries(skipped)) md += `\n> **${app} skipped**: ${reason}\n`;
  for (const f of failures) md += `\n> **${f.app} FAILED ${f.op}**: ${f.message}\n`;
  for (const [app, problem] of Object.entries(report.nonKeyed)) {
    md += `\n> **${app} is not keyed** (results are not comparable to keyed implementations): ${problem}\n`;
  }

  md += '\n## Duration (ms): median (slowdown vs fastest)\n\n';
  md += header(['Benchmark', ...apps.map(label)]);
  for (const [id, op] of Object.entries(report.ops)) {
    const name = `${op.name}: ${op.desc}${op.cpuThrottle > 1 ? ` (${op.cpuThrottle}x CPU slowdown)` : ''}`;
    const cells = apps.map((app) => {
      const r = op.results[app];
      if (!r) return 'FAILED';
      return r.factor === 1 ? `**${fmt(r.median)}** (1.00)` : `${fmt(r.median)} (${fmt(r.factor, 2)})`;
    });
    md += `| \`${id}\` ${name} | ${cells.join(' | ')} |\n`;
  }
  md +=
    `| **geometric mean** of slowdown | ${apps
      .map((app) => (report.geomean[app] ? `**${fmt(report.geomean[app].value, 2)}**${report.geomean[app].complete ? '' : '*'}` : '-'))
      .join(' | ')} |\n`;
  if (Object.values(report.geomean).some((g) => !g.complete)) {
    md += '\n\\* geometric mean over the benchmarks this framework completed only.\n';
  }

  md += '\n## Duration details (ms)\n\n';
  md += 'Columns are total click-to-paint durations; "JS" is the median time from the click to the first\n';
  md += 'animation frame callback (event handler + framework work + microtasks, before style/layout/paint).\n\n';
  md += header(['Benchmark', 'Framework', 'n', 'median', 'mean', 'stddev', 'min', 'max', 'JS']);
  for (const [id, op] of Object.entries(report.ops)) {
    for (const app of apps) {
      const r = op.results[app];
      if (!r) {
        md += `| \`${id}\` | ${app} | - | FAILED | | | | | |\n`;
        continue;
      }
      md += `| \`${id}\` | ${app} | ${r.n} | ${fmt(r.median)} | ${fmt(r.mean)} | ${fmt(r.stddev)} | ${fmt(r.min)} | ${fmt(r.max)} | ${fmt(r.beforeFrameMedian)} |\n`;
    }
  }

  if (Object.keys(report.memory).length) {
    md += '\n## Memory (MB, JS heap used after forced GC)\n\n';
    md += header(['Measurement', ...apps.map(label)]);
    md += `| ready memory (after page load) | ${apps.map((app) => fmt(report.memory[app]?.readyMB, 2)).join(' | ')} |\n`;
    md += `| run memory (after creating 1,000 rows) | ${apps.map((app) => fmt(report.memory[app]?.run1kMB, 2)).join(' | ')} |\n`;
  }

  md += '\n## Production bundle size (all JS)\n\n';
  md += header(['Size', ...builtApps.map(label)]);
  md += `| raw | ${builtApps.map((app) => kib(report.bundles[app].raw)).join(' | ')} |\n`;
  md += `| gzip (level 9) | ${builtApps.map((app) => kib(report.bundles[app].gzip)).join(' | ')} |\n`;
  return md;
}

await main();
