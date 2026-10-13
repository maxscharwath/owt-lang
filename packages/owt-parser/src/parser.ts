/**
 * OWT parser.
 *
 * A hand-written recursive-descent parser for the markup and control-flow
 * layer. Embedded TypeScript is delimited with `JsScanner` and parsed by Babel
 * at its real offset. The parser never throws: problems are collected in
 * `program.diagnostics` so editors get a usable tree for broken code.
 */
import { parse as babelParse, parseExpression as babelParseExpression, type ParserOptions } from '@babel/parser';
import type * as t from '@babel/types';
import type {
  Attribute,
  AttributeLike,
  AttributeValue,
  AwaitBlock,
  Body,
  Comment,
  ComponentDecl,
  ComponentItem,
  ComponentParams,
  Declarator,
  Diagnostic,
  DirectiveKind,
  Element,
  ElementKind,
  ExpressionTag,
  ForBlock,
  ForIterable,
  IfBlock,
  IfBranch,
  KeyBlock,
  NamedParam,
  Program,
  Script,
  SlotDefinition,
  Span,
  SpreadAttribute,
  StyleBlock,
  SwitchBlock,
  SwitchCase,
  TemplateNode,
  Text,
  TopLevelNode,
  TryBlock,
  ValDecl,
  VarDecl,
} from '@owt/ast';
import { LineMap } from '@owt/ast';
import {
  JsScanner,
  findClosing,
  findTopLevel,
  isIdentPart,
  isIdentStart,
  isLineBreak,
  isSpace,
  readIdentifier,
  scanStatementEnd,
  skipSpaces,
  skipTrivia,
  tokenize,
  type Token,
} from './js-scanner';

export type ParseOptions = {
  filename?: string;
};

/** HTML elements that never have children. */
export const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

const RAW_TEXT_ELEMENTS = new Set(['script', 'style']);
const DIRECTIVES = new Set<DirectiveKind>(['bind', 'class', 'style', 'use', 'on']);
const SPECIAL_ELEMENTS: Record<string, ElementKind> = {
  window: 'window',
  document: 'document',
  body: 'body',
  head: 'head',
};
const BLOCK_KEYWORDS = new Set(['if', 'for', 'switch', 'await', 'try', 'key']);
const RESERVED_PARAM_ERRORS = ['Unexpected keyword', 'Unexpected reserved word', 'cannot be used as an identifier'];

type ChildMode = 'element' | 'block' | 'code';

type ChildContext = {
  mode: ChildMode;
  /** open element names, innermost last */
  stack: string[];
  /** direct children of a component element may define slots */
  inComponent: boolean;
};

export function parse(source: string, options: ParseOptions = {}): Program {
  return new Parser(source, options).parseProgram();
}

class Parser {
  readonly diagnostics: Diagnostic[] = [];
  private readonly lines: LineMap;
  private readonly len: number;

  constructor(
    private readonly src: string,
    private readonly options: ParseOptions,
  ) {
    this.lines = new LineMap(src);
    this.len = src.length;
  }

  // -------------------------------------------------------------------------
  // Diagnostics & Babel helpers
  // -------------------------------------------------------------------------

  private error(code: string, message: string, start: number, end = start + 1): void {
    this.diagnostics.push({ code, message, start, end: Math.max(end, start), severity: 'error' });
  }

  private babelOptions(start: number): ParserOptions {
    const { line, column } = this.lines.position(Math.max(0, start));
    return {
      sourceType: 'module',
      plugins: ['typescript'],
      errorRecovery: true,
      startIndex: start,
      startLine: line,
      startColumn: column,
      attachComment: false,
      sourceFilename: this.options.filename ?? 'component.owt',
    };
  }

  private babelError(err: unknown, fallback: number): void {
    const e = err as { pos?: number; message?: string; reasonCode?: string };
    const message = stripPosition(e.message ?? String(err));
    const pos = typeof e.pos === 'number' ? e.pos : fallback;
    this.error(e.reasonCode ?? 'syntax-error', message, pos, pos + 1);
  }

  private reportBabelErrors(errors: readonly unknown[] | undefined, ignore?: (message: string) => boolean): void {
    for (const err of errors ?? []) {
      const message = (err as { message?: string }).message ?? '';
      if (ignore?.(message)) continue;
      this.babelError(err, 0);
    }
  }

  /** Parse the expression in [start, end). */
  private expression(start: number, end: number): t.Expression | null {
    const text = this.src.slice(start, end);
    if (text.trim() === '') {
      this.error('expected-expression', 'Expected an expression', start, Math.max(end, start + 1));
      return null;
    }
    try {
      const node = babelParseExpression(text, this.babelOptions(start)) as t.Expression & { errors?: unknown[] };
      this.reportBabelErrors(node.errors);
      return node;
    } catch (err) {
      this.babelError(err, start);
      return null;
    }
  }

  /** Parse statements in [start, end) (optionally replacing the first chars, e.g. `var` → `let`). */
  private statements(start: number, end: number, replaceHead?: string): t.Statement[] {
    let text = this.src.slice(start, end);
    if (replaceHead !== undefined) text = replaceHead + text.slice(replaceHead.length);
    try {
      const file = babelParse(text, this.babelOptions(start));
      this.reportBabelErrors(file.errors ?? undefined);
      return file.program.body;
    } catch (err) {
      this.babelError(err, start);
      return [];
    }
  }

  /** Parse `prefix + source[start, end) + suffix` where the prefix occupies the offsets before `start`. */
  private withPrefix(prefix: string, start: number, end: number, suffix: string): t.Statement | null {
    const text = prefix + this.src.slice(start, end) + suffix;
    try {
      const file = babelParse(text, this.babelOptions(start - prefix.length));
      this.reportBabelErrors(file.errors ?? undefined, (m) => RESERVED_PARAM_ERRORS.some((r) => m.includes(r)));
      return file.program.body[0] ?? null;
    } catch (err) {
      this.babelError(err, start);
      return null;
    }
  }

  /** Parse a binding pattern (identifier or destructuring) in [start, end). */
  private pattern(start: number, end: number): t.LVal | null {
    if (this.src.slice(start, end).trim() === '') return null;
    const stmt = this.withPrefix('let ', start, end, ' = 0');
    if (stmt === null || stmt.type !== 'VariableDeclaration') return null;
    return toLVal(stmt.declarations[0]?.id);
  }

