import type { Program, Component, StyleBlock } from '@owt/ast';
import type { IToken } from 'chevrotain';
import { Reader } from './reader';
import { parseComponent as parseComp } from './components';

export function parseProgram(r: Reader, parseStatementOrNode: (r: Reader) => any): Program {
  const body: (Component | StyleBlock)[] = [];
  while (!r.eof()) {
    const t = r.peek();
    const nm = t.tokenType?.name ?? '';
    if (nm === 'ExportKw') {
      if ((r.peek(1).tokenType?.name ?? '') === 'ComponentKw') {
        body.push(parseComp(r, parseStatementOrNode));
      } else {
        r.next();
      }
      continue;
    }
    if (nm === 'ComponentKw') {
      body.push(parseComp(r, parseStatementOrNode));
      continue;
    }
    // ignore everything else (imports/comments/whitespace)
    r.next();
  }
  const endTok = (r as any).tokens?.[(r as any).tokens.length - 1] as IToken | undefined;
  const program: Program = {
    type: 'Program',
    body,
    loc: {
      start: { offset: 0, line: 1, column: 1 },
      end: { offset: endTok?.endOffset ?? 0, line: endTok?.endLine ?? 1, column: endTok?.endColumn ?? 1 },
    } as any,
  } as Program;
  return program;
}
