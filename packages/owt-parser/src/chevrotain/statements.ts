import type { ElseBranch, Expr, ForBlock, FunctionDecl, IfBlock, IfBranch, Node, ValDecl, VarDecl } from '@owt/ast';
import { Reader, emitBetween } from './reader.js';
import { locFrom, pos } from './loc.js';
import { readParensExpr } from './expr.js';

// Simple, secure parsing that avoids ReDoS while being maintainable
function parseForHeader(input: string): { item: string; iterable: string; metaIdent: string | null; metaDestructuring?: string[] } | null {
  const trimmed = input.trim();
  
  // Find 'of' keyword using simple string search
  const ofIndex = trimmed.indexOf(' of ');
  if (ofIndex === -1) return null;
  
  // Extract and validate item name
  const itemPart = trimmed.substring(0, ofIndex).trim();
  if (!isValidIdentifier(itemPart)) return null;
  
  // Extract the rest after 'of'
  const afterOf = trimmed.substring(ofIndex + 4).trim();
  if (!afterOf) return null;
  
  // Check for meta parameter by looking for comma at the end
  // We need to find the comma that separates the iterable from the meta parameter
  // This is tricky because the meta parameter might contain commas (destructuring)
  let commaIndex = -1;
  let braceDepth = 0;
  
  for (let i = 0; i < afterOf.length; i++) {
    const char = afterOf[i];
    if (char === '{') braceDepth++;
    else if (char === '}') braceDepth--;
    else if (char === ',' && braceDepth === 0) {
      commaIndex = i;
      break;
    }
  }
  
  if (commaIndex !== -1) {
    // Has potential meta parameter
    const iterablePart = afterOf.substring(0, commaIndex).trim();
    const metaPart = afterOf.substring(commaIndex + 1).trim();
    
    if (!iterablePart) return null;
    
    // Check if meta part is destructuring pattern
    if (metaPart.startsWith('{') && metaPart.endsWith('}')) {
      // Destructuring pattern: { index, first, last } or {index,first,last}
      const destructuringContent = metaPart.slice(1, -1).trim();
      const destructuredProps = destructuringContent.split(',').map(prop => prop.trim()).filter(prop => prop);
      
      // Validate that all properties are valid identifiers
      for (const prop of destructuredProps) {
        if (!isValidIdentifier(prop)) return null;
      }
      
      return {
        item: itemPart,
        iterable: iterablePart,
        metaIdent: null,
        metaDestructuring: destructuredProps
      };
    } else if (isValidIdentifier(metaPart)) {
      // Simple identifier: meta
      return {
        item: itemPart,
        iterable: iterablePart,
        metaIdent: metaPart,
        metaDestructuring: undefined
      };
    } else {
      return null;
    }
  } else {
    // No meta parameter
    return {
      item: itemPart,
      iterable: afterOf,
      metaIdent: null,
      metaDestructuring: undefined
    };
  }
}

function isValidIdentifier(str: string): boolean {
  if (!str || str.length === 0) return false;
  
  // First character must be letter, underscore, or dollar sign
  const firstChar = str[0];
  if (!firstChar || !/[A-Za-z_$]/.test(firstChar)) return false;
  
  // Rest must be word characters
  for (let i = 1; i < str.length; i++) {
    const char = str[i];
    if (!char || !/[\w$]/.test(char)) return false;
  }
  
  return true;
}

function parseConsequent(r: Reader, parseStatementOrNode: (r: Reader) => Node | null): { consequent: Node[]; end: any } {
  const consequent: Node[] = [];
  while (!r.match('RBrace')) {
    const n = parseStatementOrNode(r);
    if (n) consequent.push(n);
  }
  const end = r.next(); // '}'
  return { consequent, end };
}

function parseElseIfBranch(r: Reader, parseStatementOrNode: (r: Reader) => Node | null, elseTok: any): IfBranch {
  r.next(); // 'if'
  const test = readParensExpr(r);
  r.next(); // '{'
  const { consequent, end } = parseConsequent(r, parseStatementOrNode);
  return { type: 'IfBranch', test, consequent, loc: locFrom(elseTok, end) } as IfBranch;
}

function parseElseBranch(r: Reader, parseStatementOrNode: (r: Reader) => Node | null, elseTok: any): ElseBranch {
  r.next(); // '{'
  const { consequent, end } = parseConsequent(r, parseStatementOrNode);
  return { type: 'ElseBranch', consequent, loc: locFrom(elseTok, end) } as ElseBranch;
}

export function parseIfBlock(r: Reader, parseStatementOrNode: (r: Reader) => Node | null): IfBlock {
  const ifTok = r.next(); // 'if'
  const test = readParensExpr(r);
  r.next(); // '{'
  const { consequent, end: consequentEnd } = parseConsequent(r, parseStatementOrNode);
  
  const branches: IfBranch[] = [{ type: 'IfBranch', test, consequent, loc: locFrom(ifTok, consequentEnd) } as IfBranch];
  let alternate: ElseBranch | null = null;
  
  while (r.match('ElseKw')) {
    const elseTok = r.next();
    if (r.match('IfKw')) {
      branches.push(parseElseIfBranch(r, parseStatementOrNode, elseTok));
    } else {
      alternate = parseElseBranch(r, parseStatementOrNode, elseTok);
      break;
    }
  }
  
  const end = alternate ? alternate.loc.end : branches[branches.length - 1]!.loc.end;
  return { type: 'IfBlock', branches, alternate, loc: { start: pos(ifTok), end } } as IfBlock;
}