  /** Parse a parameter list (without parentheses) in [start, end). */
  private params(start: number, end: number): t.FunctionDeclaration['params'] {
    const stmt = this.withPrefix('function _(', start, end, ') {}');
    if (stmt === null || stmt.type !== 'FunctionDeclaration') return [];
    return stmt.params;
  }

  // -------------------------------------------------------------------------
  // Program
  // -------------------------------------------------------------------------

  parseProgram(): Program {
    const body: TopLevelNode[] = [];
    const styles: StyleBlock[] = [];
    let segmentStart = 0;
    let scanner = new JsScanner(this.src, 0);
    let depth = 0;
    let prev: Token | null = null;

    const flush = (end: number) => {
      if (this.src.slice(segmentStart, end).trim() !== '') {
        const script: Script = { type: 'Script', start: segmentStart, end, statements: this.statements(segmentStart, end) };
        body.push(script);
      }
    };

    for (;;) {
      const tok = scanner.next();
      if (tok.kind === 'eof') break;
      const notMember = prev === null || prev.kind !== 'punct' || (prev.value !== '.' && prev.value !== '?.');
      if (depth === 0 && tok.kind === 'ident' && notMember && (tok.value === 'component' || tok.value === 'export')) {
        const header = this.componentHeader(tok.start);
        if (header !== null) {
          flush(tok.start);
          const component = this.parseComponent(tok.start, header);
          body.push(component);
          segmentStart = component.end;
          scanner = new JsScanner(this.src, component.end);
          prev = null;
          continue;
        }
      }
      if (depth === 0 && tok.kind === 'punct' && tok.value === '<' && (prev === null || tok.nl) && this.src.startsWith('style', tok.end)) {
        flush(tok.start);
        const node = this.parseElement(tok.start, { mode: 'code', stack: [], inComponent: false });
        if (node.type === 'StyleBlock') {
          body.push(node);
          styles.push(node);
        }
        segmentStart = node.end;
        scanner = new JsScanner(this.src, node.end);
        prev = null;
        continue;
      }
      if (tok.kind === 'punct') {
        if (tok.value === '(' || tok.value === '[' || tok.value === '{') depth++;
        else if (tok.value === ')' || tok.value === ']' || tok.value === '}') depth = Math.max(0, depth - 1);
      }
      prev = tok;
    }
    flush(this.len);
    return { type: 'Program', source: this.src, start: 0, end: this.len, body, styles, diagnostics: this.diagnostics };
  }

  /** `[export] [default] component Name` at `pos`: returns offsets or null. */
  private componentHeader(pos: number): { exported: boolean; isDefault: boolean; keywordEnd: number } | null {
    let p = pos;
    let exported = false;
    let isDefault = false;
    if (readIdentifier(this.src, p) === 'export') {
      exported = true;
      p = skipTrivia(this.src, p + 6);
      if (readIdentifier(this.src, p) === 'default') {
        isDefault = true;
        p = skipTrivia(this.src, p + 7);
      }
    }
    if (readIdentifier(this.src, p) !== 'component') return null;
    const afterKeyword = p + 9;
    const nameStart = skipTrivia(this.src, afterKeyword);
    if (nameStart === afterKeyword) return null;
    const name = readIdentifier(this.src, nameStart);
    if (name === '') return null;
    const after = skipTrivia(this.src, nameStart + name.length);
    const c = this.src[after];
    if (c !== '(' && c !== '<') return null;
    return { exported, isDefault, keywordEnd: afterKeyword };
  }

  // -------------------------------------------------------------------------
  // Components
  // -------------------------------------------------------------------------

  private parseComponent(start: number, header: { exported: boolean; isDefault: boolean; keywordEnd: number }): ComponentDecl {
    const src = this.src;
    const nameStart = skipTrivia(src, header.keywordEnd);
    const name = readIdentifier(src, nameStart);
    const nameSpan = { start: nameStart, end: nameStart + name.length };
    let pos = skipTrivia(src, nameSpan.end);

    let typeParams: Span | null = null;
    if (src[pos] === '<') {
      const close = this.findTypeParamsEnd(pos);
      typeParams = { start: pos, end: close };
      pos = skipTrivia(src, close);
    }

    let params: ComponentParams = { kind: 'none' };
    let paramsSpan: Span = { start: pos, end: pos };
    if (src[pos] === '(') {
      const close = findClosing(src, pos);
      if (close < 0) {
        this.error('unclosed-params', `Missing ')' after the parameters of component ${name}`, pos);
        return this.emptyComponent(start, name, nameSpan, header, typeParams);
      }
      paramsSpan = { start: pos, end: close + 1 };
      params = this.componentParams(pos + 1, close, name);
      pos = skipTrivia(src, close + 1);
    } else {
      this.error('expected-params', `Expected '(' after component name ${name}`, pos);
    }

    // optional return type annotation: `component A(): Node {` (ignored)
    if (src[pos] === ':') {
      const brace = findTopLevel(src, pos + 1, this.len, (tok) => tok.kind === 'punct' && tok.value === '{');
      pos = brace === null ? pos + 1 : brace.start;
    }

    if (src[pos] !== '{') {
      this.error('expected-body', `Expected '{' to start the body of component ${name}`, pos);
      return this.emptyComponent(start, name, nameSpan, header, typeParams);
    }
    const bodyStart = pos + 1;
    const { items, styles, end } = this.parseCodeItems(bodyStart);
    const closed = src[end] === '}';
    if (!closed) this.error('unclosed-component', `Missing '}' at the end of component ${name}`, nameSpan.start, nameSpan.end);
    return {
      type: 'Component',
      name,
      nameSpan,
      exported: header.exported,
      isDefault: header.isDefault,
      typeParams,
      params,
      paramsSpan,
      body: items,
      styles,
      bodySpan: { start: bodyStart, end },
      start,
      end: closed ? end + 1 : end,
    };
  }

  private emptyComponent(
    start: number,
    name: string,
    nameSpan: Span,
    header: { exported: boolean; isDefault: boolean },
    typeParams: Span | null,
  ): ComponentDecl {
    return {
      type: 'Component',
      name,
      nameSpan,
      exported: header.exported,
      isDefault: header.isDefault,
      typeParams,
      params: { kind: 'none' },
      paramsSpan: { start: nameSpan.end, end: nameSpan.end },
      body: [],
      styles: [],
      bodySpan: { start: nameSpan.end, end: nameSpan.end },
      start,
      end: nameSpan.end,
    };
  }

