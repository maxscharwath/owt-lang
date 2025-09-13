import type { Attribute, ShorthandAttribute, SpreadAttribute } from '@owt/ast';
import { Reader, readBalanced, emitBetween } from './reader.js';
import { locFrom } from './loc.js';

export function parseAttribute(r: Reader): Attribute | ShorthandAttribute | SpreadAttribute {
  if (r.match('LBrace')) {
    const lb = r.next(); // '{'
    // detect '...'
    let dots = 0;
    while (r.match('Dot')) { r.next(); dots++; }
    if (dots === 3) {
      // spread: we already consumed '{' and '...'; capture until matching '}'
      let depth = 1;
      let code = '';
      let end = lb as any;
      while (!r.eof()) {
        const t = r.next();
        end = t as any;
        const name = t.tokenType?.name ?? '';
        if (name === 'LBrace') { code += emitBetween(code, t as any); depth++; continue; }
        if (name === 'RBrace') { depth--; if (depth === 0) break; code += '}'; continue; }
        code += emitBetween(code, t as any);
      }
      const expr = { type: 'Expr', code: code.trim(), loc: locFrom(lb as any, end as any) } as any;
      return { type: 'SpreadAttribute', argument: expr, loc: locFrom(lb as any, end as any) } as SpreadAttribute;
    }
    // shorthand: {name}
    const nameTok = r.next();
    if ((nameTok.tokenType?.name ?? '') !== 'Identifier') throw new Error('Expected identifier in shorthand attribute');
    const rb = r.next(); // '}'
    return { type: 'ShorthandAttribute', name: nameTok.image, loc: locFrom(lb, rb) } as ShorthandAttribute;
  }
  // name [= (string|{expr})]
  const nameTok = r.next();
  if ((nameTok.tokenType?.name ?? '') !== 'Identifier') throw new Error('Expected attribute name');
  let value: Attribute['value'] = null;
  let endTok = nameTok as any;
  if (r.match('Equals')) {
    r.next();
    if (r.match('StringLiteral')) {
      const s = r.next();
      value = { type: 'Text', value: (s.image ?? '').slice(1, -1), loc: locFrom(s, s) } as any;
      endTok = s as any;
    } else if (r.match('LBrace')) {
      const inner = readBalanced(r, 'LBrace', 'RBrace');
      value = { type: 'Expr', code: inner.code.trim(), loc: locFrom(inner.start, inner.end) } as any;
      endTok = inner.end as any;
    } else {
      throw new Error('Expected attribute value');
    }
  }
  return { type: 'Attribute', name: nameTok.image, value: value as any, loc: locFrom(nameTok as any, endTok as any) } as Attribute;
}
