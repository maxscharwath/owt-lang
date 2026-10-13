/**
 * OWT abstract syntax tree.
 *
 * Every node carries absolute `start`/`end` offsets into the source file.
 * Embedded TypeScript (expressions, statements, patterns) is kept as Babel
 * AST nodes parsed at their real offsets, so tools can map any node back to
 * the `.owt` file without re-parsing.
 */
import type * as t from '@babel/types';

export type { t as Babel };

export type Span = { start: number; end: number };

export type Severity = 'error' | 'warning';

export type Diagnostic = Span & {
  code: string;
  message: string;
  severity: Severity;
};

// ---------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------

export type Program = Span & {
  type: 'Program';
  source: string;
  body: TopLevelNode[];
  /** module-level `<style>` blocks (global CSS) */
  styles: StyleBlock[];
  diagnostics: Diagnostic[];
};

export type TopLevelNode = Script | ComponentDecl | StyleBlock;

/** A run of plain TypeScript module code (imports, types, helpers...). */
export type Script = Span & {
  type: 'Script';
  statements: t.Statement[];
};

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export type ComponentDecl = Span & {
  type: 'Component';
  name: string;
  nameSpan: Span;
  exported: boolean;
  isDefault: boolean;
  /** raw `<T extends ...>` including angle brackets */
  typeParams: Span | null;
  params: ComponentParams;
  /** span of the parameter list including parentheses */
  paramsSpan: Span;
  body: ComponentItem[];
  styles: StyleBlock[];
  /** span inside the body braces */
  bodySpan: Span;
};

/**
 * Component parameters:
 * - `none`:    `component A()`
 * - `object`:  `component A(props: Props)` — the whole props object
 * - `pattern`: `component A({ a, b = 1 }: Props)` — destructured props
 * - `named`:   `component A(title: string, size = 'md')` — each parameter is a prop
 */
export type ComponentParams =
  | { kind: 'none' }
  | { kind: 'object'; id: t.Identifier; type: Span | null }
  | { kind: 'pattern'; pattern: t.ObjectPattern; type: Span | null }
  | { kind: 'named'; params: NamedParam[] };

export type NamedParam = Span & {
  name: string;
  nameSpan: Span;
  optional: boolean;
  rest: boolean;
  type: Span | null;
  defaultValue: t.Expression | null;
};

export type ComponentItem = VarDecl | ValDecl | Statement | TemplateNode;

/** `var name[: T] = init` — reactive state. */
export type VarDecl = Span & {
  type: 'VarDecl';
  declarations: Declarator[];
};

/** `val name[: T] = init` — derived (computed) value. */
export type ValDecl = Span & {
  type: 'ValDecl';
  declarations: Declarator[];
};

export type Declarator = Span & {
  id: t.Identifier;
  name: string;
  /** span of the type annotation (without the colon) */
  type: Span | null;
  init: t.Expression | null;
};

/** Plain TypeScript statement inside a component body (runs once per instance). */
export type Statement = Span & {
  type: 'Statement';
  /** null when the code could not be parsed (editors still get the span) */
  node: t.Statement | null;
};

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

export type TemplateNode =
  | Element
  | Text
  | ExpressionTag
  | IfBlock
  | ForBlock
  | SwitchBlock
  | AwaitBlock
  | TryBlock
  | KeyBlock
  | SlotDefinition
  | ValDecl
  | Comment;

export type Text = Span & {
  type: 'Text';
  /** raw source text (entities not decoded) */
  raw: string;
};

export type Comment = Span & {
  type: 'Comment';
  value: string;
};

/** `{expr}` — `expression` is null for empty / comment-only tags. */
export type ExpressionTag = Span & {
  type: 'ExpressionTag';
  expression: t.Expression | null;
};

export type ElementKind = 'element' | 'component' | 'slot' | 'window' | 'document' | 'body' | 'head' | 'fragment';

export type Element = Span & {
  type: 'Element';
  kind: ElementKind;
  name: string;
  nameSpan: Span;
  attributes: AttributeLike[];
  children: TemplateNode[];
  selfClosing: boolean;
  /** end offset of the opening tag (after `>`) */
  openEnd: number;
  /** span of the closing tag name, if any */
  closeNameSpan: Span | null;
};

export type AttributeLike = Attribute | SpreadAttribute;

export type DirectiveKind = 'bind' | 'class' | 'style' | 'use' | 'on';