  private findTypeParamsEnd(pos: number): number {
    const scanner = new JsScanner(this.src, pos);
    let depth = 0;
    for (;;) {
      const tok = scanner.next();
      if (tok.kind === 'eof') return this.len;
      if (tok.kind !== 'punct') continue;
      if (tok.value === '<') depth++;
      else if (tok.value === '>' || tok.value === '>>' || tok.value === '>>>') {
        depth -= tok.value.length;
        if (depth <= 0) return tok.end;
      } else if (tok.value === '(' || tok.value === '{') {
        // stop at the parameter list if the generics are unbalanced
        if (depth <= 0) return tok.start;
      }
    }
  }

  private componentParams(start: number, end: number, componentName: string): ComponentParams {
    if (this.src.slice(start, end).trim() === '') return { kind: 'none' };
    const params = this.params(start, end);
    if (params.length === 1) {
      const p = params[0]!;
      if (p.type === 'Identifier' && p.name === 'props' && !p.optional) {
        return { kind: 'object', id: p, type: annotationSpan(p) };
      }
      if (p.type === 'ObjectPattern') return { kind: 'pattern', pattern: p, type: annotationSpan(p) };
    }
    const named: NamedParam[] = [];
    for (const p of params) {
      const param = this.namedParam(p, componentName);
      if (param !== null) named.push(param);
    }
    return { kind: 'named', params: named };
  }

  private namedParam(p: t.FunctionDeclaration['params'][number], componentName: string): NamedParam | null {
    const src = this.src;
    let target: t.Node = p;
    let defaultValue: t.Expression | null = null;
    let rest = false;
    if (target.type === 'RestElement') {
      rest = true;
      target = target.argument;
    }
    if (target.type === 'AssignmentPattern') {
      defaultValue = target.right;
      target = target.left;
    }
    if (target.type !== 'Identifier') {
      this.error(
        'invalid-param',
        `Component ${componentName}: destructuring is only allowed as the single parameter ({ a, b }: Props)`,
        p.start ?? 0,
        p.end ?? 0,
      );
      return null;
    }
    const nameStart = target.start ?? 0;
    const name = readIdentifier(src, nameStart) || target.name;
    return {
      name,
      nameSpan: { start: nameStart, end: nameStart + name.length },
      optional: target.optional === true,
      rest,
      type: annotationSpan(target),
      defaultValue,
      start: p.start ?? 0,
      end: p.end ?? 0,
    };
  }

  // -------------------------------------------------------------------------
  // Code context (component top level)
  // -------------------------------------------------------------------------

  private parseCodeItems(pos: number): { items: ComponentItem[]; styles: StyleBlock[]; end: number } {
    const src = this.src;
    const items: ComponentItem[] = [];
    const styles: StyleBlock[] = [];
    const ctx: ChildContext = { mode: 'code', stack: [], inComponent: false };
    for (;;) {
      pos = skipTrivia(src, pos);
      if (pos >= this.len) return { items, styles, end: pos };
      const c = src[pos]!;
      if (c === '}') return { items, styles, end: pos };
      if (c === '<') {
        if (src.startsWith('<!--', pos)) {
          const comment = this.parseHtmlComment(pos);
          items.push(comment);
          pos = comment.end;
          continue;
        }
        if (src[pos + 1] === '/') {
          const end = this.skipClosingTag(pos);
          this.error('unexpected-closing-tag', `Unexpected closing tag ${src.slice(pos, end)}`, pos, end);
          pos = end;
          continue;
        }
        const node = this.parseElement(pos, ctx);
        if (node.type === 'StyleBlock') styles.push(node);
        else items.push(node);
        pos = node.end;
        continue;
      }
      if (c === '{') {
        const tag = this.parseExpressionTag(pos);
        items.push(tag);
        pos = tag.end;
        continue;
      }
      if (isIdentStart(src.charCodeAt(pos))) {
        const word = readIdentifier(src, pos);
        if ((word === 'var' || word === 'val') && this.isDeclarationStart(pos, word)) {
          const decl = this.parseDeclaration(pos, word);
          items.push(decl);
          pos = Math.max(decl.end, pos + 3);
          continue;
        }
        if (BLOCK_KEYWORDS.has(word) && this.isBlockHeader(pos, word)) {
          const block = this.parseBlock(pos, word, ctx);
          items.push(block);
          pos = Math.max(block.end, pos + word.length);
          continue;
        }
      }
      const end = scanStatementEnd(src, pos);
      if (end <= pos) {
        this.error('unexpected-character', `Unexpected '${c}'`, pos);
        pos++;
        continue;
      }
      const nodes = this.statements(pos, end);
      if (nodes.length === 0 && this.src.slice(pos, end).trim() !== ';') items.push({ type: 'Statement', node: null, start: pos, end });
      for (const node of nodes) {
        items.push({ type: 'Statement', node, start: node.start ?? pos, end: node.end ?? end });
      }
      pos = end;
    }
  }

  private isDeclarationStart(pos: number, word: string): boolean {
    const after = pos + word.length;
    if (!isSpace(this.src.charCodeAt(after))) return false;
    return isIdentStart(this.src.charCodeAt(skipSpaces(this.src, after)));
  }

  private parseDeclaration(pos: number, word: 'var' | 'val'): VarDecl | ValDecl {
    const end = scanStatementEnd(this.src, pos);
    const stmts = this.statements(pos, end, 'let');
    const declarations: Declarator[] = [];
    const stmt = stmts[0];
    if (stmt !== undefined && stmt.type === 'VariableDeclaration') {
      for (const d of stmt.declarations) {
        if (d.id.type !== 'Identifier') {
          this.error('invalid-declaration', `${word} declarations must declare a single name (destructuring is not supported)`, d.id.start ?? pos, d.id.end ?? end);
          continue;
        }
        if (word === 'val' && d.init == null) {
          this.error('val-without-init', `val ${d.id.name} needs a value: val ${d.id.name} = ...`, d.start ?? pos, d.end ?? end);
        }
        declarations.push({
          id: d.id,
          name: d.id.name,
          type: annotationSpan(d.id),
          init: d.init ?? null,
          start: d.start ?? pos,
          end: d.end ?? end,
        });
      }
    }
    return { type: word === 'var' ? 'VarDecl' : 'ValDecl', declarations, start: pos, end };
  }

  // -------------------------------------------------------------------------
  // Control-flow blocks
  // -------------------------------------------------------------------------

