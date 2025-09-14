import type { Position } from '@owt/ast';
import { SourceMapBuilder } from './sourcemap';

export class CodeBuilder {
  private readonly parts: string[] = [];
  private line = 1; // 1-based for humans; map uses 0-based
  private column = 0;
  constructor(private readonly filename: string, private readonly source: string, public map = new SourceMapBuilder(filename, source)) {}

  add(str: string, original?: Position) {
    if (original) {
      this.map.addMapping(this.line - 1, this.column, (original.line ?? 1) - 1, (original.column ?? 1) - 1);
    }
    this.parts.push(str);
    // update line/column counters
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      if (ch === 10 /* \n */) { this.line++; this.column = 0; } else { this.column++; }
    }
  }

  addLine(line: string, original?: Position) {
    this.add(line, original);
    this.add('\n');
  }

  toString(): string { return this.parts.join(''); }
}
