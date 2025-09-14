import type { Component } from '@owt/ast';
import { extractComponentsFromAst } from '@owt/shared';
import { CodeBuilder } from './codebuilder';
import { genComponent, genTypeScriptComponent } from './codegen/component';

export function processComponentNodes(ast: any, source: string, cb: CodeBuilder, isTypeScript = false): void {
  const comps: Component[] = extractComponentsFromAst(ast) as Component[];
  for (const c of comps) {
    const seg = source.slice((c as any).loc.start.offset, (c as any).loc.end.offset);
    // For TypeScript generation, pass the full source to extract type definitions
    const compCode = isTypeScript ? genTypeScriptComponent(c, source, cb.minify) : genComponent(c, seg, cb.minify, isTypeScript);
    const lines = compCode.split('\n');
    cb.add('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (i === 0) {
        cb.addLine(line, (c as any).loc.start);
      } else {
        cb.addLine(line);
      }
    }
    cb.add('\n');
  }
}