  /** Does `word` at `pos` start a block (`if (...) {`, `try {` ...)? */
  private isBlockHeader(pos: number, word: string): boolean {
    const src = this.src;
    let p = skipTrivia(src, pos + word.length);
    if (word === 'try') return src[p] === '{';
    if (src[p] !== '(') return false;
    const close = findClosing(src, p);
    if (close < 0) return word !== 'await' && word !== 'key';
    p = skipTrivia(src, close + 1);
    if (src[p] === '{') return true;
    return word === 'await' && (readIdentifier(src, p) === 'then' || readIdentifier(src, p) === 'catch');
  }

  private parseBlock(pos: number, word: string, ctx: ChildContext): TemplateNode {
    switch (word) {
      case 'if':
        return this.parseIf(pos, ctx);
      case 'for':
        return this.parseFor(pos, ctx);
      case 'switch':
        return this.parseSwitch(pos, ctx);
      case 'await':
        return this.parseAwait(pos, ctx);
      case 'try':
        return this.parseTry(pos, ctx);
      default:
        return this.parseKey(pos, ctx);
    }
  }

  /** `(` at `pos`: returns the inner span and the position after `)`. */
  private parens(pos: number, what: string): { inner: Span; after: number } {
    const src = this.src;
    if (src[pos] !== '(') {
      this.error('expected-paren', `Expected '(' after ${what}`, pos);
      return { inner: { start: pos, end: pos }, after: pos };
    }
    const close = findClosing(src, pos);
    if (close < 0) {
      this.error('unclosed-paren', `Missing ')' after ${what}`, pos);
      return { inner: { start: pos + 1, end: this.len }, after: this.len };
    }
    return { inner: { start: pos + 1, end: close }, after: close + 1 };
  }

  /** Parse `{ children }` at `pos`. */
  private body(pos: number, what: string, ctx: ChildContext): Body {
    const src = this.src;
    pos = skipTrivia(src, pos);
    if (src[pos] !== '{') {
      this.error('expected-brace', `Expected '{' after ${what}`, pos);
      return { children: [], start: pos, end: pos };
    }
    const inner: ChildContext = { mode: 'block', stack: ctx.stack, inComponent: ctx.inComponent };
    const { children, end } = this.parseChildren(pos + 1, inner);
    if (src[end] !== '}') {
      this.error('unclosed-block', `Missing '}' to close ${what}`, pos);
      return { children, start: pos, end };
    }
    return { children, start: pos, end: end + 1 };
  }

  /** Optional continuation keyword (`else`, `empty`, `then`, `catch`) after a block. */
  private continuation(pos: number, word: string): number {
    const p = skipTrivia(this.src, pos);
    if (readIdentifier(this.src, p) === word) return p;
    return -1;
  }

  private parseIf(pos: number, ctx: ChildContext): IfBlock {
    const src = this.src;
    const branches: IfBranch[] = [];
    let alternate: Body | null = null;
    let branchStart = pos;
    let p = skipTrivia(src, pos + 2);
    for (;;) {
      const { inner, after } = this.parens(p, 'if');
      const test = this.expression(inner.start, inner.end);
      const body = this.body(after, 'if', ctx);
      branches.push({ test, testSpan: inner, body, start: branchStart, end: body.end });
      const elsePos = this.continuation(body.end, 'else');
      if (elsePos < 0) break;
      p = skipTrivia(src, elsePos + 4);
      if (readIdentifier(src, p) === 'if') {
        branchStart = elsePos;
        p = skipTrivia(src, p + 2);
        continue;
      }
      alternate = this.body(p, 'else', ctx);
      alternate.start = elsePos;
      break;
    }
    const last = alternate ?? branches[branches.length - 1]!.body;
    return { type: 'IfBlock', branches, alternate, start: pos, end: last.end };
  }

  private parseFor(pos: number, ctx: ChildContext): ForBlock {
    const src = this.src;
    const { inner, after } = this.parens(skipTrivia(src, pos + 3), 'for');
    const header = this.forHeader(inner);
    const body = this.body(after, 'for', ctx);
    let empty: Body | null = null;
    let end = body.end;
    const emptyPos = this.continuation(body.end, 'empty');
    if (emptyPos >= 0) {
      empty = this.body(emptyPos + 5, 'empty', ctx);
      empty.start = emptyPos;
      end = empty.end;
    }
    return { type: 'ForBlock', ...header, body, empty, headerSpan: inner, start: pos, end };
  }

  private forHeader(span: Span): Pick<ForBlock, 'item' | 'itemSpan' | 'reverse' | 'iterable' | 'meta' | 'track'> {
    const src = this.src;
    let p = skipTrivia(src, span.start, span.end);
    // loop variable
    let itemEnd: number;
    if (src[p] === '{' || src[p] === '[') {
      const close = findClosing(src, p, span.end);
      itemEnd = close < 0 ? span.end : close + 1;
    } else {
      itemEnd = p + readIdentifier(src, p).length;
    }
    const itemSpan = { start: p, end: itemEnd };
    const item = itemEnd > p ? this.pattern(p, itemEnd) : null;
    if (item === null) this.error('expected-loop-variable', 'Expected a loop variable: for (item of items)', p, Math.max(itemEnd, p + 1));
    p = skipTrivia(src, itemEnd, span.end);
    if (readIdentifier(src, p) !== 'of') {
      this.error('expected-of', "Expected 'of' in for header: for (item of items)", p, p + 1);
      const empty: ForIterable = { kind: 'expression', expression: null, span: { start: p, end: span.end } };
      return { item, itemSpan, reverse: false, iterable: empty, meta: null, track: null };
    }
    p = skipTrivia(src, p + 2, span.end);
    let reverse = false;
    if (readIdentifier(src, p) === 'rev') {
      const afterRev = skipTrivia(src, p + 3, span.end);
      const c = src[afterRev];
      if (afterRev > p + 3 && afterRev < span.end && c !== ',' && c !== ';' && c !== '.' && c !== '(' && c !== '[') {
        reverse = true;
        p = afterRev;
      }
    }
    const sep = findTopLevel(src, p, span.end, (tok) => tok.kind === 'punct' && (tok.value === ',' || tok.value === ';'));
    const iterEnd = sep === null ? span.end : sep.start;
    const iterable = this.forIterable(p, iterEnd);

    let meta: ForBlock['meta'] = null;
    let track: t.Expression | null = null;
    let q = iterEnd;
    if (sep !== null && sep.value === ',') {
      q = skipTrivia(src, sep.end, span.end);
      const metaSep = findTopLevel(src, q, span.end, (tok) => tok.kind === 'punct' && tok.value === ';');
      const metaEnd = metaSep === null ? span.end : metaSep.start;
      const metaPattern = this.pattern(q, metaEnd);
      if (metaPattern !== null && (metaPattern.type === 'Identifier' || metaPattern.type === 'ObjectPattern')) meta = metaPattern;
      else this.error('invalid-meta', 'Loop meta must be a name or { index, first, last, even, odd, length }', q, metaEnd);
      q = metaEnd;
    }
    if (q < span.end && src[q] === ';') {
      const t0 = skipTrivia(src, q + 1, span.end);
      if (readIdentifier(src, t0) === 'track') {
        track = this.expression(t0 + 5, span.end);
      } else {
        this.error('expected-track', "Expected 'track <key>' after ';' in for header", t0, t0 + 1);
      }
    }
    return { item, itemSpan, reverse, iterable, meta, track };
  }

