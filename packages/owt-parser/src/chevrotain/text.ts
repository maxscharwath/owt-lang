import type { IToken } from 'chevrotain';
import { Reader, emitBetween } from './reader.js';

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
    acc += emitBetween(acc, last);
  }
  if (acc.trim() === '') return null;
  return { value: acc, start, end: last };
}

