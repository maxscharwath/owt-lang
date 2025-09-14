import type { IToken } from 'chevrotain';
import { Reader } from './reader';

function gapTextExcludingComments(r: Reader, startOff: number, endOff: number): string {
  if (!r.source || !r.comments?.length || endOff <= startOff) return r.source?.slice(startOff, endOff) ?? '';
  // Collect comments fully within the gap
  const cmts = r.comments
    .filter((c) => (c.startOffset ?? -1) >= startOff && (c.endOffset ?? (c.startOffset ?? -1)) < endOff)
    .sort((a, b) => (a.startOffset - b.startOffset));
  let out = '';
  let pos = startOff;
  for (const c of cmts) {
    const cStart = c.startOffset ?? pos;
    const cEnd = (c.endOffset ?? cStart) + 1;
    if (cStart > pos) out += r.source!.slice(pos, cStart);
    // drop comment content entirely
    pos = Math.max(pos, cEnd);
  }
  if (endOff > pos) out += r.source!.slice(pos, endOff);
  return out;
}

export function readTextRun(r: Reader): { value: string; start: IToken; end: IToken } | null {
  let value = '';
  let startTok: IToken | null = null;
  let lastTok: IToken | null = null;
  while (!r.eof()) {
    const t = r.peek();
    const name = t.tokenType?.name ?? '';
    if (name === 'Lt' || name === 'LBrace') break;
    if (name === 'IfKw' || name === 'ForKw' || name === 'VarKw' || name === 'ValKw') break;
    const curr = r.next();
    if (!startTok) {
      startTok = curr;
      // Include exact leading whitespace between previous token and the first text token
      if (r.source) {
        const arr = (r as any).tokens as IToken[];
        const currIdx = ((r as any).i as number) - 1; // index of curr in tokens
        const prevTok = arr?.[currIdx - 1];
        if (prevTok && (curr.startOffset ?? 0) > ((prevTok.endOffset ?? prevTok.startOffset ?? 0))) {
          const gapStart = (prevTok.endOffset ?? prevTok.startOffset ?? 0) + 1;
          const gapEnd = curr.startOffset ?? gapStart;
          if (gapEnd > gapStart) value += gapTextExcludingComments(r, gapStart, gapEnd);
        }
      }
      value += curr.image ?? '';
      lastTok = curr;
      continue;
    }
    if (r.source && lastTok) {
      const gapStart = ((lastTok.endOffset ?? lastTok.startOffset ?? 0) + 1);
      const gapEnd = (curr.startOffset ?? gapStart);
      if (gapEnd > gapStart) {
        value += gapTextExcludingComments(r, gapStart, gapEnd);
      }
      value += curr.image ?? '';
    } else {
      // Fallback when source is missing: append token images consecutively.
      // We avoid inserting any heuristic spaces to preserve author intent.
      value += curr.image ?? '';
    }
    lastTok = curr;
  }
  if (!startTok || !lastTok) return null;
  if (value.trim() === '') return null;
  return { value, start: startTok, end: lastTok };
}
