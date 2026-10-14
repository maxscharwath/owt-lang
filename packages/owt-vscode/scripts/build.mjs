#!/usr/bin/env node
// Builds the OWT VS Code extension.
//
//   node scripts/build.mjs               development build (source maps)
//   node scripts/build.mjs --watch       rebuild the client on change
//   node scripts/build.mjs --production  minified build used for packaging; fails when the
//                                        language server or the TypeScript plugin is missing
//
// Steps:
//   1. bundle src/extension.ts (+ vscode-languageclient, @volar/vscode, @owt/compiler)
//      into dist/extension.js with esbuild
//   2. copy @owt/language-server's dist/ into server/
//   3. copy @owt/typescript-plugin (package.json + dist/) into node_modules/@owt/typescript-plugin/,
//      where VS Code's TypeScript extension looks for `contributes.typescriptServerPlugins`
import * as esbuild from 'esbuild';
import { builtinModules, createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packagesDir = path.resolve(root, '..');
const require = createRequire(path.join(root, 'package.json'));

const args = new Set(process.argv.slice(2));
const watch = args.has('--watch');
const production = args.has('--production');

// Workspace packages copied into the extension (overridable to build against another checkout).
const LANGUAGE_SERVER_DIR = path.resolve(process.env.OWT_LANGUAGE_SERVER_DIR ?? path.join(packagesDir, 'owt-language-server'));
const TS_PLUGIN_DIR = path.resolve(process.env.OWT_TS_PLUGIN_DIR ?? path.join(packagesDir, 'owt-typescript-plugin'));
const TS_PLUGIN_NAME = '@owt/typescript-plugin';

const problems = [];

function log(message) {
  console.log(`[owt-vscode] ${message}`);
}

function missing(message) {
  if (production) problems.push(message);
  else log(`warning: ${message}`);
}

function relative(p) {
  return path.relative(root, p) || '.';
}

/**
 * Recursively copies `from` into `to` (source maps are left out of production builds).
 * Declaration files are kept: the language server bundles TypeScript, which loads its
 * `lib.*.d.ts` files from next to the bundle.
 */
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyDir(src, dest);
      continue;
    }
    if (production && entry.name.endsWith('.map')) continue;
    fs.copyFileSync(src, dest);
  }
}

/** Removes a previous copy; a symlink is unlinked so its target is never touched. */
function removeOutput(p) {
  let stat;
  try {
    stat = fs.lstatSync(p);
  } catch {
    return;
  }
  if (stat.isSymbolicLink()) fs.unlinkSync(p);
  else fs.rmSync(p, { recursive: true, force: true });
}