  private forIterable(start: number, end: number): ForIterable {
    const toks = tokenize(this.src, start, end);
    let depth = 0;
    for (let i = 0; i + 1 < toks.length; i++) {
      const a = toks[i]!;
      if (a.kind === 'punct') {
        if (a.value === '(' || a.value === '[' || a.value === '{') depth++;
        else if (a.value === ')' || a.value === ']' || a.value === '}') depth--;
      }
      const b = toks[i + 1]!;
      if (depth === 0 && a.kind === 'punct' && a.value === '.' && b.kind === 'punct' && b.value === '.' && a.end === b.start) {
        return {
          kind: 'range',
          from: this.expression(start, a.start),
          to: this.expression(b.end, end),
          span: { start, end },
        };
      }
    }
    return { kind: 'expression', expression: this.expression(start, end), span: { start, end } };
  }

  private parseSwitch(pos: number, ctx: ChildContext): SwitchBlock {
    const src = this.src;
    const { inner, after } = this.parens(skipTrivia(src, pos + 6), 'switch');
    const discriminant = this.expression(inner.start, inner.end);
    const cases: SwitchCase[] = [];
    let fallback: Body | null = null;
    let p = skipTrivia(src, after);
    if (src[p] !== '{') {
      this.error('expected-brace', "Expected '{' after switch (...)", p);
      return { type: 'SwitchBlock', discriminant, discriminantSpan: inner, cases, fallback, start: pos, end: p };
    }
    p++;
    for (;;) {
      p = skipTrivia(src, p);
      if (p >= this.len) {
        this.error('unclosed-block', "Missing '}' to close switch", pos, pos + 6);
        return { type: 'SwitchBlock', discriminant, discriminantSpan: inner, cases, fallback, start: pos, end: p };
      }
      if (src[p] === '}') {
        p++;
        break;
      }
      const word = readIdentifier(src, p);
      if (word === 'case') {
        const caseStart = p;
        const brace = findTopLevel(src, p + 4, this.len, (tok) => tok.kind === 'punct' && tok.value === '{');
        if (brace === null) {
          this.error('expected-brace', "Expected '{' after case", p);
          p = this.len;
          continue;
        }
        const guardTok = findTopLevel(src, p + 4, brace.start, (tok) => tok.kind === 'ident' && tok.value === 'if');
        const testsEnd = guardTok === null ? brace.start : guardTok.start;
        const tests = this.caseTests(p + 4, testsEnd);
        let guard: t.Expression | null = null;
        if (guardTok !== null) {
          const { inner: g } = this.parens(skipTrivia(src, guardTok.end), 'case ... if');
          guard = this.expression(g.start, g.end);
        }
        const body = this.body(brace.start, 'case', ctx);
        cases.push({ tests, guard, body, start: caseStart, end: body.end });
        p = body.end;
      } else if (word === 'default') {
        fallback = this.body(p + 7, 'default', ctx);
        fallback.start = p;
        p = fallback.end;
      } else {
        this.error('expected-case', "Expected 'case' or 'default' inside switch", p);
        const next = src.indexOf('\n', p);
        p = next < 0 ? this.len : next + 1;
      }
    }
    return { type: 'SwitchBlock', discriminant, discriminantSpan: inner, cases, fallback, start: pos, end: p };
  }

  private caseTests(start: number, end: number): t.Expression[] {
    if (this.src.slice(start, end).trim() === '') {
      this.error('expected-expression', 'Expected a value after case', start, end);
      return [];
    }
    const stmt = this.withPrefix('[', start, end, '];');
    if (stmt === null || stmt.type !== 'ExpressionStatement' || stmt.expression.type !== 'ArrayExpression') return [];
    const out: t.Expression[] = [];
    for (const el of stmt.expression.elements) {
      if (el !== null && el.type !== 'SpreadElement') out.push(el);
    }
    return out;
  }

  private parseAwait(pos: number, ctx: ChildContext): AwaitBlock {
    const src = this.src;
    const { inner, after } = this.parens(skipTrivia(src, pos + 5), 'await');
    const expression = this.expression(inner.start, inner.end);
    let pending: Body | null = null;
    let p = skipTrivia(src, after);
    if (src[p] === '{') {
      pending = this.body(p, 'await', ctx);
      p = pending.end;
    }
    let then: AwaitBlock['then'] = null;
    let caught: AwaitBlock['catch'] = null;
    let end = p;
    const thenPos = this.continuation(p, 'then');
    if (thenPos >= 0) {
      const r = this.optionalParam(thenPos + 4);
      const body = this.body(r.after, 'then', ctx);
      then = { value: r.param, body, span: { start: thenPos, end: body.end } };
      end = body.end;
    }
    const catchPos = this.continuation(end, 'catch');
    if (catchPos >= 0) {
      const r = this.optionalParam(catchPos + 5);
      const body = this.body(r.after, 'catch', ctx);
      caught = { error: r.param, body, span: { start: catchPos, end: body.end } };
      end = body.end;
    }
    if (pending === null && then === null && caught === null) {
      this.error('empty-await', 'await (...) needs a pending block, then (...) { } or catch (...) { }', pos, pos + 5);
    }
    return { type: 'AwaitBlock', expression, expressionSpan: inner, pending, then, catch: caught, start: pos, end };
  }

  /** `(param)` after then/catch, or nothing. */
  private optionalParam(pos: number): { param: t.LVal | null; after: number } {
    const p = skipTrivia(this.src, pos);
    if (this.src[p] !== '(') return { param: null, after: p };
    const { inner, after } = this.parens(p, 'then/catch');
    return { param: this.pattern(inner.start, inner.end), after };
  }

