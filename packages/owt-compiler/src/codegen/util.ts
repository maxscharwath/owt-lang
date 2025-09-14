import type { Expr, Text } from '@owt/ast';

export function genExpr(expr: Expr): string {
  return `(${expr.code})`;
}

export function genText(text: Text): string {
  return `document.createTextNode(${JSON.stringify(text.value)})`;
}

export function simpleVarFromExpr(expr: Expr): string | null {
  const code = expr.code.trim();
  if (/^[A-Za-z_$][\w$]*$/.test(code)) {
    return code;
  }
  return null;
}

