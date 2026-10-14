/**
 * Template code generation.
 *
 * Markup becomes a hoisted HTML template that is cloned per instance. Nodes
 * that need code (dynamic text, attributes, events, blocks, components) are
 * located once through `firstChild` / `nextSibling` paths. All dynamic values
 * of a template share one render effect that compares each value with its
 * previous one before touching the DOM.
 */
import type * as t from '@babel/types';
import type {
  AttributeLike,
  AwaitBlock,
  Element,
  ForBlock,
  IfBlock,
  KeyBlock,
  SlotDefinition,
  SwitchBlock,
  TemplateNode,
  TryBlock,
  ValDecl,
} from '@owt/ast';
import { type Chunk, join, origin, text } from './chunks';
import { type Binding, type BindingScope } from './bindings';
import type { ComponentContext } from './context';
import {
  BOOLEAN_ATTRIBUTES,
  DOM_PROPERTIES,
  MATHML_ELEMENTS,
  PRESERVE_WHITESPACE,
  PROPERTY_BINDINGS,
  SIZE_BINDINGS,
  SVG_ELEMENTS,
  cleanText,
  decodeEntities,
  escapeAttribute,
  escapeText,
  invalidNesting,
  templateLiteralText,
} from './html';
import { patternNames } from './walk';

export type Namespace = 'html' | 'svg' | 'mathml';

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

const DELEGATED = new Set([
  'beforeinput',
  'click',
  'contextmenu',
  'dblclick',
  'focusin',
  'focusout',
  'input',
  'keydown',
  'keyup',
  'mousedown',
  'mousemove',
  'mouseout',
  'mouseover',
  'mouseup',
  'pointerdown',
  'pointermove',
  'pointerout',
  'pointerover',
  'pointerup',
  'touchend',
  'touchmove',
  'touchstart',
]);

const EACH_ITEM_SOURCE = 1;
const EACH_INDEX_SOURCE = 2;
const EACH_META = 4;
const EACH_ONLY_CHILD = 8;
const EACH_KEY_INDEX = 16;

type TextPart = { text: string } | { expr: t.Expression };

type Block = IfBlock | ForBlock | SwitchBlock | AwaitBlock | TryBlock | KeyBlock;

type Item =
  | { k: 'element'; el: Element }
  | { k: 'text'; parts: TextPart[]; start: number }
  | { k: 'block'; node: Block }
  | { k: 'component'; el: Element }
  | { k: 'slot'; el: Element }
  | { k: 'special'; el: Element };

// ---------------------------------------------------------------------------
// DOM model of a template
// ---------------------------------------------------------------------------

class DNode {
  ref: string | null = null;
  /** code references this node */
  used = false;
  children: DNode[] = [];
  constructor(
    readonly kind: 'el' | 'text' | 'comment',
    readonly tag: string,
    public html: string,
  ) {}

  needsPath(): boolean {
    return this.used || this.children.some((c) => c.needsPath());
  }
}

function serialize(node: DNode, ns: Namespace): string {
  if (node.kind === 'text') return node.html;
  if (node.kind === 'comment') return '<!>';
  const childNs: Namespace = node.tag === 'svg' ? 'svg' : node.tag === 'math' ? 'mathml' : node.tag === 'foreignObject' ? 'html' : ns;
  const open = `<${node.tag}${node.html}>`;
  if (ns === 'html' && VOID.has(node.tag)) return open;
  if (ns !== 'html' && node.children.length === 0) return `<${node.tag}${node.html}/>`;
  return `${open}${node.children.map((c) => serialize(c, childNs)).join('')}</${node.tag}>`;
}

type Update = { node: DNode; value: Chunk; apply: (ref: string, value: string) => string };

/** Code collected for one template instance. */
class Ops {
  readonly setup: (() => Chunk)[] = [];
  readonly updates: Update[] = [];
  readonly post: (() => Chunk)[] = [];
}

/** JSX-style names accepted for a few attributes. */
const ATTRIBUTE_ALIASES: Record<string, string> = { htmlFor: 'for', className: 'class', acceptCharset: 'accept-charset', httpEquiv: 'http-equiv' };

/** Attributes whose boolean values are the strings "true" / "false". */
function stringBoolean(name: string): boolean {
  return name.startsWith('aria-') || name.startsWith('data-') || name === 'draggable' || name === 'spellcheck' || name === 'contenteditable';
}

function isLiteral(node: t.Node): boolean {
  switch (node.type) {
    case 'StringLiteral':
    case 'NumericLiteral':
    case 'BooleanLiteral':
    case 'NullLiteral':
      return true;
    case 'TemplateLiteral':
      return node.expressions.length === 0;
    case 'UnaryExpression':
      return (node.operator === '-' || node.operator === '+') && node.argument.type === 'NumericLiteral';
    default:
      return false;
  }
}

function literalValue(node: t.Node): string | number | boolean | null {
  switch (node.type) {
    case 'StringLiteral':
      return node.value;
    case 'NumericLiteral':
      return node.value;
    case 'BooleanLiteral':
      return node.value;
    case 'TemplateLiteral':
      return node.quasis[0]?.value.cooked ?? '';
    case 'UnaryExpression':
      return node.argument.type === 'NumericLiteral' ? (node.operator === '-' ? -node.argument.value : node.argument.value) : null;
    default:
      return null;
  }
}

function isFunctionLiteral(node: t.Node): boolean {
  return node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression';
}

function isStatementLike(node: t.Node): boolean {
  if (node.type === 'AssignmentExpression' || node.type === 'UpdateExpression') return true;
  if (node.type === 'SequenceExpression') return node.expressions.every(isStatementLike);
  return false;
}

function eventInfo(name: string): { type: string; capture: boolean } | null {
  if (name.length > 2 && name.startsWith('on') && name.charCodeAt(2) >= 65 && name.charCodeAt(2) <= 90) {
    let base = name.slice(2);
    let capture = false;
    if (base.length > 7 && base.endsWith('Capture') && base !== 'GotPointerCapture' && base !== 'LostPointerCapture') {
      base = base.slice(0, -7);
      capture = true;
    }
    const type = base.toLowerCase();
    return { type: type === 'doubleclick' ? 'dblclick' : type, capture };
  }
  return null;
}

function isIdentifierName(name: string): boolean {
  if (name === '') return false;
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i);
    const letter = (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 36;
    if (!letter && !(i > 0 && c >= 48 && c <= 57)) return false;
  }
  return true;
}

/** Template roots made only of SVG-only tags must be parsed in the SVG namespace. */
function rootNamespace(items: readonly Item[], ns: Namespace): Namespace {
  if (ns !== 'html') return ns;
  const elements = items.filter((i) => i.k === 'element');
  if (elements.length === 0) return ns;
  const ambiguous = new Set(['a', 'title', 'style', 'script', 'svg']);
  return elements.every((i) => i.k === 'element' && SVG_ELEMENTS.has(i.el.name) && !ambiguous.has(i.el.name)) ? 'svg' : ns;
}

