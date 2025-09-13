import type { Position } from '@owt/ast';

export function makePos(offset: number, line: number, column: number): Position {
  return { offset, line, column };
}

export function advancePos(
  input: string,
  startOffset: number,
  count: number,
  startLine: number,
  startColumn: number,
): { offset: number; line: number; column: number } {
  let offset = startOffset;
  let line = startLine;
  let column = startColumn;
  for (let i = 0; i < count; i++) {
    const ch = input.charCodeAt(offset++);
    if (ch === 10 /* \n */) {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { offset, line, column };
}
