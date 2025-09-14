import type { Expr } from '@owt/ast';
import { Reader, readBalanced } from './reader';
import { locFrom } from './loc';

export function readParensExpr(r: Reader): Expr {
  const { code, start, end } = readBalanced(r, 'LParen', 'RParen');
  return { type: 'Expr', code: code.trim(), loc: locFrom(start, end) } as Expr;
}

export function readBracesExpr(r: Reader): Expr {
  const { code, start, end } = readBalanced(r, 'LBrace', 'RBrace');
  return { type: 'Expr', code: code.trim(), loc: locFrom(start, end) } as Expr;
}