export type Attribute = Span & {
  type: 'Attribute';
  name: string;
  nameSpan: Span;
  /** `bind:value` → directive 'bind', arg 'value' */
  directive: DirectiveKind | null;
  arg: string;
  /** `{name}` shorthand */
  shorthand: boolean;
  value: AttributeValue;
};

export type AttributeValue =
  | { type: 'Boolean' }
  | { type: 'Static'; value: string; span: Span; quote: '"' | "'" | '' }
  | { type: 'Expression'; expression: t.Expression | null; span: Span };

export type SpreadAttribute = Span & {
  type: 'SpreadAttribute';
  expression: t.Expression | null;
};

export type Body = Span & { children: TemplateNode[] };

export type IfBlock = Span & {
  type: 'IfBlock';
  branches: IfBranch[];
  alternate: Body | null;
};

export type IfBranch = Span & {
  test: t.Expression | null;
  testSpan: Span;
  body: Body;
};

export type ForIterable =
  | { kind: 'expression'; expression: t.Expression | null; span: Span }
  | { kind: 'range'; from: t.Expression | null; to: t.Expression | null; span: Span };

export type ForBlock = Span & {
  type: 'ForBlock';
  /** loop variable: identifier or destructuring pattern */
  item: t.LVal | null;
  itemSpan: Span;
  reverse: boolean;
  iterable: ForIterable;
  /** `, meta` or `, { index, first }` */
  meta: t.Identifier | t.ObjectPattern | null;
  /** `; track key` */
  track: t.Expression | null;
  body: Body;
  empty: Body | null;
  /** span of the header between parentheses */
  headerSpan: Span;
};

export type SwitchBlock = Span & {
  type: 'SwitchBlock';
  discriminant: t.Expression | null;
  discriminantSpan: Span;
  cases: SwitchCase[];
  fallback: Body | null;
};

export type SwitchCase = Span & {
  tests: t.Expression[];
  guard: t.Expression | null;
  body: Body;
};

export type AwaitBlock = Span & {
  type: 'AwaitBlock';
  expression: t.Expression | null;
  expressionSpan: Span;
  pending: Body | null;
  then: { value: t.LVal | null; body: Body; span: Span } | null;
  catch: { error: t.LVal | null; body: Body; span: Span } | null;
};

export type TryBlock = Span & {
  type: 'TryBlock';
  body: Body;
  catch: { error: t.LVal | null; reset: t.Identifier | null; body: Body; span: Span } | null;
};

export type KeyBlock = Span & {
  type: 'KeyBlock';
  expression: t.Expression | null;
  expressionSpan: Span;
  body: Body;
};

/** `slot name(args) { ... }` inside a component element: passes named content. */
export type SlotDefinition = Span & {
  type: 'SlotDefinition';
  name: string;
  nameSpan: Span;
  params: t.LVal | null;
  body: Body;
};

export type StyleBlock = Span & {
  type: 'StyleBlock';
  /** raw CSS between the tags */
  content: string;
  contentSpan: Span;
  global: boolean;
  lang: string | null;
};

// ---------------------------------------------------------------------------
// Guards & traversal
// ---------------------------------------------------------------------------

export type AnyNode = Program | TopLevelNode | ComponentItem | TemplateNode | AttributeLike;

export const isComponent = (n: { type: string }): n is ComponentDecl => n.type === 'Component';
export const isScript = (n: { type: string }): n is Script => n.type === 'Script';
export const isStyleBlock = (n: { type: string }): n is StyleBlock => n.type === 'StyleBlock';
export const isElement = (n: { type: string }): n is Element => n.type === 'Element';
export const isText = (n: { type: string }): n is Text => n.type === 'Text';
export const isExpressionTag = (n: { type: string }): n is ExpressionTag => n.type === 'ExpressionTag';
export const isVarDecl = (n: { type: string }): n is VarDecl => n.type === 'VarDecl';
export const isValDecl = (n: { type: string }): n is ValDecl => n.type === 'ValDecl';
export const isStatement = (n: { type: string }): n is Statement => n.type === 'Statement';
export const isIfBlock = (n: { type: string }): n is IfBlock => n.type === 'IfBlock';
export const isForBlock = (n: { type: string }): n is ForBlock => n.type === 'ForBlock';
export const isSwitchBlock = (n: { type: string }): n is SwitchBlock => n.type === 'SwitchBlock';
export const isAwaitBlock = (n: { type: string }): n is AwaitBlock => n.type === 'AwaitBlock';
export const isTryBlock = (n: { type: string }): n is TryBlock => n.type === 'TryBlock';
export const isKeyBlock = (n: { type: string }): n is KeyBlock => n.type === 'KeyBlock';
export const isSlotDefinition = (n: { type: string }): n is SlotDefinition => n.type === 'SlotDefinition';
export const isAttribute = (n: { type: string }): n is Attribute => n.type === 'Attribute';
export const isSpreadAttribute = (n: { type: string }): n is SpreadAttribute => n.type === 'SpreadAttribute';

