import type { Component, Node, StyleBlock, Element } from '@owt/ast';
import { Reader } from './reader.js';
import { locFromWithComments } from './loc.js';
import { readParensExpr } from './expr.js';
import { parseElement as parseEl } from './elements.js';

export function parseComponent(r: Reader, parseStatementOrNode: (r: Reader) => Node | null): Component {
  const exportTok = r.match('ExportKw') ? r.next() : null;
  const compTok = r.next(); // component
  const nameTok = r.next();
  if ((nameTok.tokenType?.name ?? '') !== 'Identifier') throw new Error('Expected component name');
  let propsType: string | undefined = undefined;
  if (r.match('LParen')) {
    const expr = readParensExpr(r);
    propsType = expr.code.trim();
  }
  r.next(); // '{'
  const body: Node[] = [];
  let style: StyleBlock | null = null;
  while (!r.match('RBrace')) {
    if (r.match('Lt')) {
      const el = parseEl(r, parseStatementOrNode);
      if ((el as any).name === '__style__') {
        style = { type: 'StyleBlock', content: '', loc: (el as any).loc } as any;
      } else {
        body.push(el as Element);
      }
      continue;
    }
    const n = parseStatementOrNode(r);
    if (n) body.push(n);
  }
  const rb = r.next();
  const baseComp: any = {
    type: 'Component',
    name: nameTok.image,
    export: !!exportTok,
    body,
    style,
    loc: locFromWithComments((exportTok ?? compTok) as any, rb as any, (r as any).comments),
  };
  if (propsType?.length) baseComp.propsType = propsType;
  return baseComp as Component;
}
