#!/usr/bin/env node
// Adds node_modules/@owt/typescript-plugin/ to the packaged VSIX.
//
// VS Code's TypeScript extension resolves `contributes.typescriptServerPlugins` from the
// extension's own node_modules folder, but `vsce package --no-dependencies` never packages
// anything under node_modules/ (and vsce's npm mode does not understand pnpm workspaces).
// This step copies the plugin that scripts/build.mjs placed in node_modules/@owt/typescript-plugin
// into the archive, next to the files vsce collected.
//
//   node scripts/inject-ts-plugin.mjs [path/to/extension.vsix]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yauzl from 'yauzl';
import yazl from 'yazl';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const vsixPath = path.resolve(root, process.argv[2] ?? `${manifest.name}-${manifest.version}.vsix`);

const PLUGIN = '@owt/typescript-plugin';
const pluginDir = path.join(root, 'node_modules', ...PLUGIN.split('/'));
const prefix = `extension/node_modules/${PLUGIN}/`;

const CONTENT_TYPES = {
  '.js': 'application/javascript',
  '.cjs': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.map': 'application/json',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
};

function fail(message) {
  console.error(`[owt-vscode] error: ${message}`);
  process.exit(1);
}

function listFiles(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full, base);
    if (entry.name.endsWith('.map')) return [];
    return [path.relative(base, full).split(path.sep).join('/')];
  });
}

function readZip(file) {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err);
      const entries = [];
      zip.on('error', reject);
      zip.on('end', () => resolve(entries));
      zip.on('entry', (entry) => {
        if (entry.fileName.endsWith('/')) return zip.readEntry();
        zip.openReadStream(entry, (streamErr, stream) => {
          if (streamErr) return reject(streamErr);
          const chunks = [];
          stream.on('data', (c) => chunks.push(c));
          stream.on('error', reject);
          stream.on('end', () => {
            entries.push({
              name: entry.fileName,
              data: Buffer.concat(chunks),
              mtime: entry.getLastModDate(),
              mode: entry.externalFileAttributes >>> 16 || undefined,
            });
            zip.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  });
}

function writeZip(file, entries) {
  return new Promise((resolve, reject) => {
    const zip = new yazl.ZipFile();
    for (const e of entries) {
      const options = { mtime: e.mtime ?? new Date(), compress: true };
      if (e.mode) options.mode = e.mode;
      zip.addBuffer(e.data, e.name, options);
    }
    zip.end();
    const out = fs.createWriteStream(file);
    zip.outputStream.pipe(out).on('close', resolve).on('error', reject);
  });
}

if (!fs.existsSync(vsixPath)) fail(`${path.relative(root, vsixPath)} not found (run vsce package first)`);
if (!fs.existsSync(path.join(pluginDir, 'package.json'))) {
  fail(`${PLUGIN} is missing from node_modules (run: node scripts/build.mjs --production)`);
}

const entries = await readZip(vsixPath);
if (entries.some((e) => e.name.startsWith(prefix))) {
  console.log(`[owt-vscode] ${path.basename(vsixPath)} already contains ${PLUGIN}`);
  process.exit(0);
}

const files = listFiles(pluginDir);
const now = new Date();
for (const file of files) {
  entries.push({ name: prefix + file, data: fs.readFileSync(path.join(pluginDir, file)), mtime: now });
}

// Every file extension in the package needs a [Content_Types].xml entry.
const typesEntry = entries.find((e) => e.name === '[Content_Types].xml');
if (typesEntry === undefined) fail('[Content_Types].xml missing from the VSIX');
let types = typesEntry.data.toString('utf8');
for (const ext of new Set(files.map((f) => path.extname(f).toLowerCase()).filter(Boolean))) {
  if (types.toLowerCase().includes(`extension="${ext}"`)) continue;
  const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream';
  types = types.replace('</Types>', `<Default Extension="${ext}" ContentType="${contentType}"/></Types>`);
}
typesEntry.data = Buffer.from(types, 'utf8');

const tmp = `${vsixPath}.tmp`;
await writeZip(tmp, entries);
fs.renameSync(tmp, vsixPath);
console.log(`[owt-vscode] added ${files.length} file(s) of ${PLUGIN} to ${path.basename(vsixPath)}`);
