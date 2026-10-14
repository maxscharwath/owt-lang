#!/usr/bin/env node
// Tiny dependency-free static file server for benchmark/dist.
//
//   node scripts/serve.mjs [port]   # then open http://127.0.0.1:<port>/vue/
//
// The runner imports startServer() and listens on a random free port.

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DIST_DIR } from './build.mjs';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

/**
 * @param {string} root directory to serve
 * @param {number} port 0 = random free port
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
export function startServer(root = DIST_DIR, port = 0) {
  const rootDir = resolve(root);
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
      let file = normalize(join(rootDir, pathname));
      if (file !== rootDir && !file.startsWith(rootDir + sep)) {
        res.writeHead(403).end('Forbidden');
        return;
      }
      let info = await stat(file).catch(() => null);
      if (info?.isDirectory()) {
        if (!pathname.endsWith('/')) {
          res.writeHead(301, { Location: pathname + '/' }).end();
          return;
        }
        file = join(file, 'index.html');
        info = await stat(file).catch(() => null);
      }
      if (!info?.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
        'Content-Length': info.size,
        'Cache-Control': 'no-store',
      });
      createReadStream(file).pipe(res);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' }).end(String(err));
    }
  });

  return new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      resolvePromise({
        url: `http://127.0.0.1:${actualPort}`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.argv[2] ?? 8080);
  const { url } = await startServer(DIST_DIR, port);
  console.log(`Serving ${DIST_DIR} at ${url}/ (Ctrl+C to stop)`);
}
