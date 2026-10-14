// Shared Vite settings for every benchmark app.
//
// - Builds into benchmark/dist/<app>/ with relative asset URLs, so the runner can
//   serve all apps from one static server.
// - Inlines shared/style.css into index.html as a <style> tag (no network fetches,
//   and the JS bundle size stays free of CSS), plus an empty data: favicon.
// - Drops the modulepreload polyfill so bundle sizes only contain framework + app code.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin, UserConfig } from 'vite';

const sharedDir = fileURLToPath(new URL('.', import.meta.url));

export function inlineSharedCss(): Plugin {
  return {
    name: 'owt-benchmark:inline-shared-css',
    transformIndexHtml() {
      const css = readFileSync(`${sharedDir}/style.css`, 'utf8');
      return [
        // Empty favicon: avoids a /favicon.ico request (and its 404 console error).
        { tag: 'link', attrs: { rel: 'icon', href: 'data:,' }, injectTo: 'head' },
        { tag: 'style', children: css, injectTo: 'head' },
      ];
    },
  };
}

export function sharedConfig(app: string): UserConfig {
  return {
    base: './',
    logLevel: 'warn',
    build: {
      outDir: fileURLToPath(new URL(`../dist/${app}`, import.meta.url)),
      emptyOutDir: true,
      modulePreload: { polyfill: false },
      reportCompressedSize: false,
    },
  };
}