/** Warns about bare `require()`s of packages that will not exist next to the copied bundle. */
function checkSelfContained(file, what, allowed = []) {
  const code = fs.readFileSync(file, 'utf8');
  const builtins = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);
  const external = new Set();
  for (const match of code.matchAll(/\brequire\(\s*["']([^"'./][^"']*)["']\s*\)/g)) {
    const id = match[1];
    const pkg = id.startsWith('@') ? id.split('/').slice(0, 2).join('/') : id.split('/')[0];
    if (!builtins.has(id) && !builtins.has(pkg) && !allowed.includes(pkg)) external.add(id);
  }
  if (external.size > 0) {
    log(`warning: ${what} requires packages that are not bundled: ${[...external].join(', ')}`);
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// ---------------------------------------------------------------------------
// Language server
// ---------------------------------------------------------------------------

function copyLanguageServer() {
  const out = path.join(root, 'server');
  removeOutput(out);
  const dist = path.join(LANGUAGE_SERVER_DIR, 'dist');
  const entry = path.join(dist, 'index.js');
  if (!fs.existsSync(entry)) {
    missing(`language server not found at ${relative(entry)} (build it with: pnpm --filter @owt/language-server build)`);
    return;
  }
  copyDir(dist, out);
  // The bundle is CommonJS: make sure no parent package.json turns it into ESM.
  fs.writeFileSync(path.join(out, 'package.json'), `${JSON.stringify({ type: 'commonjs', private: true }, null, 2)}\n`);
  // `source-map-support` is an optional require inside the bundled TypeScript (wrapped in try/catch).
  checkSelfContained(path.join(out, 'index.js'), 'the language server', ['typescript', 'source-map-support']);
  log(`copied language server -> ${relative(out)}`);
}

// ---------------------------------------------------------------------------
// TypeScript server plugin
// ---------------------------------------------------------------------------

function copyTypeScriptPlugin() {
  const out = path.join(root, 'node_modules', ...TS_PLUGIN_NAME.split('/'));
  const pkgFile = path.join(TS_PLUGIN_DIR, 'package.json');
  const dist = path.join(TS_PLUGIN_DIR, 'dist');
  if (!fs.existsSync(pkgFile) || !fs.existsSync(dist)) {
    removeOutput(out);
    missing(`TypeScript plugin not found at ${relative(dist)} (build it with: pnpm --filter ${TS_PLUGIN_NAME} build)`);
    return;
  }
  const pkg = readJson(pkgFile);
  removeOutput(out);
  copyDir(dist, path.join(out, 'dist'));

  // tsserver loads plugins with a CommonJS `require` using classic node resolution (`main`,
  // no `exports`), so write a minimal manifest pointing at the CommonJS entry point.
  const candidates = [pkg.main, 'dist/index.js', 'dist/index.cjs'].filter((m) => typeof m === 'string');
  const main = candidates.map((m) => m.replace(/^\.\//, '')).find((m) => fs.existsSync(path.join(out, m)));
  if (main === undefined) {
    removeOutput(out);
    missing(`TypeScript plugin has no CommonJS entry point (looked for ${candidates.join(', ')})`);
    return;
  }
  const manifest = {
    name: TS_PLUGIN_NAME,
    version: pkg.version ?? '0.0.0',
    license: pkg.license ?? 'MIT',
    type: 'commonjs',
    main: `./${main}`,
  };
  fs.writeFileSync(path.join(out, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  checkSelfContained(path.join(out, main), 'the TypeScript plugin', ['typescript']);
  log(`copied TypeScript plugin -> ${relative(out)}`);
}

// ---------------------------------------------------------------------------
// Client bundle
// ---------------------------------------------------------------------------

function checkCompiler() {
  try {
    require.resolve('@owt/compiler');
    return true;
  } catch {
    problems.push('@owt/compiler is not built (run: pnpm --filter @owt/compiler build). It is bundled into the extension for "OWT: Show Compiled Output".');
    return false;
  }
}

/** @volar/vscode reads `typescript/package.json` only in VS Code for the Web; never bundle TypeScript. */
const stubWebOnlyRequires = {
  name: 'stub-web-only-requires',
  setup(build) {
    build.onResolve({ filter: /^typescript\/package\.json$/ }, () => ({ path: 'typescript-package-json', namespace: 'owt-stub' }));
    build.onLoad({ filter: /.*/, namespace: 'owt-stub' }, () => ({ contents: '{ "version": "0.0.0" }', loader: 'json' }));
  },
};

const reportBuild = {
  name: 'report',
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length === 0) {
        const size = fs.statSync(path.join(root, 'dist', 'extension.js')).size;
        log(`built dist/extension.js (${(size / 1024).toFixed(0)} KiB)`);
      }
    });
  },
};

/** @type {import('esbuild').BuildOptions} */
const options = {
  absWorkingDir: root,
  entryPoints: { extension: 'src/extension.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  mainFields: ['module', 'main'],
  external: ['vscode'],
  sourcemap: !production,
  minify: production,
  keepNames: false,
  legalComments: production ? 'none' : 'inline',
  define: { 'process.env.NODE_ENV': JSON.stringify(production ? 'production' : 'development') },
  logLevel: 'warning',
  plugins: [stubWebOnlyRequires, reportBuild],
};

/** vscode-languageclient spawns this script (relative to the bundle) to kill a hanging server. */
function copyLanguageClientAssets() {
  const source = path.join(path.dirname(require.resolve('vscode-languageclient/package.json')), 'lib', 'node', 'terminateProcess.sh');
  const dest = path.join(root, 'dist', 'terminateProcess.sh');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(source, dest);
  fs.chmodSync(dest, 0o755);
}

async function main() {
  copyLanguageServer();
  copyTypeScriptPlugin();
  const compilerReady = checkCompiler();

  if (problems.length > 0) {
    for (const p of problems) console.error(`[owt-vscode] error: ${p}`);
    if (!compilerReady || production) process.exit(1);
  }

  removeOutput(path.join(root, 'dist'));
  copyLanguageClientAssets();

  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    log('watching src/ for changes…');
    return;
  }
  await esbuild.build(options);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
