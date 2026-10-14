/**
 * A small JavaScript/TypeScript tokenizer. It does not build an AST: it only
 * knows enough (strings, template literals, regular expressions, comments,
 * brackets) to find where an embedded piece of code ends inside a `.owt` file.
 * The code itself is parsed by Babel afterwards.
 */

export type TokenKind = 'ident' | 'number' | 'string' | 'template' | 'regex' | 'punct' | 'private' | 'eof';

export type Token = {
  kind: TokenKind;
  start: number;
  end: number;
  value: string;
  /** a line break precedes this token */
  nl: boolean;
};

const PUNCTUATORS = [
  '>>>=',
  '...',
  '===',
  '!==',
  '**=',
  '<<=',
  '>>=',
  '>>>',
  '&&=',
  '||=',
  '??=',
  '=>',
  '==',
  '!=',
  '<=',
  '>=',
  '&&',
  '||',
  '??',
  '?.',
  '++',
  '--',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '&=',
  '|=',
  '^=',
  '**',
  '<<',
  '>>',
];
const SINGLE_PUNCT = '{}()[];,<>+-*/%&|^!~?:=.@#';

/** Keywords after which a `/` starts a regular expression. */
const REGEX_AFTER_KEYWORDS = new Set([
  'return',
  'typeof',
  'instanceof',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'throw',
  'case',
  'do',
  'else',
  'yield',
  'await',
]);

