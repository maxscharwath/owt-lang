import { parse } from '@owt/parser';
import { CodeBuilder } from './codebuilder';
import { processImportLines } from './utils';
import { processComponentNodes } from './ast-processor';
import { OwtTypeChecker } from './owt-type-checker';

export type CompileResult = {
  js: { code: string; map: any };
  css: string;
};

export type CompileOptions = {
  debug?: boolean;
  logger?: (msg: string) => void;
  minify?: boolean;
  typeCheck?: boolean;
  projectRoot?: string;
};

export function compile(source: string, filename: string, opts: CompileOptions = {}): CompileResult {
  const debug = !!opts.debug;
  const minify = !!opts.minify;
  const typeCheck = !!opts.typeCheck;
  const log = opts.logger ?? ((msg: string) => console.log(`[owt:compile] ${msg}`));
  const t0 = Date.now();
  if (debug) log(`compile start ${filename} (len=${source.length})`);
  
  const ast = parse(source, { debug, logger: (m: string) => { if (debug) log(m); } });
  const importLines = processImportLines(source);
  
  // Run OWT type checking first
  let owtErrors: any[] = [];
  if (typeCheck) {
    log(`Running OWT type checking for ${filename}`);
    const typeChecker = new OwtTypeChecker();
    owtErrors = typeChecker.check(source, filename);
    log(`OWT type checking found ${owtErrors.length} errors`);
    if (owtErrors.length > 0) {
      const errorMessages = owtErrors.map(error => 
        `${filename}(${error.line},${error.column}): ${error.severity.toUpperCase()} ${error.code}: ${error.message}`
      ).join('\n');
      log(`OWT type errors in ${filename}:\n${errorMessages}`);
      throw new Error(`OWT type checking failed in ${filename}:\n${errorMessages}`);
    }
  }

    const cb = new CodeBuilder(filename, source, minify);
  
  // Add header comments and imports
  if (!minify) {
    cb.addLine(`/* Generated from ${filename} */`);
    cb.addLine(`/* @owt generated */`);
    cb.addLine(`/* eslint-disable */`);
    cb.addLine(`/* prettier-ignore */`);
    cb.addLine(`// Runtime helpers`);
  }
  
  if (importLines.length) {
    for (const l of importLines) cb.addLine(l);
  }
  
  cb.addLine(`import * as __rt from 'owt';`);
  
  // Process component nodes (always generate JavaScript, not TypeScript)
  processComponentNodes(ast, source, cb, false);
  
  const jsCode = cb.toString();
  const jsMap = cb.map.toJSON();
  
  const out: CompileResult = { 
    js: { code: jsCode, map: jsMap }, 
    css: '' 
  };
  
  if (debug) {
    const dt = Date.now() - t0;
    const jsSize = out.js.code.length;
    const hasTypeErrors = typeCheck && owtErrors.length > 0;
    log(`compile done ${filename} in ${dt}ms (js=${jsSize} bytes${hasTypeErrors ? ', with type errors' : ''})`);
  }
  return out;
}
