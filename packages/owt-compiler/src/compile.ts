import { parse } from '@owt/parser';
import { CodeBuilder } from './codebuilder';
import { processImportLines } from './utils';
import { processComponentNodes } from './ast-processor';

export type CompileResult = {
  js: { code: string; map: any };
  css: string;
};

export type CompileOptions = {
  debug?: boolean;
  logger?: (msg: string) => void;
};

export function compile(source: string, filename: string, opts: CompileOptions = {}): CompileResult {
  const debug = !!opts.debug;
  const log = opts.logger ?? ((msg: string) => console.log(`[owt:compile] ${msg}`));
  const t0 = Date.now();
  if (debug) log(`compile start ${filename} (len=${source.length})`);
  
  const ast = parse(source, { debug, logger: (m: string) => { if (debug) log(m); } });
  const importLines = processImportLines(source);
  const cb = new CodeBuilder(filename, source);
  
  // Add header comments and imports
  cb.addLine(`/* Generated from ${filename} */`);
  cb.addLine(`/* @owt generated */`);
  cb.addLine(`/* eslint-disable */`);
  cb.addLine(`/* prettier-ignore */`);
  cb.addLine(`// Runtime helpers`);
  
  if (importLines.length) {
    for (const l of importLines) cb.addLine(l);
  }
  
  cb.addLine(`import * as __rt from 'owt';`);
  
  // Process component nodes
  processComponentNodes(ast, source, cb);
  
  const out = { js: { code: cb.toString(), map: cb.map.toJSON() }, css: '' };
  if (debug) {
    const dt = Date.now() - t0;
    log(`compile done ${filename} in ${dt}ms (js=${out.js.code.length} bytes)`);
  }
  return out;
}
