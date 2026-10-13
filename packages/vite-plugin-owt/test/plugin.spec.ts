import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { build, createServer, type ViteDevServer } from 'vite';
import owt from '../src/index';

const root = resolve(import.meta.dirname, 'fixture');

describe('vite-plugin-owt (dev server)', () => {
  let server: ViteDevServer;

  beforeAll(async () => {
    server = await createServer({ root, logLevel: 'silent', plugins: [owt()], server: { middlewareMode: true, hmr: false, ws: false } });
  });

  afterAll(async () => {
    await server.close();
  });

  it('compiles components to JavaScript', async () => {
    const result = await server.transformRequest('/src/App.owt');

    expect(result?.code).toContain('export function App(');
  });

  it('imports component CSS as a virtual module', async () => {
    const result = await server.transformRequest('/src/App.owt');

    expect(result?.code).toContain('App.owt?owt&type=style&lang.css');
  });

  it('serves scoped CSS through the CSS pipeline', async () => {
    const result = await server.transformRequest('/src/App.owt?owt&type=style&lang.css');

    expect(result?.code).toContain('.btn.owt-');
  });

  it('reports compile errors with a code frame', async () => {
    const error = await server.transformRequest('/src/Broken.owt').catch((e: unknown) => e);

    expect(String((error as { frame?: string }).frame)).toContain('<div><span></div>');
  });
});

describe('vite-plugin-owt (build)', () => {
  it('builds an app with extracted CSS', async () => {
    const output = await build({ root, logLevel: 'silent', plugins: [owt()], build: { write: false } });

    const files = (Array.isArray(output) ? output[0] : output) as { output: { fileName: string }[] };
    expect(files.output.some((f) => f.fileName.endsWith('.css'))).toBe(true);
    expect(files.output.some((f) => f.fileName.endsWith('.js'))).toBe(true);
  });
});
