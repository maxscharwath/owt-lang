import type { IToken } from 'chevrotain';
import { Reader } from './reader.js';
import type { IToken as Tok } from 'chevrotain';

function isWordToken(tok: Tok): boolean {
  const n = tok.tokenType?.name ?? '';
  return n === 'Identifier' || n === 'StringLiteral' || n === 'NumberLiteral';
}

function emitBetweenText(prev: string, tok: Tok): string {
  const s = tok.image ?? '';
  if (!prev) return s;
  const name = tok.tokenType?.name ?? '';
  const a = prev.charAt(prev.length - 1);
  // Ensure spaces around hyphens when they appear in text
  if (name === 'Minus') return ' - ';
  // Add space between adjacent words/numbers
  if (isWordToken(tok) && /[A-Za-z0-9_\])}]/.test(a)) return ' ' + s;
  return s;
}

export function readTextRun(r: Reader): { value: string; start: IToken; end: IToken } | null {
  let acc = '';
  const start = r.peek();
  let last: IToken = start;
  while (!r.eof()) {
    const t = r.peek();
    const name = t.tokenType?.name ?? '';
    if (name === 'Lt' || name === 'LBrace') break;
    if (name === 'IfKw' || name === 'ForKw' || name === 'VarKw' || name === 'ValKw') break;
    last = r.next();
    acc += emitBetweenText(acc, last);
  }
  if (acc.trim() === '') return null;
  return { value: acc, start, end: last };
}