/** Block bodies ignore whitespace right after `{` and right before `}`. */
function trimItems(items: Item[]): void {
  const first = items[0];
  if (first !== undefined && first.k === 'text') {
    const part = first.parts[0];
    if (part !== undefined && 'text' in part) part.text = part.text.trimStart();
    first.parts = first.parts.filter((p) => 'expr' in p || p.text !== '');
    if (first.parts.length === 0) items.shift();
  }
  const last = items[items.length - 1];
  if (last !== undefined && last.k === 'text') {
    const part = last.parts[last.parts.length - 1];
    if (part !== undefined && 'text' in part) part.text = part.text.trimEnd();
    last.parts = last.parts.filter((p) => 'expr' in p || p.text !== '');
    if (last.parts.length === 0) items.pop();
  }
}

function identifier(name: string, start: number): t.Identifier {
  return { type: 'Identifier', name, start, end: start + name.length };
}

export class TemplateCompiler {
  private readonly templateCache = new Map<string, string>();

  constructor(private readonly c: ComponentContext) {}

  private get rt(): string {
    return this.c.rt;
  }

  // -------------------------------------------------------------------------
  // Entry points
  // -------------------------------------------------------------------------

  /** Statements creating a fragment for `nodes`, ending with `return <node>;`. */
  body(nodes: readonly TemplateNode[], scope: BindingScope, ns: Namespace, parentTag: string | null = null): Chunk[] {
    const out: Chunk[] = [];
    const { items, vals } = this.items(nodes, ns, parentTag, false, true);
    for (const val of vals) out.push(this.valDecl(val, scope));
    if (items.length === 0) {
      out.push(`return ${this.rt}.comment();`);
      return out;
    }
    const only = items[0]!;
    if (items.length === 1 && only.k === 'component' && !this.isDynamicComponent(only.el, scope)) {
      out.push(['return ', this.componentCall(only.el, scope, ns), ';']);
      return out;
    }
    out.push(...this.instantiate(items, scope, ns, parentTag));
    return out;
  }

  /** `(params) => { ...body }` */
  renderFn(nodes: readonly TemplateNode[], scope: BindingScope, ns: Namespace, params = '', parentTag: string | null = null): Chunk {
    return [`(${params}) => {\n`, join(this.body(nodes, scope, ns, parentTag), '\n'), '\n}'];
  }