const TEMPLATE_TYPES = new Set([
  'Element',
  'Text',
  'ExpressionTag',
  'IfBlock',
  'ForBlock',
  'SwitchBlock',
  'AwaitBlock',
  'TryBlock',
  'KeyBlock',
  'SlotDefinition',
  'Comment',
]);

export const isTemplateNode = (n: { type: string }): n is TemplateNode => TEMPLATE_TYPES.has(n.type);

/** Child template lists of a node, in source order. */
export function childBodies(node: TemplateNode): TemplateNode[][] {
  switch (node.type) {
    case 'Element':
      return [node.children];
    case 'IfBlock':
      return [...node.branches.map((b) => b.body.children), ...(node.alternate ? [node.alternate.children] : [])];
    case 'ForBlock':
      return [node.body.children, ...(node.empty ? [node.empty.children] : [])];
    case 'SwitchBlock':
      return [...node.cases.map((c) => c.body.children), ...(node.fallback ? [node.fallback.children] : [])];
    case 'AwaitBlock':
      return [
        ...(node.pending ? [node.pending.children] : []),
        ...(node.then ? [node.then.body.children] : []),
        ...(node.catch ? [node.catch.body.children] : []),
      ];
    case 'TryBlock':
      return [node.body.children, ...(node.catch ? [node.catch.body.children] : [])];
    case 'KeyBlock':
    case 'SlotDefinition':
      return [node.body.children];
    default:
      return [];
  }
}

/** Depth-first walk over template nodes. Return `false` from `enter` to skip children. */
export function walkTemplate(nodes: readonly TemplateNode[], enter: (node: TemplateNode, parent: TemplateNode | null) => void | false, parent: TemplateNode | null = null): void {
  for (const node of nodes) {
    if (enter(node, parent) === false) continue;
    for (const list of childBodies(node)) walkTemplate(list, enter, node);
  }
}

// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------

export type Position = { line: number; column: number };

/** Offset ↔ line/column conversion (lines 1-based, columns 0-based). */
export class LineMap {
  private readonly starts: number[];
  constructor(source: string) {
    const starts = [0];
    for (let i = 0; i < source.length; i++) {
      const c = source.charCodeAt(i);
      if (c === 10) starts.push(i + 1);
      else if (c === 13) {
        if (source.charCodeAt(i + 1) === 10) i++;
        starts.push(i + 1);
      }
    }
    this.starts = starts;
  }
  position(offset: number): Position {
    const starts = this.starts;
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid]! <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, column: offset - starts[lo]! };
  }
  offset(position: Position): number {
    const start = this.starts[position.line - 1] ?? this.starts[this.starts.length - 1]!;
    return start + position.column;
  }
}

/** Human-readable code frame for diagnostics. */
export function codeFrame(source: string, start: number, end = start, context = 2): string {
  const map = new LineMap(source);
  const from = map.position(start);
  const to = map.position(Math.max(start, end));
  const lines = source.split(/\r\n|\r|\n/);
  const first = Math.max(1, from.line - context);
  const last = Math.min(lines.length, to.line + context);
  const width = String(last).length;
  const out: string[] = [];
  for (let line = first; line <= last; line++) {
    const text = lines[line - 1] ?? '';
    const marker = line >= from.line && line <= to.line ? '>' : ' ';
    out.push(`${marker} ${String(line).padStart(width)} | ${text}`);
    if (line >= from.line && line <= to.line) {
      const colStart = line === from.line ? from.column : 0;
      const colEnd = line === to.line ? Math.max(to.column, colStart + 1) : text.length;
      out.push(`  ${' '.repeat(width)} | ${' '.repeat(colStart)}${'^'.repeat(Math.max(1, colEnd - colStart))}`);
    }
  }
  return out.join('\n');
}
