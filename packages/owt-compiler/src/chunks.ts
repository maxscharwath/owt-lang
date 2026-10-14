/**
 * Generated code is assembled as a tree of chunks. Plain strings are
 * generated code; `Mapped` chunks carry a source map back into the `.owt`
 * file (transformed user code); `Origin` chunks map their first character to
 * a source offset. `CodeWriter` flattens the tree and builds the source map.
 */
import { GenMapping, addSegment, setSourceContent, toEncodedMap } from '@jridgewell/gen-mapping';
import { LineMap } from '@owt/ast';

/** Source map v3, in the shape bundlers (Vite, Rollup, Rolldown, esbuild) accept. */
export type SourceMap = {
  version: 3;
  file?: string;
  names: string[];
  sources: string[];
  sourcesContent?: (string | null)[];
  mappings: string;
};

/** Decoded mappings relative to the fragment: [genColumn, sourceLine, sourceColumn] per segment. */
export type FragmentSegments = number[][][];

export type Mapped = {
  kind: 'mapped';
  code: string;
  /** offset of the fragment start in the original source */
  origin: number;
  /** per generated line: segments [genCol, srcLineDelta, srcCol(abs for delta>0, relative for delta 0)] */
  segments: FragmentSegments;
};

export type Origin = { kind: 'origin'; code: string; at: number };

export type Chunk = string | Mapped | Origin | Chunk[];

export function origin(code: string, at: number): Origin {
  return { kind: 'origin', code, at };
}

/** Join chunks with a separator. */
export function join(chunks: readonly Chunk[], separator: string): Chunk[] {
  const out: Chunk[] = [];
  chunks.forEach((c, i) => {
    if (i > 0) out.push(separator);
    out.push(c);
  });
  return out;
}

/** Flatten to plain text (no mappings). */
export function text(chunk: Chunk): string {
  if (typeof chunk === 'string') return chunk;
  if (Array.isArray(chunk)) {
    let out = '';
    for (const c of chunk) out += text(c);
    return out;
  }
  return chunk.code;
}

export function isEmpty(chunk: Chunk): boolean {
  if (typeof chunk === 'string') return chunk.length === 0;
  if (Array.isArray(chunk)) return chunk.every(isEmpty);
  return chunk.code.length === 0;
}

export class CodeWriter {
  private readonly parts: string[] = [];
  private line = 0;
  private column = 0;
  private readonly map: GenMapping;
  private readonly lines: LineMap;

  constructor(
    private readonly filename: string,
    source: string,
  ) {
    this.map = new GenMapping({ file: filename.split('/').pop() ?? filename });
    setSourceContent(this.map, filename, source);
    this.lines = new LineMap(source);
  }

  write(chunk: Chunk): void {
    if (typeof chunk === 'string') {
      this.emit(chunk);
    } else if (Array.isArray(chunk)) {
      for (const c of chunk) this.write(c);
    } else if (chunk.kind === 'origin') {
      const pos = this.lines.position(chunk.at);
      addSegment(this.map, this.line, this.column, this.filename, pos.line - 1, pos.column);
      this.emit(chunk.code);
    } else {
      this.writeMapped(chunk);
    }
  }

  private writeMapped(chunk: Mapped): void {
    const base = this.lines.position(chunk.origin);
    const startLine = this.line;
    const startColumn = this.column;
    chunk.segments.forEach((segments, genLine) => {
      for (const seg of segments) {
        const genCol = seg[0]!;
        const srcLineDelta = seg[1]!;
        const srcCol = seg[2]!;
        const line = base.line - 1 + srcLineDelta;
        const column = srcLineDelta === 0 ? base.column + srcCol : srcCol;
        addSegment(this.map, startLine + genLine, genLine === 0 ? startColumn + genCol : genCol, this.filename, line, column);
      }
    });
    this.emit(chunk.code);
  }

  private emit(code: string): void {
    if (code.length === 0) return;
    this.parts.push(code);
    let nl = code.lastIndexOf('\n');
    if (nl < 0) {
      this.column += code.length;
      return;
    }
    let count = 0;
    for (let i = 0; i < code.length; i++) if (code.charCodeAt(i) === 10) count++;
    this.line += count;
    this.column = code.length - nl - 1;
    nl = 0;
  }

  toString(): string {
    return this.parts.join('');
  }

  toMap(): SourceMap {
    const map = toEncodedMap(this.map);
    const out: SourceMap = { version: 3, names: [...map.names], sources: map.sources.map((s) => s ?? ''), mappings: map.mappings };
    if (typeof map.file === 'string') out.file = map.file;
    if (map.sourcesContent !== undefined) out.sourcesContent = [...map.sourcesContent];
    return out;
  }
}