  /** `val` inside a block body: a derived value local to the branch / row. */
  valDecl(val: ValDecl, scope: BindingScope): Chunk {
    const out: Chunk[] = [];
    for (const d of val.declarations) {
      scope.add({
        name: d.name,
        kind: 'derived',
        read: `${this.rt}.get(${d.name})`,
        source: d.name,
        write: false,
        reactive: true,
        stable: false,
        description: 'val',
        start: d.start,
      });
      const init: Chunk = d.init === null ? 'undefined' : this.c.expr(d.init, scope);
      out.push(origin(`const ${d.name} = ${this.rt}.derived(() => `, d.start), init, ');');
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Normalization
  // -------------------------------------------------------------------------

  private items(nodes: readonly TemplateNode[], ns: Namespace, parentTag: string | null, preserve: boolean, trimEdges = false): { items: Item[]; vals: ValDecl[] } {
    const items: Item[] = [];
    const vals: ValDecl[] = [];
    let run: TextPart[] | null = null;
    let runStart = 0;
    const flush = () => {
      if (run === null) return;
      const parts: TextPart[] = [];
      for (const p of run) {
        const last = parts[parts.length - 1];
        if ('text' in p && last !== undefined && 'text' in last) last.text += p.text;
        else parts.push(p);
      }
      const meaningful = parts.some((p) => 'expr' in p || p.text !== '');
      if (meaningful) items.push({ k: 'text', parts: parts.filter((p) => 'expr' in p || p.text !== ''), start: runStart });
      run = null;
    };
    const pushPart = (part: TextPart, start: number) => {
      if (run === null) {
        run = [];
        runStart = start;
      }
      run.push(part);
    };
    const visit = (list: readonly TemplateNode[]) => {
      for (const node of list) {
        switch (node.type) {
          case 'Comment':
            break;
          case 'ValDecl':
            vals.push(node);
            break;
          case 'Text': {
            const cleaned = preserve ? node.raw : cleanText(node.raw);
            if (cleaned !== '') pushPart({ text: decodeEntities(cleaned) }, node.start);
            break;
          }
          case 'ExpressionTag':
            if (node.expression !== null) {
              if (isLiteral(node.expression)) {
              const lit = literalValue(node.expression);
              pushPart({ text: lit === null || typeof lit === 'boolean' ? '' : String(lit) }, node.start);
            }
              else pushPart({ expr: node.expression }, node.start);
            }
            break;
          case 'SlotDefinition':
            this.c.error('slot-definition-position', `slot ${node.name} { } is only allowed directly inside a component element`, node.start, node.nameSpan.end);
            break;
          case 'Element':
            if (node.kind === 'fragment') {
              visit(node.children);
              break;
            }
            flush();
            if (node.kind === 'element') items.push({ k: 'element', el: node });
            else if (node.kind === 'component') items.push({ k: 'component', el: node });
            else if (node.kind === 'slot') items.push({ k: 'slot', el: node });
            else items.push({ k: 'special', el: node });
            break;
          default:
            flush();
            items.push({ k: 'block', node });
        }
      }
    };
    visit(nodes);
    flush();
    if (trimEdges) trimItems(items);
    void ns;
    void parentTag;
    return { items, vals };
  }

  // -------------------------------------------------------------------------
  // Template instantiation
  // -------------------------------------------------------------------------

  private instantiate(items: Item[], scope: BindingScope, parentNs: Namespace, parentTag: string | null): Chunk[] {
    const ops = new Ops();
    const ns = rootNamespace(items, parentNs);
    const roots: DNode[] = [];
    // stable first node: blocks render before their anchor, so a leading block needs a marker
    const first = items[0]!;
    if (first.k === 'block' || first.k === 'slot' || (first.k === 'component' && this.isDynamicComponent(first.el, scope))) {
      roots.push(new DNode('comment', '', ''));
    }
    this.buildChildren(items, roots, scope, ns, parentTag, ops, null);
    const visible = roots;
    if (visible.length === 0) return [`return ${this.rt}.comment();`];

    const html = visible.map((n) => serialize(n, ns)).join('');
    const fragment = visible.length > 1;
    const flags = (fragment ? 1 : 0) | (ns === 'svg' ? 2 : 0) | (ns === 'mathml' ? 4 : 0);
    const tmpl = this.template(html, flags);
    const root = this.c.file.name('root');

    const out: Chunk[] = [`const ${root} = ${tmpl}();`];
    // node references
    if (fragment) {
      out.push(...this.paths(visible, root));
    } else {
      const only = visible[0]!;
      only.ref = root;
      out.push(...this.paths(only.children, root));
    }
    for (const setup of ops.setup) out.push(setup());
    if (ops.updates.length > 0) out.push(this.renderEffect(ops.updates));
    for (const post of ops.post) out.push(post());
    out.push(`return ${root};`);
    return out;
  }

  private template(html: string, flags: number): string {
    const key = `${flags}:${html}`;
    let name = this.templateCache.get(key);
    if (name === undefined) {
      name = this.c.file.name('tmpl');
      this.templateCache.set(key, name);
      this.c.file.templates.push(`const ${name} = /* @__PURE__ */ ${this.rt}.template(${JSON.stringify(html)}${flags ? `, ${flags}` : ''});\n`);
    }
    return name;
  }

  /** `firstChild` / `nextSibling` navigation for referenced nodes. */
  private paths(nodes: DNode[], parentRef: string): Chunk[] {
    const out: Chunk[] = [];
    let chain = `${parentRef}.firstChild`;
    const lastNeeded = nodes.reduce((acc, n, i) => (n.needsPath() ? i : acc), -1);
    for (let i = 0; i <= lastNeeded; i++) {
      const node = nodes[i]!;
      if (node.needsPath()) {
        const ref = this.c.file.name(node.kind === 'el' ? 'el' : node.kind === 'text' ? 'text' : 'anchor');
        out.push(`const ${ref} = ${chain};`);
        node.ref = ref;
        chain = ref;
        if (node.children.some((c) => c.needsPath())) out.push(...this.paths(node.children, ref));
      }
      chain = `${chain}.nextSibling`;
    }
    return out;
  }

  private renderEffect(updates: Update[]): Chunk {
    const prev = updates.map(() => this.c.file.name('p'));
    const lines: Chunk[] = [];
    updates.forEach((u, i) => {
      const v = this.c.file.name('v');
      const p = prev[i]!;
      lines.push(['  const ', v, ' = ', u.value, ';\n']);
      lines.push(`  if (${v} !== ${p}) ${u.apply(u.node.ref!, `${p} = ${v}`)};\n`);
    });
    return [`let ${prev.join(', ')};\n${this.rt}.render(() => {\n`, lines, '});'];
  }

  private buildChildren(items: Item[], into: DNode[], scope: BindingScope, ns: Namespace, parentTag: string | null, ops: Ops, parent: DNode | null): void {
    const onlyChild = items.length === 1 && parent !== null;
    for (const item of items) {
      switch (item.k) {
        case 'text':
          into.push(this.buildText(item, scope, ops));
          break;
        case 'element':
          into.push(this.buildElement(item.el, scope, ns, parentTag, ops));
          break;
        case 'component': {
          const anchor = new DNode('comment', '', '');
          anchor.used = true;
          into.push(anchor);
          if (this.isDynamicComponent(item.el, scope)) {
            ops.setup.push(() => this.dynamicComponent(item.el, anchor.ref!, scope, ns));
          } else {
            ops.setup.push(() => [`${this.rt}.replace(${anchor.ref}, `, this.componentCall(item.el, scope, ns), ');']);
          }
          break;
        }
        case 'slot': {
          const anchor = new DNode('comment', '', '');
          anchor.used = true;
          into.push(anchor);
          ops.setup.push(() => this.slotOutlet(item.el, anchor.ref!, scope, ns));
          break;
        }
        case 'special':
          ops.setup.push(() => this.special(item.el, scope));
          break;
        case 'block': {
          const anchor = new DNode('comment', '', '');
          anchor.used = true;
          into.push(anchor);
          const block = item.node;
          ops.setup.push(() => this.block(block, anchor.ref!, scope, ns, parentTag, onlyChild && block.type === 'ForBlock'));
          break;
        }
      }
    }
  }

  private buildText(item: Extract<Item, { k: 'text' }>, scope: BindingScope, ops: Ops): DNode {
    const dynamic = item.parts.some((p) => 'expr' in p);
    if (!dynamic) {
      return new DNode('text', '', escapeText(item.parts.map((p) => ('text' in p ? p.text : '')).join('')));
    }
    const node = new DNode('text', '', ' ');
    node.used = true;
    ops.updates.push({ node, value: this.textValue(item.parts, scope), apply: (ref, v) => `${ref}.nodeValue = ${v}` });
    return node;
  }

  private textValue(parts: TextPart[], scope: BindingScope): Chunk {
    if (parts.length === 1 && 'expr' in parts[0]!) return [`${this.rt}.str(`, this.c.expr(parts[0].expr, scope), ')'];
    const out: Chunk[] = ['`'];
    for (const p of parts) {
      if ('text' in p) out.push(templateLiteralText(p.text));
      else out.push('${', `${this.rt}.str(`, this.c.expr(p.expr, scope), ')}');
    }
    out.push('`');
    return out;
  }

  // -------------------------------------------------------------------------
  // Elements
  // -------------------------------------------------------------------------

  private buildElement(el: Element, scope: BindingScope, ns: Namespace, parentTag: string | null, ops: Ops): DNode {
    const tag = el.name;
    let elNs: Namespace = ns;
    if (tag === 'svg') elNs = 'svg';
    else if (tag === 'math') elNs = 'mathml';
    if (elNs === 'html' && parentTag !== null) {
      const problem = invalidNesting(tag, parentTag);
      if (problem !== null) this.c.error('invalid-nesting', problem, el.start, el.nameSpan.end);
    }
    const node = new DNode('el', tag, '');
    this.attributes(el, node, scope, elNs, ops);

    const childNs: Namespace = tag === 'foreignObject' ? 'html' : elNs;
    const preserve = PRESERVE_WHITESPACE.has(tag);
    const { items, vals } = this.items(el.children, childNs, tag, preserve);
    if (vals.length > 0) this.c.error('val-position', 'val declarations are only allowed at the top of a block body', vals[0]!.start, vals[0]!.start + 3);

    if (tag === 'textarea' && items.length > 0) {
      const only = items[0]!;
      if (items.length > 1 || only.k !== 'text') this.c.error('textarea-content', '<textarea> can only contain text', el.start, el.openEnd);
      if (only.k === 'text' && only.parts.some((p) => 'expr' in p)) {
        node.used = true;
        ops.updates.push({ node, value: this.textValue(only.parts, scope), apply: (ref, v) => `${this.rt}.prop(${ref}, "value", ${v})` });
        return node;
      }
    }
    // text-only content: set textContent instead of navigating to a text node
    const single = items.length === 1 ? items[0] : undefined;
    if (single !== undefined && single.k === 'text' && single.parts.some((p) => 'expr' in p) && !preserve) {
      node.used = true;
      const parts = single.parts;
      ops.updates.push({ node, value: this.textValue(parts, scope), apply: (ref, v) => `${ref}.textContent = ${v}` });
      return node;
    }
    this.buildChildren(items, node.children, scope, childNs, tag, ops, node);
    return node;
  }

  private attributes(el: Element, node: DNode, scope: BindingScope, ns: Namespace, ops: Ops): void {
    const css = this.c.cssScope;
    const hasSpread = el.attributes.some((a) => a.type === 'SpreadAttribute');
    let html = '';
    let staticClass: string | null = null;
    let dynamicClass = false;
    const spreadEntries: Chunk[] = [];
    const use = () => {
      node.used = true;
    };

    for (const attr of el.attributes) {
      if (attr.type === 'SpreadAttribute') {
        if (attr.expression !== null) spreadEntries.push(['...', this.c.expr(attr.expression, scope)]);
        continue;
      }
      const name = ATTRIBUTE_ALIASES[attr.name] ?? attr.name;
      const value = attr.value;
      if (attr.directive !== null) {
        this.directive(el, attr, node, scope, ops);
        continue;
      }
      if (name === 'ref') {
        if (value.type !== 'Expression' || value.expression === null) this.c.error('ref-value', 'ref needs an expression: ref={el}', attr.start, attr.end);
        use();
        const expr = value.expression;
        ops.post.push(() => [`${this.rt}.bindThis(${node.ref}, `, isFunctionLiteral(expr) ? this.c.expr(expr, scope) : this.setterFn(expr, scope), ');']);
        continue;
      }
      const event = eventInfo(name);
      if (hasSpread && event === null) {
        spreadEntries.push([JSON.stringify(name), ': ', this.attrValueChunk(attr, scope)]);
        continue;
      }
      if (value.type === 'Boolean') {
        if (name === 'class') staticClass = '';
        else html += ` ${name}`;
        continue;
      }
      if (value.type === 'Static') {
        if (name === 'class') staticClass = value.value;
        else html += ` ${name}="${escapeAttribute(value.value)}"`;
        continue;
      }
      const expr = value.expression;
      if (expr === null) continue;
      if (event !== null) {
        use();
        this.eventListener(node, event.type, event.capture, expr, scope, ops);
        continue;
      }
      if (isLiteral(expr) && name !== 'value' && !DOM_PROPERTIES.has(name)) {
        const lit = literalValue(expr);
        if (typeof lit === 'boolean' && stringBoolean(name)) {
          html += ` ${name}="${lit}"`;
          continue;
        }
        if (lit === null || lit === false) continue;
        if (name === 'class') {
          staticClass = lit === true ? '' : String(lit);
          continue;
        }
        html += lit === true ? ` ${name}` : ` ${name}="${escapeAttribute(String(lit))}"`;
        continue;
      }
      use();
      const valueChunk = this.c.expr(expr, scope);
      const rt = this.rt;
      if (name === 'class') {
        dynamicClass = true;
        const scopeArg = css !== null ? `, ${JSON.stringify(css)}` : '';
        ops.updates.push({ node, value: valueChunk, apply: (ref, v) => `${rt}.cls(${ref}, ${v}${scopeArg})` });
      } else if (name === 'style') {
        ops.updates.push({ node, value: valueChunk, apply: (ref, v) => `${rt}.style(${ref}, ${v})` });
      } else if (el.name === 'option' && name === 'value') {
        ops.updates.push({ node, value: valueChunk, apply: (ref, v) => `${rt}.optionValueProp(${ref}, ${v})` });
      } else if (DOM_PROPERTIES.has(name)) {
        ops.updates.push({ node, value: valueChunk, apply: (ref, v) => `${rt}.prop(${ref}, ${JSON.stringify(name)}, ${v})` });
      } else if (name.startsWith('xlink:')) {
        ops.updates.push({ node, value: valueChunk, apply: (ref, v) => `${rt}.attrNS(${ref}, "http://www.w3.org/1999/xlink", ${JSON.stringify(name)}, ${v})` });
      } else {
        ops.updates.push({ node, value: valueChunk, apply: (ref, v) => `${rt}.attr(${ref}, ${JSON.stringify(name)}, ${v})` });
      }
    }

    if (spreadEntries.length > 0) {
      use();
      if (staticClass !== null) spreadEntries.unshift(['"class": ', JSON.stringify(staticClass)]);
      const scopeArg = css !== null ? `, ${JSON.stringify(css)}` : '';
      ops.setup.push(() => [`${this.rt}.spread(${node.ref}, () => ({ `, join(spreadEntries, ', '), ` })${scopeArg});`]);
      node.html = html;
      return;
    }
    if (!dynamicClass) {
      const cls = [staticClass ?? '', css ?? ''].filter((c) => c !== '').join(' ');
      if (cls !== '' || staticClass !== null) html = ` class="${escapeAttribute(cls)}"${html}`;
    }
    void ns;
    void BOOLEAN_ATTRIBUTES;
    node.html = html;
  }

  private attrValueChunk(attr: Extract<AttributeLike, { type: 'Attribute' }>, scope: BindingScope): Chunk {
    const value = attr.value;
    if (value.type === 'Boolean') return 'true';
    if (value.type === 'Static') return JSON.stringify(decodeEntities(value.value));
    return value.expression === null ? 'undefined' : this.c.expr(value.expression, scope);
  }

  private eventListener(node: DNode, type: string, capture: boolean, expr: t.Expression, scope: BindingScope, ops: Ops): void {
    const handler = this.handler(expr, scope);
    if (DELEGATED.has(type) && !capture) {
      this.c.file.delegated.add(type);
      ops.setup.push(() => [`${node.ref}.$$${type} = `, handler, ';']);
    } else {
      ops.setup.push(() => [`${this.rt}.listen(${node.ref}, ${JSON.stringify(type)}, `, handler, capture ? ', true);' : ');']);
    }
  }

  /** Event handler value: function literals and stable references are used as-is. */
  handler(expr: t.Expression, scope: BindingScope): Chunk {
    if (isFunctionLiteral(expr)) return this.c.expr(expr, scope);
    if (isStatementLike(expr)) return ['(event) => { ', this.c.expr(expr, scope), '; }'];
    if (expr.type === 'Identifier') {
      const b = scope.lookup(expr.name);
      if (b === undefined || (b.kind === 'plain' && (b.stable || b.write === false))) return this.c.expr(expr, scope);
    }
    if (expr.type === 'MemberExpression' && expr.object.type === 'Identifier' && expr.object.name === 'console') return this.c.expr(expr, scope);
    return ['function (event) { const $h = ', this.c.expr(expr, scope), '; return typeof $h === "function" ? $h.call(this, event) : undefined; }'];
  }

  /** `($v) => { target = $v }` for bindings. */
  setterFn(target: t.Expression, scope: BindingScope): Chunk {
    const v = '$value';
    if (target.type === 'Identifier') {
      const b = scope.lookup(target.name);
      if (b === undefined || b.write === 'plain') return [`(${v}) => { `, target.name, ` = ${v}; }`];
      if (b.write === false) this.c.error('readonly-binding', `Cannot bind to ${b.description} '${b.name}'`, target.start ?? 0, target.end ?? 0);
      if (b.write === 'prop') return `(${v}) => { ${this.rt}.setProp(${this.c.props}, ${JSON.stringify(b.propKey ?? b.name)}, ${v}); }`;
      return `(${v}) => { ${this.rt}.set(${b.source ?? b.name}, ${v}); }`;
    }
    if (target.type === 'MemberExpression') return [`(${v}) => { `, this.c.expr(target, scope), ` = ${v}; }`];
    return this.c.error('invalid-binding', 'Bindings need a variable or property: bind:value={name} / bind:value={obj.prop}', target.start ?? 0, target.end ?? 0);
  }

  private getterFn(expr: t.Expression, scope: BindingScope): Chunk {
    return ['() => ', this.c.expr(expr, scope)];
  }

  private directive(el: Element, attr: Extract<AttributeLike, { type: 'Attribute' }>, node: DNode, scope: BindingScope, ops: Ops): void {
    const value = attr.value;
    const arg = attr.arg;
    const rt = this.rt;
    node.used = true;
    const exprOf = (): t.Expression => {
      if (value.type === 'Expression' && value.expression !== null) return value.expression;
      if (value.type === 'Boolean') return identifier(arg, attr.nameSpan.start + attr.name.indexOf(':') + 1);
      return this.c.error('directive-value', `${attr.name} needs an expression value`, attr.start, attr.end);
    };
    switch (attr.directive) {
      case 'class': {
        const expr = exprOf();
        ops.updates.push({ node, value: this.c.expr(expr, scope), apply: (ref, v) => `${rt}.toggleClass(${ref}, ${JSON.stringify(arg)}, ${v})` });
        return;
      }
      case 'style': {
        if (value.type === 'Static') {
          ops.setup.push(() => `${rt}.styleProp(${node.ref}, ${JSON.stringify(arg)}, ${JSON.stringify(value.value)});`);
          return;
        }
        const expr = exprOf();
        const important = arg.endsWith('|important');
        const prop = important ? arg.slice(0, -10) : arg;
        ops.updates.push({ node, value: this.c.expr(expr, scope), apply: (ref, v) => `${rt}.styleProp(${ref}, ${JSON.stringify(prop)}, ${v}${important ? ', true' : ''})` });
        return;
      }
      case 'on': {
        const expr = exprOf();
        ops.setup.push(() => [`${rt}.listen(${node.ref}, ${JSON.stringify(arg)}, `, this.handler(expr, scope), ');']);
        return;
      }
      case 'use': {
        const parts = arg.split('.');
        const root = parts[0]!;
        const rootId = identifier(root, attr.nameSpan.start + 4);
        const fn: Chunk = [this.c.expr(rootId, scope), parts.length > 1 ? `.${parts.slice(1).join('.')}` : ''];
        const params = value.type === 'Expression' && value.expression !== null ? value.expression : null;
        ops.post.push(() => [`${rt}.action(${node.ref}, `, fn, params === null ? '' : [', ', this.getterFn(params, scope)], ');']);
        return;
      }
      case 'bind':
        this.binding(el, attr, node, scope, ops, exprOf());
        return;
      default:
        return;
    }
  }

  private binding(el: Element, attr: Extract<AttributeLike, { type: 'Attribute' }>, node: DNode, scope: BindingScope, ops: Ops, target: t.Expression): void {
    const arg = attr.arg;
    const rt = this.rt;
    const getter = this.getterFn(target, scope);
    const setter = this.setterFn(target, scope);
    if (arg === 'value') {
      if (el.name !== 'input' && el.name !== 'textarea' && el.name !== 'select') {
        this.c.error('invalid-binding', 'bind:value only works on <input>, <textarea> and <select>', attr.start, attr.end);
      }
      ops.post.push(() => [`${rt}.bindValue(${node.ref}, `, getter, ', ', setter, ');']);
    } else if (arg === 'checked') {
      ops.post.push(() => [`${rt}.bindChecked(${node.ref}, `, getter, ', ', setter, ');']);
    } else if (arg === 'group') {
      const valueAttr = el.attributes.find((a) => a.type === 'Attribute' && a.name === 'value' && a.directive === null);
      if (valueAttr === undefined || valueAttr.type !== 'Attribute') {
        return this.c.error('invalid-binding', 'bind:group needs a value attribute on the same input', attr.start, attr.end);
      }
      const valueChunk = this.attrValueChunk(valueAttr, scope);
      ops.post.push(() => [`${rt}.bindGroup(${node.ref}, `, getter, ', ', setter, ', () => ', valueChunk, ');']);
    } else if (arg === 'this') {
      ops.post.push(() => [`${rt}.bindThis(${node.ref}, `, setter, ');']);
    } else if (SIZE_BINDINGS.has(arg)) {
      ops.post.push(() => [`${rt}.bindSize(${node.ref}, ${JSON.stringify(arg)}, `, setter, ');']);
    } else if (arg in PROPERTY_BINDINGS) {
      ops.post.push(() => [`${rt}.bindProperty(${node.ref}, ${JSON.stringify(arg)}, ${JSON.stringify(PROPERTY_BINDINGS[arg])}, `, getter, ', ', setter, ');']);
    } else {
      this.c.error('unknown-binding', `Unknown binding bind:${arg}`, attr.start, attr.end);
    }
  }

  // -------------------------------------------------------------------------
  // Components & slots
  // -------------------------------------------------------------------------

  private tagExpression(el: Element): t.Expression {
    const parts = el.name.split('.');
    let expr: t.Expression = identifier(parts[0]!, el.nameSpan.start);
    let offset = el.nameSpan.start + parts[0]!.length;
    for (const part of parts.slice(1)) {
      const prop = identifier(part, offset + 1);
      expr = { type: 'MemberExpression', object: expr, property: prop, computed: false, start: el.nameSpan.start, end: offset + 1 + part.length };
      offset += 1 + part.length;
    }
    return expr;
  }

  isDynamicComponent(el: Element, scope: BindingScope): boolean {
    const root = el.name.split('.')[0]!;
    const b = scope.lookup(root);
    return b !== undefined && b.kind !== 'plain';
  }

  private componentCall(el: Element, scope: BindingScope, ns: Namespace): Chunk {
    const tag = this.c.expr(this.tagExpression(el), scope);
    return [origin('', el.start), tag, '(', this.componentProps(el, scope, ns), ')'];
  }

  private dynamicComponent(el: Element, anchor: string, scope: BindingScope, ns: Namespace): Chunk {
    const tag = this.c.expr(this.tagExpression(el), scope);
    return [`${this.rt}.dynamic(${anchor}, () => `, tag, ', ', this.componentProps(el, scope, ns), ');'];
  }

  /** Props object for a component element (getters keep values reactive). */
  componentProps(el: Element, scope: BindingScope, ns: Namespace): Chunk {
    const groups: Chunk[] = [];
    let entries: Chunk[] = [];
    const flushEntries = () => {
      if (entries.length > 0) groups.push(['{ ', join(entries, ', '), ' }']);
      entries = [];
    };
    for (const attr of el.attributes) {
      if (attr.type === 'SpreadAttribute') {
        flushEntries();
        if (attr.expression !== null) groups.push(['() => ', this.c.expr(attr.expression, scope)]);
        continue;
      }
      const key = JSON.stringify(attr.directive === 'bind' ? attr.arg : attr.name);
      if (attr.directive === 'bind') {
        const target = attr.value.type === 'Expression' && attr.value.expression !== null ? attr.value.expression : identifier(attr.arg, attr.nameSpan.start + 5);
        entries.push([`get ${key}() { return `, this.c.expr(target, scope), `; }`]);
        entries.push([`set ${key}($value) { (`, this.setterFn(target, scope), ')($value); }']);
        continue;
      }
      if (attr.directive !== null) {
        this.c.error('component-directive', `${attr.directive}: directives are not supported on components`, attr.start, attr.end);
      }
      const value = attr.value;
      if (value.type !== 'Expression') {
        entries.push([key, ': ', this.attrValueChunk(attr, scope)]);
        continue;
      }
      const expr = value.expression;
      if (expr === null) continue;
      if (isLiteral(expr) || isFunctionLiteral(expr) || this.isStableReference(expr, scope)) {
        entries.push([key, ': ', this.c.expr(expr, scope)]);
      } else {
        entries.push([`get ${key}() { return `, this.c.expr(expr, scope), '; }']);
      }
    }
    // children and named slots
    const slotDefs = el.children.filter((c): c is SlotDefinition => c.type === 'SlotDefinition');
    const content = el.children.filter((c) => c.type !== 'SlotDefinition');
    const { items } = this.items(content, ns, null, false);
    if (items.length > 0) entries.push(['"children": ', this.renderFn(content, scope.child(), ns)]);
    for (const def of slotDefs) entries.push([JSON.stringify(def.name), ': ', this.slotFn(def, scope, ns)]);
    flushEntries();
    if (groups.length === 0) return '{}';
    if (groups.length === 1 && typeof groups[0] !== 'string' && text(groups[0]!).startsWith('{')) return groups[0]!;
    return [`${this.rt}.spreadProps(`, join(groups, ', '), ')'];
  }

  private isStableReference(expr: t.Expression, scope: BindingScope): boolean {
    if (expr.type !== 'Identifier') return false;
    const b = scope.lookup(expr.name);
    return b === undefined || (b.kind === 'plain' && (b.stable || b.write === false));
  }

  private slotFn(def: SlotDefinition, scope: BindingScope, ns: Namespace): Chunk {
    const inner = scope.child();
    let param = '';
    if (def.params !== null) {
      if (def.params.type === 'Identifier') {
        param = def.params.name;
        inner.add({ name: param, kind: 'plain', read: param, write: false, reactive: true, stable: false, description: 'slot argument', start: def.params.start ?? 0 });
      } else {
        param = this.c.file.name('args');
        this.bindPattern(def.params, param, inner, 'slot argument');
      }
    }
    return this.renderFn(def.body.children, inner, ns, param);
  }

  private slotOutlet(el: Element, anchor: string, scope: BindingScope, ns: Namespace): Chunk {
    let name = 'children';
    const args: Chunk[] = [];
    for (const attr of el.attributes) {
      if (attr.type === 'SpreadAttribute') {
        this.c.error('slot-spread', 'Spread attributes are not supported on <slot>', attr.start, attr.end);
      }
      if (attr.name === 'name') {
        if (attr.value.type !== 'Static') this.c.error('slot-name', '<slot name="..."> must be a static string', attr.start, attr.end);
        name = attr.value.value === 'default' ? 'children' : attr.value.value;
        continue;
      }
      const key = JSON.stringify(attr.name);
      const value = attr.value;
      if (value.type === 'Expression' && value.expression !== null && !isLiteral(value.expression)) {
        args.push([`get ${key}() { return `, this.c.expr(value.expression, scope), '; }']);
      } else {
        args.push([key, ': ', this.attrValueChunk(attr, scope)]);
      }
    }
    const fallbackItems = this.items(el.children, ns, null, false).items;
    const fallback: Chunk = fallbackItems.length > 0 ? this.renderFn(el.children, scope.child(), ns) : 'null';
    const argsChunk: Chunk = args.length > 0 ? ['{ ', join(args, ', '), ' }'] : '{}';
    return [`${this.rt}.slot(${anchor}, () => ${this.c.props}[${JSON.stringify(name)}], `, argsChunk, ', ', fallback, ');'];
  }

  // -------------------------------------------------------------------------
  // Special elements
  // -------------------------------------------------------------------------

  private special(el: Element, scope: BindingScope): Chunk {
    const rt = this.rt;
    if (el.kind === 'head') {
      const out: Chunk[] = [];
      const others: TemplateNode[] = [];
      for (const child of el.children) {
        if (child.type === 'Element' && child.name === 'title') {
          const { items } = this.items(child.children, 'html', 'title', false);
          const only = items[0];
          const value: Chunk = only !== undefined && only.k === 'text' ? this.textValue(only.parts, scope) : '""';
          out.push([`${rt}.title(() => `, value, ');']);
        } else {
          others.push(child);
        }
      }
      if (this.items(others, 'html', null, false).items.length > 0) out.push([`${rt}.head(`, this.renderFn(others, scope.child(), 'html'), ');']);
      return join(out, '\n');
    }
    const target = el.kind === 'window' ? 'window' : el.kind === 'document' ? 'document' : 'document.body';
    const out: Chunk[] = [];
    for (const attr of el.attributes) {
      const event = attr.type === 'Attribute' ? (attr.directive === 'on' ? { type: attr.arg, capture: false } : eventInfo(attr.name)) : null;
      if (attr.type !== 'Attribute' || event === null || attr.value.type !== 'Expression' || attr.value.expression === null) {
        return this.c.error('special-element', `<${el.name}> only supports event attributes (e.g. onResize={...})`, attr.start, attr.end);
      }
      out.push([`${rt}.on(${target}, ${JSON.stringify(event.type)}, `, this.handler(attr.value.expression, scope), event.capture ? ', true);' : ');']);
    }
    if (el.children.some((c) => c.type !== 'Text' || c.raw.trim() !== '')) {
      this.c.error('special-element', `<${el.name}> cannot have children`, el.start, el.openEnd);
    }
    return join(out, '\n');
  }

  // -------------------------------------------------------------------------
  // Blocks
  // -------------------------------------------------------------------------

  private block(block: Block, anchor: string, scope: BindingScope, ns: Namespace, parentTag: string | null, onlyChild: boolean): Chunk {
    switch (block.type) {
      case 'IfBlock':
        return this.ifBlock(block, anchor, scope, ns, parentTag);
      case 'ForBlock':
        return this.forBlock(block, anchor, scope, ns, parentTag, onlyChild);
      case 'SwitchBlock':
        return this.switchBlock(block, anchor, scope, ns, parentTag);
      case 'AwaitBlock':
        return this.awaitBlock(block, anchor, scope, ns, parentTag);
      case 'TryBlock':
        return this.tryBlock(block, anchor, scope, ns, parentTag);
      case 'KeyBlock':
        return this.keyBlock(block, anchor, scope, ns, parentTag);
    }
  }

  private requireExpr(expr: t.Expression | null, start: number, what: string): t.Expression {
    if (expr === null) return this.c.error('missing-expression', `Missing expression in ${what}`, start);
    return expr;
  }

  private ifBlock(block: IfBlock, anchor: string, scope: BindingScope, ns: Namespace, parentTag: string | null): Chunk {
    const rt = this.rt;
    const renders = block.branches.map((b) => this.renderFn(b.body.children, scope.child(), ns, '', parentTag));
    if (block.alternate !== null) renders.push(this.renderFn(block.alternate.children, scope.child(), ns, '', parentTag));
    if (block.branches.length === 1) {
      const test = this.c.expr(this.requireExpr(block.branches[0]!.test, block.start, 'if'), scope);
      return [origin(`${rt}.when(${anchor}, () => `, block.start), test, ', ', renders[0]!, block.alternate !== null ? [', ', renders[1]!] : '', ');'];
    }
    const select: Chunk[] = [];
    block.branches.forEach((b, i) => {
      select.push('(', this.c.expr(this.requireExpr(b.test, b.start, 'else if'), scope), `) ? ${i} : `);
    });
    select.push(block.alternate !== null ? String(block.branches.length) : '-1');
    return [origin(`${rt}.branch(${anchor}, () => `, block.start), select, ', [', join(renders, ', '), ']);'];
  }

  private switchBlock(block: SwitchBlock, anchor: string, scope: BindingScope, ns: Namespace, parentTag: string | null): Chunk {
    const rt = this.rt;
    const d = this.c.file.name('d');
    const select: Chunk[] = [`{ const ${d} = `, this.c.expr(this.requireExpr(block.discriminant, block.start, 'switch'), scope), '; '];
    const renders: Chunk[] = [];
    block.cases.forEach((c, i) => {
      const tests = c.tests.map((t0) => [`${d} === (`, this.c.expr(t0, scope), ')']);
      const cond: Chunk[] = ['(', join(tests, ' || '), ')'];
      if (c.guard !== null) cond.push(' && (', this.c.expr(c.guard, scope), ')');
      select.push('if (', cond, `) return ${i}; `);
      renders.push(this.renderFn(c.body.children, scope.child(), ns, '', parentTag));
    });
    if (block.fallback !== null) {
      select.push(`return ${block.cases.length}; }`);
      renders.push(this.renderFn(block.fallback.children, scope.child(), ns, '', parentTag));
    } else {
      select.push('return -1; }');
    }
    return [origin(`${rt}.branch(${anchor}, () => `, block.start), select, ', [', join(renders, ', '), ']);'];
  }

  private forBlock(block: ForBlock, anchor: string, scope: BindingScope, ns: Namespace, parentTag: string | null, onlyChild: boolean): Chunk {
    const rt = this.rt;
    const inner = scope.child();
    let flags = onlyChild ? EACH_ONLY_CHILD : 0;
    if (block.item === null) return this.c.error('missing-loop-variable', 'Missing loop variable', block.start);

    // meta
    let metaParam = '';
    const metaNames = new Set<string>();
    if (block.meta !== null) {
      flags |= EACH_META | EACH_INDEX_SOURCE;
      if (block.meta.type === 'Identifier') {
        metaParam = block.meta.name;
        inner.add({ name: metaParam, kind: 'plain', read: metaParam, write: false, reactive: true, stable: false, description: 'loop meta', start: block.meta.start ?? 0 });
      } else {
        metaParam = this.c.file.name('meta');
        for (const p of block.meta.properties) {
          if (p.type !== 'ObjectProperty' || p.key.type !== 'Identifier' || p.value.type !== 'Identifier') {
            this.c.error('invalid-meta', 'Loop meta destructuring supports { index, first, last, even, odd, length } (optionally renamed)', p.start ?? 0, p.end ?? 0);
          }
          const key = p.key.name;
          const local = p.value.name;
          if (!['index', 'first', 'last', 'even', 'odd', 'length'].includes(key)) {
            this.c.error('invalid-meta', `Unknown loop meta '${key}' (available: index, first, last, even, odd, length)`, p.start ?? 0, p.end ?? 0);
          }
          metaNames.add(local);
          inner.add({ name: local, kind: 'path', read: `${metaParam}.${key}`, write: false, reactive: true, stable: false, description: 'loop meta', start: p.start ?? 0 });
        }
      }
    }

    // track clause
    let keyFn: Chunk = 'null';
    const item = block.item;
    if (block.track !== null) {
      const track = block.track;
      const isIndex =
        (track.type === 'Identifier' && metaNames.has(track.name) && inner.lookup(track.name)?.read.endsWith('.index') === true) ||
        (track.type === 'Identifier' && track.name === 'index' && inner.lookup('index') === undefined) ||
        (track.type === 'MemberExpression' &&
          track.object.type === 'Identifier' &&
          block.meta?.type === 'Identifier' &&
          track.object.name === block.meta.name &&
          track.property.type === 'Identifier' &&
          track.property.name === 'index');
      if (isIndex) {
        flags |= EACH_KEY_INDEX | EACH_ITEM_SOURCE;
      } else {
        flags |= EACH_ITEM_SOURCE;
        const keyScope = scope.child();
        let keyParam: string;
        if (item.type === 'Identifier') {
          keyParam = item.name;
          keyScope.add({ name: keyParam, kind: 'plain', read: keyParam, write: false, reactive: true, stable: false, description: 'loop item', start: item.start ?? 0 });
        } else {
          keyParam = this.c.file.name('item');
          this.bindPattern(item, keyParam, keyScope, 'loop item');
        }
        keyFn = [`(${keyParam}) => `, this.c.expr(track, keyScope)];
      }
    }

    // loop item
    const itemSource = (flags & EACH_ITEM_SOURCE) !== 0;
    let itemParam: string;
    if (item.type === 'Identifier') {
      itemParam = item.name;
      inner.add(
        itemSource
          ? { name: itemParam, kind: 'signal', read: `${rt}.get(${itemParam})`, source: itemParam, write: false, reactive: true, stable: false, description: 'loop item', start: item.start ?? 0 }
          : { name: itemParam, kind: 'plain', read: itemParam, write: false, reactive: true, stable: false, description: 'loop item', start: item.start ?? 0 },
      );
    } else {
      itemParam = this.c.file.name('item');
      this.bindPattern(item, itemSource ? `${rt}.get(${itemParam})` : itemParam, inner, 'loop item');
    }

    // iterable
    let list: Chunk;
    const it = block.iterable;
    if (it.kind === 'range') {
      list = [`${rt}.range(`, this.c.expr(this.requireExpr(it.from, it.span.start, 'range'), scope), ', ', this.c.expr(this.requireExpr(it.to, it.span.start, 'range'), scope), ')'];
    } else {
      list = this.c.expr(this.requireExpr(it.expression, it.span.start, 'for'), scope);
    }
    if (block.reverse) list = [`${rt}.rev(`, list, ')'];

    const params = metaParam !== '' ? `${itemParam}, ${this.c.file.name('i')}, ${metaParam}` : itemParam;
    const render = this.renderFn(block.body.children, inner, ns, params, parentTag);
    const empty: Chunk = block.empty !== null ? this.renderFn(block.empty.children, scope.child(), ns, '', parentTag) : 'null';
    return [origin(`${rt}.each(${anchor}, () => `, block.start), list, ', ', render, ', ', keyFn, `, ${flags}, `, empty, ');'];
  }

  /** Bind each name of a destructuring pattern to a path on `root`. */
  bindPattern(pattern: t.Node, root: string, scope: BindingScope, description: string): void {
    const visit = (node: t.Node, path: string) => {
      switch (node.type) {
        case 'Identifier':
          scope.add({ name: node.name, kind: 'path', read: path, write: false, reactive: true, stable: false, description, start: node.start ?? 0 });
          return;
        case 'ObjectPattern':
          for (const p of node.properties) {
            if (p.type === 'RestElement') {
              const keys = node.properties.flatMap((q) => (q.type === 'ObjectProperty' && q.key.type === 'Identifier' ? [JSON.stringify(q.key.name)] : []));
              for (const id of patternNames(p.argument)) {
                scope.add({ name: id.name, kind: 'path', read: `${this.rt}.restProps(${path}, [${keys.join(', ')}])`, write: false, reactive: true, stable: false, description, start: id.start ?? 0 });
              }
              continue;
            }
            if (p.computed) this.c.error('computed-pattern', 'Computed keys are not supported in this pattern', p.start ?? 0, p.end ?? 0);
            const key = p.key.type === 'Identifier' ? p.key.name : p.key.type === 'StringLiteral' ? p.key.value : String(p.key.type === 'NumericLiteral' ? p.key.value : '');
            const access = isIdentifierName(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
            visit(p.value, access);
          }
          return;
        case 'ArrayPattern':
          node.elements.forEach((el, i) => {
            if (el === null) return;
            if (el.type === 'RestElement') {
              for (const id of patternNames(el.argument)) {
                scope.add({ name: id.name, kind: 'path', read: `${path}.slice(${i})`, write: false, reactive: true, stable: false, description, start: id.start ?? 0 });
              }
              return;
            }
            visit(el, `${path}[${i}]`);
          });
          return;
        case 'AssignmentPattern': {
          const fallback = text(this.c.expr(node.right, scope));
          visit(node.left, `((v) => v === undefined ? ${fallback} : v)(${path})`);
          return;
        }
        default:
          this.c.error('invalid-pattern', 'Unsupported destructuring pattern', node.start ?? 0, node.end ?? 0);
      }
    };
    visit(pattern, root);
  }

  private awaitBlock(block: AwaitBlock, anchor: string, scope: BindingScope, ns: Namespace, parentTag: string | null): Chunk {
    const rt = this.rt;
    const promise = this.c.expr(this.requireExpr(block.expression, block.start, 'await'), scope);
    const pending: Chunk = block.pending !== null ? this.renderFn(block.pending.children, scope.child(), ns, '', parentTag) : 'null';
    const sourceFn = (pattern: t.LVal | null, body: TemplateNode[], description: string, hint: string): Chunk => {
      const inner = scope.child();
      let param = this.c.file.name(hint);
      if (pattern !== null) {
        if (pattern.type === 'Identifier') {
          param = pattern.name;
          inner.add({ name: param, kind: 'signal', read: `${rt}.get(${param})`, source: param, write: false, reactive: true, stable: false, description, start: pattern.start ?? 0 });
        } else {
          this.bindPattern(pattern, `${rt}.get(${param})`, inner, description);
        }
      }
      return this.renderFn(body, inner, ns, param, parentTag);
    };
    const then: Chunk = block.then !== null ? sourceFn(block.then.value, block.then.body.children, 'awaited value', 'value') : 'null';
    const caught: Chunk = block.catch !== null ? sourceFn(block.catch.error, block.catch.body.children, 'error', 'error') : 'null';
    return [origin(`${rt}.awaitBlock(${anchor}, () => `, block.start), promise, ', ', pending, ', ', then, ', ', caught, ');'];
  }

  private tryBlock(block: TryBlock, anchor: string, scope: BindingScope, ns: Namespace, parentTag: string | null): Chunk {
    const rt = this.rt;
    const body = this.renderFn(block.body.children, scope.child(), ns, '', parentTag);
    if (block.catch === null) return this.c.error('missing-catch', 'try needs a catch block', block.start);
    const inner = scope.child();
    let errorParam = this.c.file.name('error');
    const pattern = block.catch.error;
    if (pattern !== null) {
      if (pattern.type === 'Identifier') {
        errorParam = pattern.name;
        inner.add({ name: errorParam, kind: 'signal', read: `${rt}.get(${errorParam})`, source: errorParam, write: false, reactive: true, stable: false, description: 'error', start: pattern.start ?? 0 });
      } else {
        this.bindPattern(pattern, `${rt}.get(${errorParam})`, inner, 'error');
      }
    }
    let resetParam = this.c.file.name('reset');
    if (block.catch.reset !== null) {
      resetParam = block.catch.reset.name;
      inner.add({ name: resetParam, kind: 'plain', read: resetParam, write: false, reactive: false, stable: true, description: 'reset function', start: block.catch.reset.start ?? 0 });
    }
    const fallback = this.renderFn(block.catch.body.children, inner, ns, `${errorParam}, ${resetParam}`, parentTag);
    return [origin(`${rt}.tryBlock(${anchor}, `, block.start), body, ', ', fallback, ');'];
  }

  private keyBlock(block: KeyBlock, anchor: string, scope: BindingScope, ns: Namespace, parentTag: string | null): Chunk {
    const rt = this.rt;
    const key = this.c.expr(this.requireExpr(block.expression, block.start, 'key'), scope);
    return [origin(`${rt}.keyed(${anchor}, () => `, block.start), key, ', ', this.renderFn(block.body.children, scope.child(), ns, '', parentTag), ');'];
  }
}

export type { Binding };
