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

  return {
    name: 'vite-plugin-owt',
    enforce: 'pre',
    configResolved(config) {
      root = config.root;
      if (debug) log(`configResolved root=${JSON.stringify(root)}`);
    },
    async load(id) {
      if (cssCache.has(id)) {
        if (debug) log(`load virtual css ${id} (bytes=${cssCache.get(id)?.length ?? 0})`);
        return cssCache.get(id);
      }
      return null;
    },
    async transform(code, id) {
      if (!id.endsWith('.owt')) return null;
      const filename = id.startsWith(root) ? id.slice(root.length) : id;
      const start = Date.now();
      if (debug) log(`transform start ${filename}`);
      try {
        const { js, css } = compile(code, filename, { debug, logger: (m) => debug && log(m) });
        let final = js.code;
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