export function parseForBlock(r: Reader, parseStatementOrNode: (r: Reader) => Node | null): ForBlock {
  const forTok = r.next(); // 'for'
  const par = readParensExpr(r); // contains item of iterable [, meta]
  // pattern: <item> of <expr> [ , <meta> ]
  const inside = par.code.trim();
  const parseResult = parseForHeader(inside);
  if (!parseResult) throw new Error('Invalid for(...) header');
  const { item, iterable: iterableCode, metaIdent, metaDestructuring } = parseResult;
  const iterable: Expr = { type: 'Expr', code: iterableCode, loc: par.loc } as any;
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
  return { type: 'ForBlock', item, iterable, metaIdent, metaDestructuring, body, empty, loc: locFrom(forTok, rb) } as ForBlock;
}

function skipTypeAnnotation(r: Reader): void {
  while (!r.eof() && !r.match('Equals') && !r.match('Semicolon') && !r.match('Lt') && !r.match('LBrace') && !r.match('IfKw') && !r.match('ForKw')) {
    r.next();
  }
}

function parseInitializer(r: Reader, start: any): Expr | null {
  if (!r.match('Equals')) return null;
  
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
  return { type: 'Expr', code: code.trim(), loc: locFrom(start, r.peek()) } as any;
}

export function parseVarVal(r: Reader): VarDecl | ValDecl {
  const isVar = r.match('VarKw');
  const start = r.next();
  const nameTok = r.next();
  if ((nameTok.tokenType?.name ?? '') !== 'Identifier') throw new Error('Expected identifier');
  
  skipTypeAnnotation(r);
  const init = parseInitializer(r, start);
  if (r.match('Semicolon')) r.next();
  
  if (isVar) {
    return { type: 'VarDecl', name: nameTok.image, init: init as any, loc: locFrom(start, init ? r.peek() : nameTok) } as VarDecl;
  } else {
    if (!init) throw new Error('val requires initializer');
    return { type: 'ValDecl', name: nameTok.image, init: init as any, loc: locFrom(start, r.peek()) } as ValDecl;
  }
}

function parseParameters(r: Reader): string {
  r.next(); // '('
  let depth = 0;
  let paramsCode = '';
  while (!r.eof()) {
    const t = r.peek();
    if (depth === 0 && t.tokenType?.name === 'RParen') break;
    const x = r.next();
    if (x.tokenType?.name === 'LParen' || x.tokenType?.name === 'LBrace' || x.tokenType?.name === 'LBracket') depth++;
    if (x.tokenType?.name === 'RParen' || x.tokenType?.name === 'RBrace' || x.tokenType?.name === 'RBracket') depth = Math.max(0, depth - 1);
    paramsCode += emitBetween(paramsCode, x);
  }
  r.next(); // ')'
  return paramsCode.trim();
}

function parseReturnType(r: Reader): string | undefined {
  if (!r.match('Colon')) return undefined;
  
  r.next(); // ':'
  let returnDepth = 0;
  let code = '';
  while (!r.eof()) {
    const t = r.peek();
    if (returnDepth === 0 && (t.tokenType?.name === 'LBrace' || t.tokenType?.name === 'Semicolon')) break;
    const x = r.next();
    if (x.tokenType?.name === 'LParen' || x.tokenType?.name === 'LBrace' || x.tokenType?.name === 'LBracket') returnDepth++;
    if (x.tokenType?.name === 'RParen' || x.tokenType?.name === 'RBrace' || x.tokenType?.name === 'RBracket') returnDepth = Math.max(0, returnDepth - 1);
    code += emitBetween(code, x);
  }
  return code.trim();
}

function parseFunctionBody(r: Reader): { bodyCode: string; end: any } {
  r.next(); // '{'
  let bodyDepth = 0;
  let bodyCode = '';
  while (!r.eof()) {
    const t = r.peek();
    if (bodyDepth === 0 && t.tokenType?.name === 'RBrace') break;
    const x = r.next();
    if (x.tokenType?.name === 'LParen' || x.tokenType?.name === 'LBrace' || x.tokenType?.name === 'LBracket') bodyDepth++;
    if (x.tokenType?.name === 'RParen' || x.tokenType?.name === 'RBrace' || x.tokenType?.name === 'RBracket') bodyDepth = Math.max(0, bodyDepth - 1);
    bodyCode += emitBetween(bodyCode, x);
  }
  const closingBrace = r.next(); // '}'
  return { bodyCode: bodyCode.trim(), end: closingBrace };
}

export function parseFunctionDecl(r: Reader): FunctionDecl {
  const start = r.next(); // 'function'
  const nameTok = r.next();
  if ((nameTok.tokenType?.name ?? '') !== 'Identifier') throw new Error('Expected function name');
  
  const params = parseParameters(r);
  const returnType = parseReturnType(r);
  const { bodyCode, end } = parseFunctionBody(r);
  
  const body: Expr = { type: 'Expr', code: bodyCode, loc: locFrom(start, end) } as any;
  
  return {
    type: 'FunctionDecl',
    name: nameTok.image,
    params,
    returnType,
    body,
    loc: locFrom(start, end)
  } as FunctionDecl;
}

// no stub needed; parser.ts provides the callback when invoking parseIfBlock/parseForBlock