  private parseTry(pos: number, ctx: ChildContext): TryBlock {
    const src = this.src;
    const body = this.body(pos + 3, 'try', ctx);
    let caught: TryBlock['catch'] = null;
    let end = body.end;
    const catchPos = this.continuation(body.end, 'catch');
    if (catchPos >= 0) {
      let p = skipTrivia(src, catchPos + 5);
      let error: t.LVal | null = null;
      let reset: t.Identifier | null = null;
      if (src[p] === '(') {
        const { inner, after } = this.parens(p, 'catch');
        const params = this.params(inner.start, inner.end);
        const first = params[0];
        error = toLVal(first);
        const second = params[1];
        if (second !== undefined && second.type === 'Identifier') reset = second;
        p = after;
      }
      const catchBody = this.body(p, 'catch', ctx);
      caught = { error, reset, body: catchBody, span: { start: catchPos, end: catchBody.end } };
      end = catchBody.end;
    } else {
      this.error('expected-catch', 'try { } needs a catch (error) { } block', pos, pos + 3);
    }
    return { type: 'TryBlock', body, catch: caught, start: pos, end };
  }

  private parseKey(pos: number, ctx: ChildContext): KeyBlock {
    const { inner, after } = this.parens(skipTrivia(this.src, pos + 3), 'key');
    const expression = this.expression(inner.start, inner.end);
    const body = this.body(after, 'key', ctx);
    return { type: 'KeyBlock', expression, expressionSpan: inner, body, start: pos, end: body.end };
  }

  /** `slot name(params) {` at pos (inside a component element)? */
  private isSlotDefinition(pos: number): boolean {
    const src = this.src;
    let p = pos + 4;
    if (!isSpace(src.charCodeAt(p))) return false;
    p = skipSpaces(src, p);
    const name = readIdentifier(src, p);
    if (name === '') return false;
    p = skipSpaces(src, p + name.length);
    if (src[p] === '(') {
      const close = findClosing(src, p);
      if (close < 0) return false;
      p = skipSpaces(src, close + 1);
    }
    return src[p] === '{';
  }

  private parseSlotDefinition(pos: number, ctx: ChildContext): SlotDefinition {
    const src = this.src;
    const nameStart = skipSpaces(src, pos + 4);
    const name = readIdentifier(src, nameStart);
    let p = skipSpaces(src, nameStart + name.length);
    let params: t.LVal | null = null;
    if (src[p] === '(') {
      const { inner, after } = this.parens(p, `slot ${name}`);
      const list = this.params(inner.start, inner.end);
      const first = list[0];
      params = toLVal(first);
      if (list.length > 1) this.error('slot-params', 'A slot receives a single argument object: slot row({ item, index })', inner.start, inner.end);
      p = after;
    }
    const inner: ChildContext = { mode: 'block', stack: ctx.stack, inComponent: false };
    const body = this.body(p, `slot ${name}`, inner);
    return { type: 'SlotDefinition', name, nameSpan: { start: nameStart, end: nameStart + name.length }, params, body, start: pos, end: body.end };
  }

  // -------------------------------------------------------------------------
  // Markup
  // -------------------------------------------------------------------------

  private parseHtmlComment(pos: number): Comment {
    const close = this.src.indexOf('-->', pos + 4);
    if (close < 0) {
      this.error('unclosed-comment', 'Missing --> to close the comment', pos, pos + 4);
      return { type: 'Comment', value: this.src.slice(pos + 4), start: pos, end: this.len };
    }
    return { type: 'Comment', value: this.src.slice(pos + 4, close), start: pos, end: close + 3 };
  }

  private skipClosingTag(pos: number): number {
    const close = this.src.indexOf('>', pos);
    return close < 0 ? this.len : close + 1;
  }

  private parseExpressionTag(pos: number): ExpressionTag {
    const close = findClosing(this.src, pos);
    if (close < 0) {
      this.error('unclosed-expression', "Missing '}' to close the expression", pos);
      return { type: 'ExpressionTag', expression: null, start: pos, end: this.len };
    }
    const innerStart = pos + 1;
    const content = skipTrivia(this.src, innerStart, close);
    const expression = content >= close ? null : this.expression(innerStart, close);
    return { type: 'ExpressionTag', expression, start: pos, end: close + 1 };
  }

  private readTagName(pos: number): string {
    let end = pos;
    while (end < this.len) {
      const c = this.src.charCodeAt(end);
      if (isIdentPart(c) || c === 45 || c === 46 || c === 58) end++;
      else break;
    }
    return this.src.slice(pos, end);
  }

  private elementKind(name: string, ctx: ChildContext): ElementKind {
    if (name === '') return 'fragment';
    if (name === 'slot') return 'slot';
    const special = SPECIAL_ELEMENTS[name];
    if (special !== undefined && ctx.stack.length === 0) return special;
    const c = name.charCodeAt(0);
    if ((c >= 65 && c <= 90) || name.includes('.')) return 'component';
    return 'element';
  }

  parseElement(pos: number, ctx: ChildContext): Element | StyleBlock {
    const src = this.src;
    const nameStart = pos + 1;
    const name = this.readTagName(nameStart);
    const nameSpan = { start: nameStart, end: nameStart + name.length };
    const kind = this.elementKind(name, ctx);
    const attributes: AttributeLike[] = [];
    let p = nameSpan.end;
    let selfClosing = false;
    let openEnd = -1;
    while (p < this.len) {
      p = skipSpaces(src, p);
      const c = src[p];
      if (c === '>') {
        openEnd = p + 1;
        break;
      }
      if (c === '/' && src[p + 1] === '>') {
        selfClosing = true;
        openEnd = p + 2;
        break;
      }
      if (c === '<' || c === undefined) break;
      if (c === '{') {
        const attr = this.parseBraceAttribute(p);
        attributes.push(attr);
        p = attr.end;
        continue;
      }
      if (c === '"' || c === "'" || c === '=' || c === '/') {
        this.error('unexpected-character', `Unexpected '${c}' in <${name}>`, p);
        p++;
        continue;
      }
      const attr = this.parseAttribute(p);
      attributes.push(attr);
      p = Math.max(attr.end, p + 1);
    }
    if (openEnd < 0) {
      this.error('unclosed-tag', `Missing '>' to close <${name}`, pos, nameSpan.end);
      openEnd = p;
      selfClosing = true;
    }

    const lower = name.toLowerCase();
    if (lower === 'style') return this.parseStyle(pos, attributes, openEnd, selfClosing);

    const element: Element = {
      type: 'Element',
      kind,
      name,
      nameSpan,
      attributes,
      children: [],
      selfClosing,
      openEnd,
      closeNameSpan: null,
      start: pos,
      end: openEnd,
    };
    if (selfClosing || (kind === 'element' && VOID_ELEMENTS.has(lower))) return element;

    if (RAW_TEXT_ELEMENTS.has(lower)) {
      const close = this.findRawClose(openEnd, lower);
      if (close.contentEnd > openEnd) {
        element.children.push({ type: 'Text', raw: src.slice(openEnd, close.contentEnd), start: openEnd, end: close.contentEnd });
      }
      element.closeNameSpan = close.nameSpan;
      element.end = close.end;
      return element;
    }

    const inner: ChildContext = { mode: 'element', stack: [...ctx.stack, name], inComponent: kind === 'component' };
    const result = this.parseChildren(openEnd, inner);
    element.children = result.children;
    element.closeNameSpan = result.closeNameSpan;
    element.end = result.end;
    return element;
  }

