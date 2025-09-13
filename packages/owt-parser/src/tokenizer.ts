import type { Position } from '@owt/ast';
import { advancePos } from './utils/pos';

export type TokenType =
  | 'lt' // <
  | 'gt' // >
  | 'slash' // /
  | 'equals' // =
  | 'lbrace' // {
  | 'rbrace' // }
  | 'lparen' // (
  | 'rparen' // )
  | 'lbracket' // [
  | 'rbracket' // ]
  | 'comma' // ,
  | 'dot' // .
  | 'string' // "..." or '...'
  | 'name' // identifier or tag name
  | 'text' // raw text
  | 'keyword' // reserved keyword like component/var/val/if/else/for/empty/switch/case/default/slot/export
  | 'eof';

export type Token =
  | { type: TokenType; start: Position; end: Position }
  | { type: TokenType; value: string; start: Position; end: Position };

const KEYWORDS = new Set([
  'export',
  'component',
  'var',
  'val',
  'if',
  'else',
  'for',
  'empty',
  'switch',
  'case',
  'default',
  'slot',
]);

export class Tokenizer {
  private i = 0;
  private line = 1;
  private column = 1;

  constructor(private input: string) {}

  private make(start: Position, end: Position, type: TokenType, value?: string): Token {
    if (value !== undefined) {
      return { type, value, start, end };
    }
    return { type, start, end } as Token;
  }

  private eof(): boolean {
    return this.i >= this.input.length;
  }

  private peekChar(): string {
    return this.input[this.i] ?? '';
  }

  private nextChar(): string {
    const ch = this.input[this.i] ?? '';
    const advanced = advancePos(this.input, this.i, 1, this.line, this.column);
    this.i = advanced.offset;
    this.line = advanced.line;
    this.column = advanced.column;
    return ch;
  }

  private pos(): Position {
    return { offset: this.i, line: this.line, column: this.column };
  }

  private isIdentStart(ch: string): boolean {
    return /[A-Za-z_]/.test(ch);
  }

  private isIdentContinue(ch: string): boolean {
    return /[A-Za-z0-9_\-]/.test(ch);
  }

  private readWhile(pred: (ch: string) => boolean): string {
    let s = '';
    while (!this.eof() && pred(this.peekChar())) {
      s += this.nextChar();
    }
    return s;
  }

  private skipWhitespace(): void {
    this.readWhile((ch) => /[ \t\r\n]/.test(ch));
  }

  private readString(quote: '"' | "'") {
    const start = this.pos();
    this.nextChar(); // consume quote
    let out = '';
    while (!this.eof()) {
      const ch = this.nextChar();
      if (ch === quote) break;
      if (ch === '\\') {
        const n = this.nextChar();
        out += '\\' + n; // keep escapes as-is
      } else {
        out += ch;
      }
    }
    const end = this.pos();
    return this.make(start, end, 'string', out);
  }

  private readNameOrKeyword() {
    const start = this.pos();
    let value = this.readWhile((ch) => this.isIdentContinue(ch));
    // Special-case HTML-like tag names that start with a letter
    const type: TokenType = KEYWORDS.has(value) ? 'keyword' : 'name';
    const end = this.pos();
    return this.make(start, end, type, value);
  }

  private readTextNode() {
    const start = this.pos();
    let value = '';
    while (!this.eof()) {
      const ch = this.peekChar();
      // Stop on any character that should be handled as its own token,
      // otherwise we risk swallowing important delimiters like ')', '}' etc.
      if (
        ch === '<' || ch === '>' || ch === '/' || ch === '=' ||
        ch === '{' || ch === '}' || ch === '(' || ch === ')' ||
        ch === '[' || ch === ']' || ch === ',' || ch === '.' ||
        ch === '"' || ch === "'"
      ) break;
      value += this.nextChar();
    }
    const end = this.pos();
    return this.make(start, end, 'text', value);
  }

  public next(): Token {
    this.skipWhitespace();
    const start = this.pos();
    if (this.eof()) return this.make(start, start, 'eof');
    const ch = this.peekChar();
    // Single-char punctuators
    if (ch === '<') {
      this.nextChar();
      return this.make(start, this.pos(), 'lt');
    }
    if (ch === '>') {
      this.nextChar();
      return this.make(start, this.pos(), 'gt');
    }
    if (ch === '/') {
      this.nextChar();
      return this.make(start, this.pos(), 'slash');
    }
    if (ch === '=') {
      this.nextChar();
      return this.make(start, this.pos(), 'equals');
    }
    if (ch === '{') {
      this.nextChar();
      return this.make(start, this.pos(), 'lbrace');
    }
    if (ch === '}') {
      this.nextChar();
      return this.make(start, this.pos(), 'rbrace');
    }
    if (ch === '(') {
      this.nextChar();
      return this.make(start, this.pos(), 'lparen');
    }
    if (ch === ')') {
      this.nextChar();
      return this.make(start, this.pos(), 'rparen');
    }
    if (ch === '[') {
      this.nextChar();
      return this.make(start, this.pos(), 'lbracket');
    }
    if (ch === ']') {
      this.nextChar();
      return this.make(start, this.pos(), 'rbracket');
    }
    if (ch === ',') {
      this.nextChar();
      return this.make(start, this.pos(), 'comma');
    }
    if (ch === '.') {
      this.nextChar();
      return this.make(start, this.pos(), 'dot');
    }
    if (ch === '"' || ch === "'") {
      return this.readString(ch as '"' | "'");
    }
    if (this.isIdentStart(ch)) {
      return this.readNameOrKeyword();
    }
    // Fallback: text until a structural token
    return this.readTextNode();
  }
}
