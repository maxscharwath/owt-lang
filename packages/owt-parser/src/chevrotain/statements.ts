import type { ElseBranch, Expr, ForBlock, IfBlock, IfBranch, Node, ValDecl, VarDecl } from '@owt/ast';
import { Reader, emitBetween } from './reader.js';
import { locFrom, pos } from './loc.js';
import { readParensExpr } from './expr.js';

export function parseIfBlock(r: Reader, parseStatementOrNode: (r: Reader) => Node | null): IfBlock {
  const ifTok = r.next(); // 'if'
  const test = readParensExpr(r);
  r.next(); // '{'
  const consequent: Node[] = [];
  while (!r.match('RBrace')) {
    const n = parseStatementOrNode(r);
    if (n) consequent.push(n);
  }
  const rb = r.next();
  const branches: IfBranch[] = [{ type: 'IfBranch', test, consequent, loc: locFrom(ifTok as any, rb as any) } as IfBranch];
  let alternate: ElseBranch | null = null;
  while (r.match('ElseKw')) {
    const elseTok = r.next();
    if (r.match('IfKw')) {
      r.next();
      const t2 = readParensExpr(r);
      r.next(); // '{'
      const cons2: Node[] = [];
      while (!r.match('RBrace')) { const n = parseStatementOrNode(r); if (n) cons2.push(n); }
      const rb2 = r.next();
      branches.push({ type: 'IfBranch', test: t2, consequent: cons2, loc: locFrom(elseTok as any, rb2 as any) } as IfBranch);
    } else {
      r.next(); // '{'
      const cons3: Node[] = [];
      while (!r.match('RBrace')) { const n = parseStatementOrNode(r); if (n) cons3.push(n); }
      const rb3 = r.next();
      alternate = { type: 'ElseBranch', consequent: cons3, loc: locFrom(elseTok as any, rb3 as any) } as ElseBranch;
      break;
    }
  }
  const end = (alternate ? (alternate as any).loc.end : branches[branches.length - 1]!.loc.end) as any;
  return { type: 'IfBlock', branches, alternate, loc: { start: pos(ifTok as any), end } } as IfBlock;
}

export function parseForBlock(r: Reader, parseStatementOrNode: (r: Reader) => Node | null): ForBlock {
  const forTok = r.next(); // 'for'
  const par = readParensExpr(r); // contains item of iterable [, meta]
  // pattern: <item> of <expr> [ , <meta> ]
  const inside = par.code.trim();
  const m = inside.match(/^([A-Za-z_$][\w$]*)\s+of\s+(.+?)(?:\s*,\s*([A-Za-z_$][\w$]*))?$/);
  if (!m) throw new Error('Invalid for(...) header');
  const item = m[1]!;
  const iterable: Expr = { type: 'Expr', code: (m[2] || '').trim(), loc: par.loc } as any;
  const metaIdent = m[3] ?? null;
  r.next(); // '{'
  const body: Node[] = [];
  while (!r.match('RBrace')) { const n = parseStatementOrNode(r); if (n) body.push(n); }
  const rb = r.next();
  let empty: Node[] | null = null;
  if (r.match('EmptyKw')) {
    r.next();
    r.next(); // '{'
    empty = [];
    while (!r.match('RBrace')) { const n = parseStatementOrNode(r); if (n) empty.push(n); }
    r.next();
  }
  return { type: 'ForBlock', item, iterable, metaIdent, body, empty, loc: locFrom(forTok as any, rb as any) } as ForBlock;
}

export function parseVarVal(r: Reader): VarDecl | ValDecl {
  const isVar = r.match('VarKw');
  const start = r.next();
  const nameTok = r.next();
  if ((nameTok.tokenType?.name ?? '') !== 'Identifier') throw new Error('Expected identifier');
  // skip optional type annotation up to '=' or ';' or block start
  while (!r.eof() && !r.match('Equals') && !r.match('Semicolon') && !r.match('Lt') && !r.match('LBrace') && !r.match('IfKw') && !r.match('ForKw')) {
    r.next();
  }
  let init: Expr | null = null;
  if (r.match('Equals')) {
    r.next();
    let depth = 0;
    let code = '';
    while (!r.eof()) {
      const t = r.peek();
      if (depth === 0 && (t.tokenType?.name === 'Semicolon' || t.tokenType?.name === 'Lt' || t.tokenType?.name === 'IfKw' || t.tokenType?.name === 'ForKw' || t.tokenType?.name === 'VarKw' || t.tokenType?.name === 'ValKw')) break;
      const x = r.next();
      if (x.tokenType?.name === 'LParen' || x.tokenType?.name === 'LBrace' || x.tokenType?.name === 'LBracket') depth++;
      if (x.tokenType?.name === 'RParen' || x.tokenType?.name === 'RBrace' || x.tokenType?.name === 'RBracket') depth = Math.max(0, depth - 1);
      code += emitBetween(code, x);
    }
    init = { type: 'Expr', code: code.trim(), loc: locFrom(start as any, r.peek() as any) } as any;
  }
  if (r.match('Semicolon')) r.next();
  if (isVar) {
    return { type: 'VarDecl', name: nameTok.image, init: init as any, loc: locFrom(start as any, (init ? (r.peek() as any) : (nameTok as any))) } as VarDecl;
  } else {
    if (!init) throw new Error('val requires initializer');
    return { type: 'ValDecl', name: nameTok.image, init: init as any, loc: locFrom(start as any, r.peek() as any) } as ValDecl;
  }
}

// no stub needed; parser.ts provides the callback when invoking parseIfBlock/parseForBlock
