import type { Component } from '@owt/ast';
import { extractComponentsFromAst } from '@owt/shared';
import { CodeBuilder } from './codebuilder';
import { genComponent } from './codegen/component';

export function processComponentNodes(ast: any, source: string, cb: CodeBuilder): void {
  const comps: Component[] = extractComponentsFromAst(ast) as Component[];
  for (const c of comps) {
    const seg = source.slice((c as any).loc.start.offset, (c as any).loc.end.offset);
    const compCode = genComponent(c, seg);
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
