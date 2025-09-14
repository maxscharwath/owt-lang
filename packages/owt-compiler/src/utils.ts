import type { Expr } from '@owt/ast';

export function escapeText(text: string): string {
  return text.replace(/`/g, '\\`');
}

export function toIterable(expr: Expr): string {
  let c = expr.code.trim();
  let reversed = false;
  // Support `rev` keyword before the iterable/range
  if (c.startsWith('rev ')) {
    reversed = true;
    c = c.slice(4).trim();
  }
  const idx = c.indexOf('..');
  if (idx >= 0) {
    const left = c.slice(0, idx).trim();
    const right = c.slice(idx + 2).trim();
    const base = `range((${left}), (${right}))`;
    return reversed ? `rev(${base})` : base;
  }
  // Non-range iterable; if `rev` present, reverse the iterable
  const base = `(${c})`;
  return reversed ? `rev(${base})` : base;
}

export function processImportLines(source: string): string[] {
  const lines = (source.match(/^\s*import\s+[^;\n]+;?/gm) || []);
  // Drop type-only imports so output remains valid JS
  return lines.filter(l => !/^\s*import\s+type\b/.test(l));
}
