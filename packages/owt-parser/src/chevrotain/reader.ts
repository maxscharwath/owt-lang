import type { IToken } from 'chevrotain';

export type Tok = IToken;

export class Reader {
  constructor(public tokens: Tok[], public comments: Tok[] = [], public source?: string) {}
  i = 0;
  eof(): boolean { return this.i >= this.tokens.length; }
  peek(offset = 0): Tok {
    const idx = Math.min(this.i + offset, this.tokens.length - 1);
    return this.tokens[idx] as Tok;
  }
  next(): Tok { return this.tokens[this.i++] as Tok; }
  is(t: Tok, name: string): boolean { return (t.tokenType?.name ?? '') === name; }
  match(name: string): boolean { return this.is(this.peek(), name); }
}

function isWord(tok: Tok): boolean {
  const n = tok.tokenType?.name;
  return n === 'Identifier' || n === 'StringLiteral' || n === 'NumberLiteral';
}

export function emitBetween(prev: string, tok: Tok): string {
  const s = tok.image ?? '';
  if (!prev) return s;
  const a = prev.charAt(prev.length - 1);
  
  // Don't add space for property access chains (e.g., e.target.value)
  const prevWasDot = a === '.';
  const currentIsDot = tok.tokenType?.name === 'Dot';
  const isPropertyAccess = prevWasDot || currentIsDot;
  
  // Only add space if it's a word token after another word token, and it's not property access
  if (isWord(tok) && /[A-Za-z0-9_\])}]/.test(a) && !isPropertyAccess) {
    return ' ' + s;
  }
  
  return s;
}

export function readBalanced(r: Reader, openName: string, closeName: string): { code: string; start: Tok; end: Tok } {
  const open = r.next();
  let depth = 1;
  let code = '';
  let last = open;
  while (!r.eof()) {
    const t = r.next();
    last = t;
    if (r.is(t, openName)) { 
      depth++; 
      code += t.image; 
      continue; 
    }
    if (r.is(t, closeName)) { 
      depth--; 
      if (depth === 0) break; 
      code += t.image; 
      continue; 
    }
    code += emitBetween(code, t);
  }
  return { code, start: open, end: last };
}