  private findRawClose(from: number, name: string): { contentEnd: number; end: number; nameSpan: Span | null } {
    const src = this.src;
    let p = from;
    for (;;) {
      const lt = src.indexOf('</', p);
      if (lt < 0) {
        this.error('unclosed-tag', `Missing </${name}>`, from, from + 1);
        return { contentEnd: this.len, end: this.len, nameSpan: null };
      }
      if (src.slice(lt + 2, lt + 2 + name.length).toLowerCase() === name) {
        const gt = src.indexOf('>', lt);
        const end = gt < 0 ? this.len : gt + 1;
        return { contentEnd: lt, end, nameSpan: { start: lt + 2, end: lt + 2 + name.length } };
      }
      p = lt + 2;
    }
  }

  private parseStyle(pos: number, attributes: AttributeLike[], openEnd: number, selfClosing: boolean): StyleBlock {
    let global = false;
    let lang: string | null = null;
    for (const a of attributes) {
      if (a.type !== 'Attribute') continue;
      if (a.name === 'global') global = true;
      if (a.name === 'lang' && a.value.type === 'Static') lang = a.value.value;
    }
    if (selfClosing) {
      return { type: 'StyleBlock', content: '', contentSpan: { start: openEnd, end: openEnd }, global, lang, start: pos, end: openEnd };
    }
    const close = this.findRawClose(openEnd, 'style');
    return {
      type: 'StyleBlock',
      content: this.src.slice(openEnd, close.contentEnd),
      contentSpan: { start: openEnd, end: close.contentEnd },
      global,
      lang,
      start: pos,
      end: close.end,
    };
  }

  private parseBraceAttribute(pos: number): AttributeLike {
    const src = this.src;
    const close = findClosing(src, pos);
    const end = close < 0 ? this.len : close + 1;
    if (close < 0) this.error('unclosed-expression', "Missing '}' in attribute", pos);
    const innerStart = skipTrivia(src, pos + 1, end);
    if (src.startsWith('...', innerStart)) {
      const spread: SpreadAttribute = {
        type: 'SpreadAttribute',
        expression: this.expression(innerStart + 3, close < 0 ? this.len : close),
        start: pos,
        end,
      };
      return spread;
    }
    const name = readIdentifier(src, innerStart);
    const afterName = skipTrivia(src, innerStart + name.length, end);
    if (name === '' || afterName !== close) {
      this.error('invalid-shorthand', 'Shorthand attributes must be a name ({value}) or a spread ({...props})', pos, end);
    }
    const nameSpan = { start: innerStart, end: innerStart + name.length };
    // shorthand names may be reserved words (`{class}`), so no Babel parse here
    const expression: t.Identifier | null =
      name === '' ? null : ({ type: 'Identifier', name, start: nameSpan.start, end: nameSpan.end } as t.Identifier);
    const attr: Attribute = {
      type: 'Attribute',
      name,
      nameSpan,
      directive: null,
      arg: '',
      shorthand: true,
      value: { type: 'Expression', expression, span: nameSpan },
      start: pos,
      end,
    };
    return attr;
  }

  private parseAttribute(pos: number): Attribute {
    const src = this.src;
    let end = pos;
    while (end < this.len) {
      const c = src.charCodeAt(end);
      if (isSpace(c) || c === 61 /* = */ || c === 62 /* > */ || c === 123 /* { */ || c === 34 || c === 39 || c === 60 /* < */) break;
      if (c === 47 /* / */ && src.charCodeAt(end + 1) === 62) break;
      end++;
    }
    const name = src.slice(pos, end);
    const nameSpan = { start: pos, end };
    let directive: DirectiveKind | null = null;
    let arg = '';
    const colon = name.indexOf(':');
    if (colon > 0) {
      const prefix = name.slice(0, colon);
      if (DIRECTIVES.has(prefix as DirectiveKind)) {
        directive = prefix as DirectiveKind;
        arg = name.slice(colon + 1);
        if (arg === '') this.error('invalid-directive', `${prefix}: needs a name, e.g. ${prefix}:value`, pos, end);
      }
    }
    let value: AttributeValue = { type: 'Boolean' };
    let p = skipSpaces(src, end);
    if (src[p] === '=') {
      p = skipSpaces(src, p + 1);
      const c = src[p];
      if (c === '"' || c === "'") {
        const close = src.indexOf(c, p + 1);
        const valueEnd = close < 0 ? this.len : close;
        if (close < 0) this.error('unclosed-string', `Missing ${c} to close the value of ${name}`, p);
        value = { type: 'Static', value: src.slice(p + 1, valueEnd), span: { start: p + 1, end: valueEnd }, quote: c };
        end = close < 0 ? this.len : close + 1;
      } else if (c === '{') {
        const close = findClosing(src, p);
        if (close < 0) {
          this.error('unclosed-expression', `Missing '}' in the value of ${name}`, p);
          value = { type: 'Expression', expression: null, span: { start: p + 1, end: this.len } };
          end = this.len;
        } else {
          const span = { start: p + 1, end: close };
          value = { type: 'Expression', expression: this.expression(span.start, span.end), span };
          end = close + 1;
        }
      } else {
        let q = p;
        while (q < this.len) {
          const cc = src.charCodeAt(q);
          if (isSpace(cc) || cc === 62 || (cc === 47 && src.charCodeAt(q + 1) === 62)) break;
          q++;
        }
        if (q === p) this.error('expected-value', `Expected a value after ${name}=`, p);
        value = { type: 'Static', value: src.slice(p, q), span: { start: p, end: q }, quote: '' };
        end = q;
      }
    }
    if (directive !== null && directive !== 'class' && directive !== 'use' && value.type !== 'Expression') {
      if (!(directive === 'style' && value.type === 'Static')) {
        this.error('directive-value', `${name} needs an expression value: ${name}={...}`, pos, end);
      }
    }
    return { type: 'Attribute', name, nameSpan, directive, arg, shorthand: false, value, start: pos, end };
  }

