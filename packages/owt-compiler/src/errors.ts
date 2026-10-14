import { LineMap, codeFrame, type Diagnostic } from '@owt/ast';
import type { IgnoreRange } from './ignore';

/** Error thrown by `compile()`; shaped for Vite's error overlay (`loc`, `frame`). */
export class CompileError extends Error {
  readonly code: string;
  readonly start: number;
  readonly end: number;
  readonly loc: { file: string; line: number; column: number };
  readonly frame: string;
  readonly plugin = 'owt';

  constructor(diagnostic: Pick<Diagnostic, 'code' | 'message' | 'start' | 'end'>, source: string, filename: string) {
    super(diagnostic.message);
    this.name = 'OwtCompileError';
    this.code = diagnostic.code;
    this.start = diagnostic.start;
    this.end = diagnostic.end;
    const pos = new LineMap(source).position(diagnostic.start);
    this.loc = { file: filename, line: pos.line, column: pos.column };
    this.frame = codeFrame(source, diagnostic.start, diagnostic.end);
    this.message = `${diagnostic.message} (${filename}:${pos.line}:${pos.column + 1})`;
  }
}

/** Collects compile-time diagnostics; the first error aborts compilation. */
export class Reporter {
  readonly warnings: Diagnostic[] = [];
  constructor(
    private readonly source: string,
    private readonly filename: string,
    /** where `<!-- owt-ignore code -->` comments silence warnings */
    private readonly ignores: readonly IgnoreRange[] = [],
  ) {}

  error(code: string, message: string, start: number, end = start + 1): never {
    throw new CompileError({ code, message, start, end }, this.source, this.filename);
  }

  warn(code: string, message: string, start: number, end = start + 1): void {
    if (this.ignores.some((r) => start >= r.start && start < r.end && r.codes.includes(code))) return;
    this.warnings.push({ code, message, start, end, severity: 'warning' });
  }
}
