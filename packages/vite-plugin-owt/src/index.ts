/**
 * Vite plugin for OWT (`.owt` components).
 *
 * - compiles components to optimized DOM code with source maps,
 * - emits component CSS as virtual `?owt&type=style&lang.css` modules so it
 *   goes through Vite's CSS pipeline (PostCSS, Tailwind, extraction, HMR),
 * - hot-reloads components while keeping the rest of the page alive, and
 *   updates only the CSS when only `<style>` changed,
 * - reports compile errors with code frames in the Vite overlay.
 */
import { relative } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';
import { compile, CompileError, type CompileResult } from '@owt/compiler';

export type OwtPluginOptions = {
  /** emit CSS as separate modules (default) or inject it at runtime */
  emitCss?: boolean;
  /** force development-mode compilation (default: dev server) */
  dev?: boolean;
  /** enable hot module replacement (default: true in dev) */
  hmr?: boolean;
  /** runtime module imported by compiled code */
  runtime?: string;
  /** log compile timings */
  debug?: boolean;
};

const STYLE_QUERY = 'owt&type=style&lang.css';

function splitId(id: string): { file: string; query: string } {
  const q = id.indexOf('?');
  return q < 0 ? { file: id, query: '' } : { file: id.slice(0, q), query: id.slice(q + 1) };
}

export function owt(options: OwtPluginOptions = {}): Plugin {
  let config: ResolvedConfig | undefined;
  let isServe = false;
  const css = new Map<string, string>();
  /** last compiled JS per file, to detect style-only edits */
  const lastJs = new Map<string, string>();

  const compileFile = (source: string, file: string): CompileResult => {
    const root = config?.root ?? process.cwd();
    const filename = relative(root, file).split('\\').join('/') || file;
    const dev = options.dev ?? isServe;
    const start = performance.now();
    const result = compile(source, {
      filename,
      dev,
      hmr: (options.hmr ?? true) && isServe && config?.server.hmr !== false,
      css: options.emitCss === false ? 'injected' : 'external',
      ...(options.runtime !== undefined ? { runtime: options.runtime } : {}),
    });
    if (options.debug) config?.logger.info(`[owt] compiled ${filename} in ${(performance.now() - start).toFixed(1)}ms`);
    return result;
  };

  return {
    name: 'vite-plugin-owt',
    enforce: 'pre',

    config() {
      return {
        optimizeDeps: { exclude: ['owt'] },
      };
    },

    configResolved(resolved) {
      config = resolved;
      isServe = resolved.command === 'serve';
    },

    load: {
      filter: { id: /\?owt&type=style/ },
      handler(id) {
        const { query } = splitId(id);
        if (query !== STYLE_QUERY) return null;
        return css.get(id) ?? '';
      },
    },

    transform: {
      filter: { id: /\.owt(?:$|\?)/ },
      handler(code, id) {
        const { file, query } = splitId(id);
        if (!file.endsWith('.owt') || query.includes('type=style')) return null;
        let result: CompileResult;
        try {
          result = compileFile(code, file);
        } catch (err) {
          if (err instanceof CompileError) {
            return this.error({ message: err.message, id: file, loc: { ...err.loc, file }, frame: err.frame, plugin: 'owt' });
          }
          throw err;
        }
        for (const w of result.warnings) this.warn({ message: w.message, id: file, pos: w.start });
        let out = result.js.code;
        lastJs.set(file, out);
        if (result.css !== null) {
          const cssId = `${file}?${STYLE_QUERY}`;
          css.set(cssId, result.css.code);
          out += `\nimport ${JSON.stringify(cssId)};\n`;
        }
        return { code: out, map: result.js.map, moduleType: 'js' };
      },
    },

    async hotUpdate({ file, read, modules }) {
      if (!file.endsWith('.owt')) return;
      let result: CompileResult;
      try {
        result = compileFile(await read(), file);
      } catch {
        return; // let the regular update surface the error overlay
      }
      const cssId = `${file}?${STYLE_QUERY}`;
      if (result.css !== null) css.set(cssId, result.css.code);
      const previous = lastJs.get(file);
      if (previous === undefined || previous !== result.js.code) return;
      // only <style> changed: update the CSS module alone, keep component state
      const cssModule = this.environment.moduleGraph.getModuleById(cssId);
      if (cssModule === undefined) return;
      return [cssModule, ...modules.filter((m) => m.id === cssId)].filter((m, i, all) => all.indexOf(m) === i);
    },
  };
}

export default owt;
