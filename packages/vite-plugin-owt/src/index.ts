import type { Plugin } from 'vite';
import { compile } from '@owt/compiler';

export type OwtPluginOptions = {
  debug?: boolean;
  logger?: (msg: string) => void;
};

function envDebug(): boolean {
  const v = (process.env.OWT_DEBUG ?? '').toString().trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export function owt(opts: OwtPluginOptions = {}): Plugin {
  const cssCache = new Map<string, string>();
  let root = '';
  const debug = opts.debug ?? envDebug();
  const log = opts.logger ?? ((msg: string) => console.log(`[owt:vite] ${msg}`));
  let isDev = false;
  let devLoggerInjected = false;

  return {
    name: 'vite-plugin-owt',
    enforce: 'pre',
    configResolved(config) {
      root = config.root;
      if (debug) log(`configResolved root=${JSON.stringify(root)}`);
      // Consider dev if running the dev server or non-production mode
      isDev = ((config as any).command === 'serve') || config.mode !== 'production';
    },
    async load(id) {
      if (cssCache.has(id)) {
        if (debug) log(`load virtual css ${id} (bytes=${cssCache.get(id)?.length ?? 0})`);
        return cssCache.get(id);
      }
      return null;
    },
    async transform(code, id) {
      // Normalize Vite query suffixes like ?import, ?v=, etc.
      const baseId = id.split('?')[0]!;
      if (!baseId.endsWith('.owt')) return null;
      const filename = baseId.startsWith(root) ? baseId.slice(root.length) : baseId;
      const start = Date.now();
      if (debug) log(`transform start ${filename}`);
      try {
        const { js, css } = compile(code, filename, { debug, logger: (m) => debug && log(m) });
        let final = js.code;
        // Inject dev logger once in dev mode
        if (isDev && !devLoggerInjected) {
          const preamble = `import { setDevLogger } from 'owt';\n` +
            `if (typeof window !== 'undefined') { try {\n` +
            `  // initialize once per dev session\n` +
            `  if (!('__$owtDevLoggerInitialized' in window)) {\n` +
            `    Object.defineProperty(window, '__$owtDevLoggerInitialized', { value: true, writable: false, configurable: false });\n` +
            `    setDevLogger((event, payload) => {\n` +
            `      // eslint-disable-next-line no-console\n` +
            `      console.log('[owt:dev]', event, payload);\n` +
            `    });\n` +
            `  }\n` +
            `} catch {} }\n`;
          final = preamble + final;
          devLoggerInjected = true;
          if (debug) log('injected dev logger preamble');
        }
        if (css && css.length) {
          const cssId = id + '?owt&type=style&lang.css';
          cssCache.set(cssId, css);
          final += `\nimport ${JSON.stringify(cssId)};\n`;
          if (debug) log(`emitted css for ${filename} -> ${cssId} (${css.length} bytes)`);
        }
        const dur = Date.now() - start;
        if (debug) log(`transform done ${filename} in ${dur}ms (js=${final.length} bytes)`);
        return { code: final, map: js.map };
      } catch (err: any) {
        if (debug) log(`transform error ${filename}: ${err?.stack || err}`);
        throw err;
      }
    },
  };
}

export default owt;
