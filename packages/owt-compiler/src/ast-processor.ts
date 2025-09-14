import type { Component } from '@owt/ast';
import { CodeBuilder } from './codebuilder';
import { genComponent } from './codegen/component';

export function processComponentNodes(ast: any, source: string, cb: CodeBuilder): void {
  for (const n of ast.body) {
    if ((n as Component).type === 'Component') {
      const c = n as Component;
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
    } else if (n.type === 'StyleBlock') {
      // global style collection placeholder
    }
  }
}
