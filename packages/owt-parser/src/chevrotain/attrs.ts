import type { Attribute, ShorthandAttribute, SpreadAttribute } from '@owt/ast';
import { Reader, readBalanced, emitBetween } from './reader';
import { locFrom } from './loc';

function parseSpreadAttribute(r: Reader, lb: any): SpreadAttribute {
  let depth = 1;
  let code = '';
  let end: any = lb;
  while (!r.eof()) {
    const t = r.next();
    end = t as any;
    const name = t.tokenType?.name ?? '';
    if (name === 'LBrace') { 
      code += emitBetween(code, t as any); 
      depth++; 
      continue; 
    }
    if (name === 'RBrace') { 
      depth--; 
      if (depth === 0) break; 
      code += '}'; 
      continue; 
    }
    code += emitBetween(code, t as any);
  }
  const expr = { type: 'Expr', code: code.trim(), loc: locFrom(lb, end) };
  return { type: 'SpreadAttribute', argument: expr, loc: locFrom(lb, end) } as SpreadAttribute;
}

function parseShorthandAttribute(r: Reader, lb: any): ShorthandAttribute {
  const nameTok = r.next();
  if ((nameTok.tokenType?.name ?? '') !== 'Identifier') throw new Error('Expected identifier in shorthand attribute');
  const rb = r.next(); // '}'
  return { type: 'ShorthandAttribute', name: nameTok.image, loc: locFrom(lb, rb) } as ShorthandAttribute;
}

function parseRegularAttribute(r: Reader): Attribute {
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
      value = { type: 'Expr', code: inner.code.trim(), loc: locFrom(inner.start, inner.end) };
      endTok = inner.end;
    } else {
      throw new Error('Expected attribute value');
    }
  }
  return { type: 'Attribute', name: nameTok.image, value, loc: locFrom(nameTok, endTok) } as Attribute;
}

export function parseAttribute(r: Reader): Attribute | ShorthandAttribute | SpreadAttribute {
  if (r.match('LBrace')) {
    const lb = r.next(); // '{'
    // detect '...'
    let dots = 0;
    while (r.match('Dot')) { r.next(); dots++; }
    if (dots === 3) {
      return parseSpreadAttribute(r, lb);
    }
    return parseShorthandAttribute(r, lb);
  }
  return parseRegularAttribute(r);
}