  // -------------------------------------------------------------------------
  // Children (element content and block bodies)
  // -------------------------------------------------------------------------

  private parseChildren(pos: number, ctx: ChildContext): { children: TemplateNode[]; end: number; closeNameSpan: Span | null } {
    const src = this.src;
    const children: TemplateNode[] = [];
    const current = ctx.stack[ctx.stack.length - 1] ?? '';
    let lineStart = true;
    for (;;) {
      if (pos >= this.len) {
        if (ctx.mode === 'element') this.error('unclosed-element', `Missing closing tag </${current}>`, pos, pos);
        return { children, end: this.len, closeNameSpan: null };
      }
      const c = src[pos]!;
      if (c === '<') {
        if (src.startsWith('<!--', pos)) {
          const comment = this.parseHtmlComment(pos);
          children.push(comment);
          pos = comment.end;
          lineStart = false;
          continue;
        }
        if (src[pos + 1] === '/') {
          const nameStart = pos + 2;
          const name = this.readTagName(nameStart);
          if (ctx.mode === 'element' && name === current) {
            const gt = src.indexOf('>', nameStart + name.length);
            const end = gt < 0 ? this.len : gt + 1;
            return { children, end, closeNameSpan: { start: nameStart, end: nameStart + name.length } };
          }
          if (ctx.stack.includes(name)) {
            if (ctx.mode === 'element') this.error('unclosed-element', `Missing closing tag </${current}>`, pos, pos + 2 + name.length);
            else this.error('unclosed-block', "Missing '}' before closing tag", pos, pos + 2 + name.length);
            return { children, end: pos, closeNameSpan: null };
          }
          const end = this.skipClosingTag(pos);
          this.error('unexpected-closing-tag', `Unexpected closing tag </${name}>`, pos, end);
          pos = end;
          continue;
        }
        const node = this.parseElement(pos, ctx);
        if (node.type === 'StyleBlock') {
          this.error('nested-style', '<style> must be a direct child of the component body', node.start, node.start + 6);
        } else {
          children.push(node);
        }
        pos = node.end;
        lineStart = false;
        continue;
      }
      if (c === '{') {
        const tag = this.parseExpressionTag(pos);
        children.push(tag);
        pos = tag.end;
        lineStart = false;
        continue;
      }
      if (c === '}' && ctx.mode === 'block') return { children, end: pos, closeNameSpan: null };
      if (lineStart && isIdentStart(src.charCodeAt(pos))) {
        const node = this.lineStartConstruct(pos, ctx);
        if (node !== null) {
          children.push(node);
          pos = Math.max(node.end, pos + 1);
          lineStart = false;
          continue;
        }
      }
      const text = this.readText(pos, ctx, lineStart);
      children.push(text.node);
      pos = text.node.end;
      lineStart = text.endsAtLineStart;
    }
  }

  /** Control blocks, `val` and `slot` definitions are recognized at the start of a line. */
  private lineStartConstruct(pos: number, ctx: ChildContext): TemplateNode | null {
    const word = readIdentifier(this.src, pos);
    if (BLOCK_KEYWORDS.has(word) && this.isBlockHeader(pos, word)) return this.parseBlock(pos, word, ctx);
    if (word === 'val' && this.isDeclarationStart(pos, word)) {
      const decl = this.parseDeclaration(pos, 'val');
      return decl.type === 'ValDecl' ? decl : null;
    }
    if (word === 'slot' && ctx.inComponent && this.isSlotDefinition(pos)) return this.parseSlotDefinition(pos, ctx);
    return null;
  }

  private readText(pos: number, ctx: ChildContext, lineStart: boolean): { node: Text; endsAtLineStart: boolean } {
    const src = this.src;
    const start = pos;
    let onlySpaceSinceBreak = lineStart;
    while (pos < this.len) {
      const c = src.charCodeAt(pos);
      if (c === 60 /* < */ || c === 123 /* { */) break;
      if (c === 125 /* } */ && ctx.mode === 'block') break;
      if (isLineBreak(c)) {
        onlySpaceSinceBreak = true;
        pos++;
        continue;
      }
      if (onlySpaceSinceBreak && isIdentStart(c) && pos > start) {
        const word = readIdentifier(src, pos);
        if (
          (BLOCK_KEYWORDS.has(word) && this.isBlockHeader(pos, word)) ||
          (word === 'val' && this.isDeclarationStart(pos, word)) ||
          (word === 'slot' && ctx.inComponent && this.isSlotDefinition(pos))
        ) {
          return { node: { type: 'Text', raw: src.slice(start, pos), start, end: pos }, endsAtLineStart: true };
        }
      }
      if (!isSpace(c)) onlySpaceSinceBreak = false;
      pos++;
    }
    return { node: { type: 'Text', raw: src.slice(start, pos), start, end: pos }, endsAtLineStart: onlySpaceSinceBreak };
  }
}

/** Keep binding patterns usable as loop variables / parameters. */
function toLVal(node: t.Node | null | undefined): t.LVal | null {
  if (node == null) return null;
  switch (node.type) {
    case 'Identifier':
    case 'ObjectPattern':
    case 'ArrayPattern':
    case 'AssignmentPattern':
      return node;
    default:
      return null;
  }
}

/** Babel appends ` (line:column)` to messages; positions are reported separately. */
function stripPosition(message: string): string {
  const open = message.lastIndexOf(' (');
  if (open < 0 || !message.endsWith(')')) return message;
  const inner = message.slice(open + 2, -1);
  const colon = inner.indexOf(':');
  const isNumber = (s: string) => s.length > 0 && [...s].every((ch) => ch >= '0' && ch <= '9');
  return colon > 0 && isNumber(inner.slice(0, colon)) && isNumber(inner.slice(colon + 1)) ? message.slice(0, open) : message;
}

function annotationSpan(node: t.Node): Span | null {
  const ann = (node as { typeAnnotation?: t.Node | null }).typeAnnotation;
  if (ann == null || ann.type !== 'TSTypeAnnotation') return null;
  const inner = ann.typeAnnotation;
  return { start: inner.start ?? 0, end: inner.end ?? 0 };
}
