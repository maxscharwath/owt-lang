import type { IToken } from 'chevrotain';
import type { Position, Location } from '@owt/ast';

export function pos(tok: IToken): Position {
  return {
    offset: (tok.startOffset ?? 0),
    line: (tok.startLine ?? 1),
    column: (tok.startColumn ?? 1),
  } as Position;
}

export function locFrom(start: IToken, end: IToken): Location {
  return {
    start: pos(start),
    end: {
      offset: (end.endOffset ?? end.startOffset ?? 0),
      line: (end.endLine ?? end.startLine ?? 1),
      column: (end.endColumn ?? end.startColumn ?? 1),
    },
  } as Location;
}

export function locFromWithComments(start: IToken, end: IToken, comments: IToken[] | undefined): Location {
  let endTok: IToken = end;
  if (comments && comments.length) {
    const endLine = (end.endLine ?? end.startLine ?? 0);
    const endOff = (end.endOffset ?? end.startOffset ?? 0);
    const sameLineTrailing = comments.filter((c) => {
      const nm = c.tokenType?.name ?? '';
      if ((c.startLine ?? 0) !== endLine) return false;
      if ((c.startOffset ?? 0) < endOff) return false;
      return nm === 'LineComment' || nm === 'BlockComment';
    });
    if (sameLineTrailing.length) {
      sameLineTrailing.sort((a, b) => ((b.endOffset ?? 0) - (a.endOffset ?? 0)));
      endTok = sameLineTrailing[0]!;
    }
  }
  return locFrom(start, endTok);
}