export function isIdentStart(c: number): boolean {
  return (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || c === 95 || c === 36 || (c > 127 && !isSpace(c));
}

export function isIdentPart(c: number): boolean {
  return isIdentStart(c) || (c >= 48 && c <= 57);
}

export function isDigit(c: number): boolean {
  return c >= 48 && c <= 57;
}

export function isSpace(c: number): boolean {
  return c === 32 || c === 9 || c === 10 || c === 13 || c === 12 || c === 11 || c === 0xa0 || c === 0xfeff || c === 0x2028 || c === 0x2029;
}

export function isLineBreak(c: number): boolean {
  return c === 10 || c === 13 || c === 0x2028 || c === 0x2029;
}

/** Skip whitespace and JS comments. */
export function skipTrivia(src: string, pos: number, end = src.length): number {
  while (pos < end) {
    const c = src.charCodeAt(pos);
    if (isSpace(c)) {
      pos++;
    } else if (c === 47 && src.charCodeAt(pos + 1) === 47) {
      pos += 2;
      while (pos < end && !isLineBreak(src.charCodeAt(pos))) pos++;
    } else if (c === 47 && src.charCodeAt(pos + 1) === 42) {
      const close = src.indexOf('*/', pos + 2);
      pos = close < 0 ? end : close + 2;
    } else {
      break;
    }
  }
  return pos;
}

/** Skip whitespace only (no comments). */
export function skipSpaces(src: string, pos: number, end = src.length): number {
  while (pos < end && isSpace(src.charCodeAt(pos))) pos++;
  return pos;
}

export function readIdentifier(src: string, pos: number): string {
  if (!isIdentStart(src.charCodeAt(pos))) return '';
  let end = pos + 1;
  while (end < src.length && isIdentPart(src.charCodeAt(end))) end++;
  return src.slice(pos, end);
}

export class JsScanner {
  pos: number;
  private prev: Token | null = null;

  constructor(
    readonly src: string,
    pos: number,
    readonly end = src.length,
  ) {
    this.pos = pos;
  }

  /** Read the next token. */
  next(): Token {
    const src = this.src;
    const start0 = this.pos;
    this.pos = skipTrivia(src, this.pos, this.end);
    let nl = false;
    for (let i = start0; i < this.pos; i++) {
      if (isLineBreak(src.charCodeAt(i))) {
        nl = true;
        break;
      }
    }
    const start = this.pos;
    if (start >= this.end) return this.emit('eof', start, start, nl);
    const c = src.charCodeAt(start);

    if (isIdentStart(c)) {
      let end = start + 1;
      while (end < this.end && isIdentPart(src.charCodeAt(end))) end++;
      return this.emit('ident', start, end, nl);
    }
    if (isDigit(c) || (c === 46 && isDigit(src.charCodeAt(start + 1)) && src.charCodeAt(start - 1) !== 46)) {
      return this.emit('number', start, this.scanNumber(start), nl);
    }
    if (c === 34 || c === 39) return this.emit('string', start, this.scanString(start), nl);
    if (c === 96) return this.emit('template', start, this.scanTemplate(start), nl);
    if (c === 35 && isIdentStart(src.charCodeAt(start + 1))) {
      let end = start + 2;
      while (end < this.end && isIdentPart(src.charCodeAt(end))) end++;
      return this.emit('private', start, end, nl);
    }
    if (c === 47 && this.regexAllowed()) {
      const end = this.scanRegex(start);
      if (end > 0) return this.emit('regex', start, end, nl);
    }
    for (const p of PUNCTUATORS) {
      if (src.startsWith(p, start)) return this.emit('punct', start, start + p.length, nl);
    }
    if (SINGLE_PUNCT.includes(src[start]!)) return this.emit('punct', start, start + 1, nl);
    // unknown character: treat as a single punctuator so scanning always advances
    return this.emit('punct', start, start + 1, nl);
  }

  peek(): Token {
    const pos = this.pos;
    const prev = this.prev;
    const tok = this.next();
    this.pos = pos;
    this.prev = prev;
    return tok;
  }

  private emit(kind: TokenKind, start: number, end: number, nl: boolean): Token {
    this.pos = end;
    const tok: Token = { kind, start, end, value: this.src.slice(start, end), nl };
    if (kind !== 'eof') this.prev = tok;
    return tok;
  }

  private regexAllowed(): boolean {
    const prev = this.prev;
    if (prev === null) return true;
    if (prev.kind === 'punct') return prev.value !== ')' && prev.value !== ']' && prev.value !== '++' && prev.value !== '--';
    if (prev.kind === 'ident') return REGEX_AFTER_KEYWORDS.has(prev.value);
    return false;
  }

  private scanNumber(start: number): number {
    const src = this.src;
    let end = start;
    while (end < this.end) {
      const c = src.charCodeAt(end);
      if (c === 46) {
        // `1..5` ranges: stop before `..`
        if (src.charCodeAt(end + 1) === 46) break;
        end++;
      } else if (isIdentPart(c)) {
        end++;
        // exponent sign
        if ((c === 101 || c === 69) && (src.charCodeAt(end) === 43 || src.charCodeAt(end) === 45) && !src.startsWith('0x', start)) end++;
      } else {
        break;
      }
    }
    return end;
  }

  private scanString(start: number): number {
    const src = this.src;
    const quote = src.charCodeAt(start);
    let i = start + 1;
    while (i < this.end) {
      const c = src.charCodeAt(i);
      if (c === 92) i += 2;
      else if (c === quote) return i + 1;
      else if (c === 10) return i; // unterminated
      else i++;
    }
    return this.end;
  }

  /** Scan a template literal including nested `${...}` expressions. */
  scanTemplate(start: number): number {
    const src = this.src;
    let i = start + 1;
    while (i < this.end) {
      const c = src.charCodeAt(i);
      if (c === 92) {
        i += 2;
      } else if (c === 96) {
        return i + 1;
      } else if (c === 36 && src.charCodeAt(i + 1) === 123) {
        const close = findClosing(src, i + 1, this.end);
        if (close < 0) return this.end;
        i = close + 1;
      } else {
        i++;
      }
    }
    return this.end;
  }

  private scanRegex(start: number): number {
    const src = this.src;
    let i = start + 1;
    let inClass = false;
    while (i < this.end) {
      const c = src.charCodeAt(i);
      if (isLineBreak(c)) return -1;
      if (c === 92) {
        i += 2;
        continue;
      }
      if (c === 91) inClass = true;
      else if (c === 93) inClass = false;
      else if (c === 47 && !inClass) {
        i++;
        while (i < this.end && isIdentPart(src.charCodeAt(i))) i++;
        return i;
      }
      i++;
    }
    return -1;
  }
}

const OPEN = new Set(['(', '[', '{']);
const CLOSE = new Set([')', ']', '}']);

/**
 * `pos` points at `(`, `[` or `{`: return the offset of the matching closer,
 * or -1 if the code ends first.
 */
export function findClosing(src: string, pos: number, end = src.length): number {
  const scanner = new JsScanner(src, pos + 1, end);
  let depth = 1;
  for (;;) {
    const tok = scanner.next();
    if (tok.kind === 'eof') return -1;
    if (tok.kind !== 'punct') continue;
    if (OPEN.has(tok.value)) depth++;
    else if (CLOSE.has(tok.value)) {
      depth--;
      if (depth === 0) return tok.start;
    }
  }
}

/** Tokens after which a statement obviously continues on the next line. */
const CONTINUE_AFTER = new Set([
  '=',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '**=',
  '<<=',
  '>>=',
  '>>>=',
  '&=',
  '|=',
  '^=',
  '&&=',
  '||=',
  '??=',
  '=>',
  '==',
  '===',
  '!=',
  '!==',
  '<=',
  '>=',
  '&&',
  '||',
  '??',
  '+',
  '-',
  '*',
  '/',
  '%',
  '**',
  '&',
  '|',
  '^',
  '<<',
  '>>',
  '>>>',
  '~',
  ',',
  '.',
  '?.',
  '?',
  ':',
  '...',
  '@',
]);
// note: `!` is not listed: a line ending with TypeScript's non-null `x!` ends the statement

const CONTINUE_AFTER_WORDS = new Set([
  'new',
  'typeof',
  'void',
  'delete',
  'await',
  'yield',
  'in',
  'of',
  'instanceof',
  'extends',
  'implements',
  'as',
  'satisfies',
  'keyof',
  'case',
  'export',
  'import',
  'const',
  'let',
  'var',
  'function',
  'class',
  'interface',
  'enum',
  'else',
  'do',
]);

/** Tokens that continue the previous line's statement when they start a line. */
const CONTINUE_BEFORE = new Set([
  '.',
  '?.',
  '?',
  ':',
  ',',
  '=',
  '==',
  '===',
  '!=',
  '!==',
  '<=',
  '>=',
  '>',
  '&&',
  '||',
  '??',
  '&',
  '|',
  '^',
  '*',
  '**',
  '/',
  '%',
  '+',
  '-',
  '=>',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '**=',
  '<<',
  '>>',
  '>>>',
  '<<=',
  '>>=',
  '>>>=',
  '&=',
  '|=',
  '^=',
  '&&=',
  '||=',
  '??=',
]);

const CONTINUE_BEFORE_WORDS = new Set(['as', 'satisfies', 'instanceof', 'in', 'of', 'extends', 'implements', 'from']);

/** Statements whose body brace may sit on the next line (Allman style). */
const BLOCK_STATEMENT_STARTS = new Set(['function', 'async', 'class', 'interface', 'enum', 'namespace', 'module', 'declare', 'abstract', 'export', 'type']);

function continues(first: Token | null, beforeLast: Token | null, last: Token, next: Token): boolean {
  if (last.kind === 'punct' && CONTINUE_AFTER.has(last.value)) return true;
  const isMember = beforeLast !== null && beforeLast.kind === 'punct' && (beforeLast.value === '.' || beforeLast.value === '?.');
  // `x as const` is complete: `const` only continues when it starts a declaration
  const asConst = last.value === 'const' && beforeLast !== null && beforeLast.kind === 'ident' && beforeLast.value === 'as';
  if (last.kind === 'ident' && !isMember && !asConst && CONTINUE_AFTER_WORDS.has(last.value)) return true;
  if (next.kind === 'punct') {
    if (CONTINUE_BEFORE.has(next.value)) return true;
    if (next.value === '{') return first !== null && first.kind === 'ident' && BLOCK_STATEMENT_STARTS.has(first.value);
    return false;
  }
  if (next.kind === 'ident') return CONTINUE_BEFORE_WORDS.has(next.value);
  return false;
}

/**
 * Find the end of a statement in an OWT component body. Follows JavaScript's
 * automatic semicolon insertion, with one OWT rule: a line starting with `(`,
 * `[`, a template literal, `{` or markup always starts something new.
 * Returns the end offset (after the `;` if there is one).
 */
export function scanStatementEnd(src: string, pos: number, end = src.length): number {
  const scanner = new JsScanner(src, pos, end);
  let depth = 0;
  let first: Token | null = null;
  let beforeLast: Token | null = null;
  let last: Token | null = null;
  for (;;) {
    const tok = scanner.peek();
    if (tok.kind === 'eof') return last === null ? pos : last.end;
    if (depth === 0) {
      if (tok.kind === 'punct' && CLOSE.has(tok.value)) return last === null ? tok.start : last.end;
      if (last !== null && tok.nl && !continues(first, beforeLast, last, tok)) return last.end;
    }
    scanner.next();
    first ??= tok;
    beforeLast = last;
    if (tok.kind === 'punct') {
      if (OPEN.has(tok.value)) depth++;
      else if (CLOSE.has(tok.value)) depth--;
      else if (tok.value === ';' && depth === 0) return tok.end;
    }
    last = tok;
  }
}

/**
 * Split `text` (a for-header part, attribute list...) at top-level occurrences
 * of the given punctuators. Returns token-boundary offsets.
 */
export function findTopLevel(src: string, start: number, end: number, accept: (tok: Token) => boolean): Token | null {
  const scanner = new JsScanner(src, start, end);
  let depth = 0;
  for (;;) {
    const tok = scanner.next();
    if (tok.kind === 'eof') return null;
    if (depth === 0 && accept(tok)) return tok;
    if (tok.kind === 'punct') {
      if (OPEN.has(tok.value)) depth++;
      else if (CLOSE.has(tok.value)) depth--;
    }
  }
}

/** Tokenize a range (used for small headers). */
export function tokenize(src: string, start: number, end: number): Token[] {
  const scanner = new JsScanner(src, start, end);
  const out: Token[] = [];
  for (;;) {
    const tok = scanner.next();
    if (tok.kind === 'eof') return out;
    out.push(tok);
  }
}
