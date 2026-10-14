#!/usr/bin/env node
// Builds every benchmark app with Vite (production mode) into benchmark/dist/<app>/.
//
//   node scripts/build.mjs                # all apps
//   node scripts/build.mjs vue react      # a subset
//
// A failing build (e.g. OWT while its compiler is being rewritten) does not stop
// the others: its dist folder is removed and the failure is recorded in
// dist/build-status.json, which the runner uses to skip the app.

import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const BENCH_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DIST_DIR = join(BENCH_DIR, 'dist');
export const BUILD_STATUS_FILE = join(DIST_DIR, 'build-status.json');
export const ALL_APPS = ['vanilla', 'vue', 'react', 'owt'];

/** Short, human readable summary of a (possibly multi-line, stack-laden) build error. */
export function summarizeError(text) {
  const lines = String(text)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('at ') && !/^Build failed with \d+ error/.test(line));
  return lines.slice(0, 3).join(' | ') || String(text);
}

/**
 * @param {string[]} apps
 * @returns {Promise<Record<string, { ok: boolean, error?: string, ms: number }>>}
 */
export async function buildApps(apps = ALL_APPS) {
  // Make sure every build runs in production mode (React picks its prod bundle from NODE_ENV).
  process.env.NODE_ENV = 'production';
  // App configs use extensionless relative imports (repo convention); silence Vite's
  // "native config loader" advisory about them.
  process.env.VITE_CONFIG_NATIVE_IGNORE_WARNING ??= 'true';
  const { build } = await import('vite');
  await mkdir(DIST_DIR, { recursive: true });

  const status = {};
  for (const app of apps) {
    const root = join(BENCH_DIR, 'apps', app);
    const outDir = join(DIST_DIR, app);
    const start = performance.now();
    await rm(outDir, { recursive: true, force: true });
    if (!existsSync(join(root, 'vite.config.ts'))) {
      status[app] = { ok: false, error: `no app at ${root}`, ms: 0 };
      console.log(`[build] ${app}: SKIPPED (no app at ${root})`);
      continue;
    }
    try {
      await build({
        root,
        configFile: join(root, 'vite.config.ts'),
        mode: 'production',
        logLevel: 'warn',
        build: { outDir, emptyOutDir: true },
      });
      if (!existsSync(join(outDir, 'index.html'))) throw new Error('build produced no index.html');
      status[app] = { ok: true, ms: Math.round(performance.now() - start) };
      console.log(`[build] ${app}: ok (${status[app].ms} ms)`);
    } catch (err) {
      await rm(outDir, { recursive: true, force: true });
      const message = err instanceof Error ? err.message : String(err);
      status[app] = { ok: false, error: message, ms: Math.round(performance.now() - start) };
      console.log(`[build] ${app}: FAILED - ${summarizeError(message)}`);
    }
  }

  let previous = {};
  try {
    previous = JSON.parse(readFileSync(BUILD_STATUS_FILE, 'utf8'));
  } catch {
    previous = {};
  }
  await writeFile(BUILD_STATUS_FILE, JSON.stringify({ ...previous, ...status }, null, 2) + '\n');
  return status;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const requested = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
  const unknown = requested.filter((app) => !ALL_APPS.includes(app));
  if (unknown.length) {
    console.error(`Unknown app(s): ${unknown.join(', ')}. Known: ${ALL_APPS.join(', ')}`);
    process.exit(1);
  }
  const status = await buildApps(requested.length ? requested : ALL_APPS);
  const ok = Object.values(status).filter((s) => s.ok).length;
  console.log(`[build] ${ok}/${Object.keys(status).length} apps built into ${DIST_DIR}`);
  process.exit(ok > 0 ? 0 : 1);
}
