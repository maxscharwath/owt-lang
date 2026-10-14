/**
 * Generates type-checkable TypeScript from an `.owt` file.
 *
 * The generated code mirrors the component as a plain function: module code
 * and component statements are copied verbatim, `var` / `val` become `let` /
 * `const`, and markup becomes calls to typed helpers (`__owt.el("input", {...})`,
 * `Button({...})`) plus real `if` / `for` / `switch`
 * statements so TypeScript narrowing works. Every piece of user code is
 * mapped back to the `.owt` source, which is how diagnostics, completions,
 * hover, go-to-definition and rename work in editors.
 *
 * Generation works from source spans rather than parsed expressions, so
 * half-typed code (e.g. `{user.`) still reaches TypeScript for completions.
 */
import type {
  Attribute,
  AwaitBlock,
  ComponentDecl,
  Element,
  ForBlock,
  IfBlock,
  KeyBlock,
  Program,
  SlotDefinition,
  Span,
  SwitchBlock,
  TemplateNode,
  TryBlock,
  ValDecl,
  VarDecl,
} from '@owt/ast';
import type { CodeInformation, CodeMapping } from '@volar/language-core';

const FULL: CodeInformation = { verification: true, completion: true, semantic: true, navigation: true, structure: true, format: false };
const VERIFY: CodeInformation = { verification: true };
const COMPLETE: CodeInformation = { completion: true };
const TAG: CodeInformation = { verification: true, completion: true, navigation: true, semantic: false };
const NAME: CodeInformation = { verification: true, completion: true, semantic: true, navigation: true };

const RESERVED = new Set([
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'new',
  'null',
  'return',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
  'let',
  'static',
  'implements',
  'interface',
  'package',
  'private',
  'protected',
  'public',
  'await',
]);

export type Generated = { code: string; mappings: CodeMapping[] };

function isIdentifierName(name: string): boolean {
  if (name === '') return false;
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i);
    const letter = (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 36 || c > 127;
    if (!letter && !(i > 0 && c >= 48 && c <= 57)) return false;
  }
  return true;
}

function eventName(name: string): boolean {
  return name.length > 2 && name.startsWith('on') && name.charCodeAt(2) >= 65 && name.charCodeAt(2) <= 90;
}

/** Names bound by a destructuring pattern (props declared but only used through `<slot>` stay "used"). */
function patternBindingNames(node: { type: string }): string[] {
  const out: string[] = [];
  const visit = (n: unknown) => {
    if (typeof n !== 'object' || n === null) return;
    const node = n as { type?: string; name?: string; properties?: unknown[]; elements?: unknown[]; value?: unknown; left?: unknown; argument?: unknown };
    switch (node.type) {
      case 'Identifier':
        if (node.name !== undefined) out.push(node.name);
        return;
      case 'ObjectPattern':
        node.properties?.forEach((p) => {
          const prop = p as { type: string; value?: unknown; argument?: unknown };
          visit(prop.type === 'RestElement' ? prop.argument : prop.value);
        });
        return;
      case 'ArrayPattern':
        node.elements?.forEach(visit);
        return;
      case 'AssignmentPattern':
        visit(node.left);
        return;
      case 'RestElement':
        visit(node.argument);
        return;
      default:
        return;
    }
  };
  visit(node);
  return out;
}

class Builder {
  code = '';
  readonly mappings: CodeMapping[] = [];

  constructor(readonly source: string) {}

  text(s: string): void {
    this.code += s;
  }

  /** Copy source[start, end) mapped. */
  map(start: number, end: number, data: CodeInformation = FULL): void {
    if (end < start) return;
    const text = this.source.slice(start, end);
    this.mappings.push({ sourceOffsets: [start], generatedOffsets: [this.code.length], lengths: [text.length], data });
    this.code += text;
  }

  /** Emit `text` mapped to source[start, start + length) (lengths may differ). */
  mapAs(text: string, start: number, length: number, data: CodeInformation = FULL): void {
    if (length === text.length) {
      this.mappings.push({ sourceOffsets: [start], generatedOffsets: [this.code.length], lengths: [length], data });
    } else {
      this.mappings.push({ sourceOffsets: [start], generatedOffsets: [this.code.length], lengths: [length], generatedLengths: [text.length], data });
    }
    this.code += text;
  }

  /** Zero-length mapping (completion trigger positions). */
  anchor(sourceOffset: number, data: CodeInformation = COMPLETE): void {
    this.mappings.push({ sourceOffsets: [sourceOffset], generatedOffsets: [this.code.length], lengths: [0], data });
  }

  /** Map the generated range [from, now) to a source range (lengths may differ). */
  wrap(from: number, source: Span, data: CodeInformation = VERIFY): void {
    this.mappings.push({
      sourceOffsets: [source.start],
      generatedOffsets: [from],
      lengths: [source.end - source.start],
      generatedLengths: [this.code.length - from],
      data,
    });
  }
}

class ComponentGen {
  private counter = 0;
  /** local names of named-param props that are reserved words (`class` → `$$class`) */
  private readonly renamed = new Map<string, string>();

  constructor(
    private readonly b: Builder,
    private readonly src: string,
    private readonly component: ComponentDecl,
  ) {}

  private id(hint: string): string {
    return `__${hint}${++this.counter}`;
  }

  /** Raw expression text in [start, end) (an empty expression becomes a completion anchor). */
  private expr(span: Span): void {
    const text = this.src.slice(span.start, span.end);
    if (text.trim() === '') {
      this.b.text('(');
      this.b.anchor(span.start);
      this.b.text('undefined)');
      return;
    }
    this.b.text('(');
    this.b.map(span.start, span.end);
    this.b.text(')');
  }

  private identifierRef(name: string, start: number): void {
    const local = this.renamed.get(name);
    if (local !== undefined) this.b.mapAs(local, start, name.length, NAME);
    else this.b.map(start, start + name.length, NAME);
  }

  // -------------------------------------------------------------------------

  generate(): void {
    const c = this.component;
    const b = this.b;
    // types of named props that only have a default value: inferred from an (unmapped) copy of the defaults
    if (c.params.kind === 'named') {
      const untyped = c.params.params.filter((q) => q.type === null && q.defaultValue !== null && !q.rest);
      if (untyped.length > 0) {
        b.text(`function __defaults_${c.name}() { return { `);
        for (const q of untyped) {
          b.text(`${JSON.stringify(q.name)}: (${this.src.slice(q.defaultValue!.start ?? 0, q.defaultValue!.end ?? 0)}), `);
        }
        b.text('}; }\n');
      }
    }
    b.text(c.exported ? (c.isDefault ? 'export default function ' : 'export function ') : 'function ');
    b.map(c.nameSpan.start, c.nameSpan.end, NAME);
    if (c.typeParams !== null) b.map(c.typeParams.start, c.typeParams.end);
    b.text('(');
    const slots = this.slotNames();
    const slotType = slots.length > 0 ? ` & __owt_types.SlotProps<${slots.map((s) => JSON.stringify(s)).join(' | ')}>` : '';
    const p = c.params;
    const setup: (() => void)[] = [];
    switch (p.kind) {
      case 'none':
        b.text(`__props: {}${slotType}`);
        break;
      case 'object': {
        b.map(p.id.start ?? 0, (p.id.start ?? 0) + p.id.name.length, NAME);
        b.text(': ');
        if (p.type !== null) {
          b.text('(');
          b.map(p.type.start, p.type.end);
          b.text(')');
        } else {
          b.text('{}');
        }
        b.text(slotType);
        setup.push(() => b.text(`const __props = ${p.id.name};\n`));
        break;
      }
      case 'pattern': {
        b.text('__props: ');
        if (p.type !== null) {
          b.text('(');
          b.map(p.type.start, p.type.end);
          b.text(')');
        } else {
          b.text('{ [key: string]: unknown }');
        }
        b.text(slotType);
        const pattern = p.pattern;
        setup.push(() => {
          b.text('let ');
          b.map(pattern.start ?? 0, pattern.typeAnnotation?.start ?? pattern.end ?? 0);
          b.text(' = __props;\n');
          const names = patternBindingNames(pattern);
          if (names.length > 0) b.text(`void [${names.join(', ')}];\n`);
        });
        break;
      }
      case 'named': {
        b.text('__props: {');
        for (const param of p.params) {
          if (param.rest) continue;
          b.text(' ');
          b.mapAs(isIdentifierName(param.name) ? param.name : JSON.stringify(param.name), param.nameSpan.start, param.name.length, NAME);
          b.text(param.optional || param.defaultValue !== null ? '?: ' : ': ');
          if (param.type !== null) b.map(param.type.start, param.type.end);
          else if (param.defaultValue !== null) b.text(`ReturnType<typeof __defaults_${c.name}>[${JSON.stringify(param.name)}]`);
          else b.text('unknown');
          b.text(';');
        }
        const rest = p.params.find((q) => q.rest);
        b.text(' }');
        if (rest?.type) {
          b.text(' & (');
          b.map(rest.type.start, rest.type.end);
          b.text(')');
        }
        b.text(slotType);
        setup.push(() => {
          b.text('let { ');
          for (const param of p.params) {
            if (param.rest) {
              b.text('...');
              b.map(param.nameSpan.start, param.nameSpan.end, NAME);
              b.text(', ');
              continue;
            }
            const key = isIdentifierName(param.name) ? param.name : JSON.stringify(param.name);
            if (RESERVED.has(param.name)) {
              const local = `$$${param.name}`;
              this.renamed.set(param.name, local);
              b.text(`${key}: `);
              b.mapAs(local, param.nameSpan.start, param.name.length, NAME);
            } else {
              b.map(param.nameSpan.start, param.nameSpan.end, NAME);
            }
            if (param.defaultValue !== null) {
              b.text(' = ');
              b.map(param.defaultValue.start ?? 0, param.defaultValue.end ?? 0);
            }
            b.text(', ');
          }
          b.text('} = __props;\n');
          const locals = p.params.map((q) => (RESERVED.has(q.name) && !q.rest ? `$$${q.name}` : q.name));
          if (locals.length > 0) b.text(`void [${locals.join(', ')}];\n`);
        });
        break;
      }
    }
    b.text('): Node {\n');
    for (const s of setup) s();
    if (p.kind !== 'object' && !this.declares('props')) b.text('const props = __props;\n');
    b.text('void props;\n');

    const markup: TemplateNode[] = [];
    for (const item of c.body) {
      switch (item.type) {
        case 'VarDecl':
        case 'ValDecl':
          this.declaration(item);
          break;
        case 'Statement':
          b.map(item.start, item.end);
          b.text(';\n');
          break;
        default:
          markup.push(item);
      }
    }
    // markup goes in a closure: `var`s are reassigned by event handlers, so
    // TypeScript must not narrow them to their initial value
    b.text('const __markup = () => {\n');
    this.nodes(markup);
    b.text('};\nvoid __markup;\nreturn __owt.node;\n}\n');
  }

  private declares(name: string): boolean {
    return this.component.body.some((item) => {
      if (item.type === 'VarDecl' || item.type === 'ValDecl') return item.declarations.some((d) => d.name === name);
      if (item.type === 'Statement' && item.node !== null) {
        const n = item.node;
        if ((n.type === 'FunctionDeclaration' || n.type === 'ClassDeclaration') && n.id?.name === name) return true;
        if (n.type === 'VariableDeclaration') return n.declarations.some((d) => d.id.type === 'Identifier' && d.id.name === name);
      }
      return false;
    });
  }

  /** Slot outlets used by the component that its props type does not obviously declare. */
  private slotNames(): string[] {
    const names = new Set<string>();
    const visit = (nodes: readonly TemplateNode[]) => {
      for (const n of nodes) {
        if (n.type === 'Element') {
          if (n.kind === 'slot') {
            const nameAttr = n.attributes.find((a): a is Attribute => a.type === 'Attribute' && a.name === 'name');
            const name = nameAttr !== undefined && nameAttr.value.type === 'Static' ? nameAttr.value.value : 'children';
            names.add(name === 'default' ? 'children' : name);
          }
          visit(n.children);
        } else if ('body' in n && n.body !== undefined && 'children' in n.body) {
          visit(n.body.children);
        }
        if (n.type === 'IfBlock') {
          for (const br of n.branches) visit(br.body.children);
          if (n.alternate) visit(n.alternate.children);
        } else if (n.type === 'ForBlock' && n.empty) {
          visit(n.empty.children);
        } else if (n.type === 'SwitchBlock') {
          for (const cs of n.cases) visit(cs.body.children);
          if (n.fallback) visit(n.fallback.children);
        } else if (n.type === 'AwaitBlock') {
          if (n.pending) visit(n.pending.children);
          if (n.then) visit(n.then.body.children);
          if (n.catch) visit(n.catch.body.children);
        } else if (n.type === 'TryBlock' && n.catch) {
          visit(n.catch.body.children);
        }
      }
    };
    visit(this.component.body.filter((i): i is TemplateNode => i.type !== 'VarDecl' && i.type !== 'Statement' && i.type !== 'ValDecl'));
    const p = this.component.params;
    const declared = p.kind === 'object' || p.kind === 'pattern' ? (p.type === null ? '' : this.src.slice(p.type.start, p.type.end)) : '';
    const typeText = declared + (p.kind === 'named' ? p.params.map((q) => q.name).join(' ') : '');
    return [...names].filter((n) => !this.mentions(typeText, n));
  }

  /** Does the props type text (or a same-file type it names) mention `name`? */
  private mentions(typeText: string, name: string): boolean {
    if (typeText === '') return false;
    if (typeText.includes(name)) return true;
    const ref = typeText.trim();
    if (!isIdentifierName(ref)) return false;
    for (const keyword of ['type ', 'interface ']) {
      const at = this.src.indexOf(`${keyword}${ref}`);
      if (at >= 0) {
        const next = this.src.indexOf('}', at);
        if (next > 0 && this.src.slice(at, next).includes(name)) return true;
      }
    }
    return false;
  }

  private declaration(decl: VarDecl | ValDecl): void {
    const b = this.b;
    b.text(decl.type === 'VarDecl' ? 'let' : 'const');
    b.map(decl.start + 3, decl.end);
    b.text(';\n');
  }

  // -------------------------------------------------------------------------
  // Markup
  // -------------------------------------------------------------------------

  private nodes(nodes: readonly TemplateNode[]): void {
    for (const node of nodes) this.node(node);
  }

  private node(node: TemplateNode): void {
    const b = this.b;
    switch (node.type) {
      case 'Text':
      case 'Comment':
        return;
      case 'ExpressionTag':
        b.text('__owt.text');
        this.expr({ start: node.start + 1, end: Math.max(node.start + 1, node.end - 1) });
        b.text(';\n');
        return;
      case 'ValDecl':
        this.declaration(node);
        return;
      case 'Element':
        this.element(node);
        return;
      case 'IfBlock':
        this.ifBlock(node);
        return;
      case 'ForBlock':
        this.forBlock(node);
        return;
      case 'SwitchBlock':
        this.switchBlock(node);
        return;
      case 'AwaitBlock':
        this.awaitBlock(node);
        return;
      case 'TryBlock':
        this.tryBlock(node);
        return;
      case 'KeyBlock':
        this.keyBlock(node);
        return;
      case 'SlotDefinition':
        // only valid inside component elements, handled there
        b.text('{\n');
        this.nodes(node.body.children);
        b.text('}\n');
        return;
    }
  }

  private attrKey(attr: Attribute, name = attr.name, start = attr.nameSpan.start): void {
    const key = isIdentifierName(name) ? name : JSON.stringify(name);
    this.b.mapAs(key, start, name.length, NAME);
  }

  private attrValue(attr: Attribute): void {
    const b = this.b;
    const v = attr.value;
    if (v.type === 'Boolean') b.text('true');
    else if (v.type === 'Static') b.text(JSON.stringify(v.value));
    else if (attr.shorthand) this.identifierRef(attr.name, attr.nameSpan.start);
    else this.expr(v.span);
  }

  private isStatementHandler(attr: Attribute): boolean {
    if (attr.value.type !== 'Expression' || attr.value.expression === null) return false;
    const e = attr.value.expression;
    const isStmt = (n: typeof e): boolean =>
      n.type === 'AssignmentExpression' || n.type === 'UpdateExpression' || (n.type === 'SequenceExpression' && n.expressions.every(isStmt));
    return isStmt(e);
  }

  private element(el: Element): void {
    const b = this.b;
    if (el.kind === 'component') {
      this.componentElement(el);
      return;
    }
    if (el.kind === 'slot') {
      this.slotOutlet(el);
      return;
    }
    if (el.kind === 'window' || el.kind === 'document' || el.kind === 'body') {
      b.text(`__owt.target(${JSON.stringify(el.kind)}, {`);
      this.attributeEntries(el, null);
      b.text('});\n');
      return;
    }
    if (el.kind === 'fragment' || el.kind === 'head') {
      this.nodes(el.children);
      return;
    }
    const needsVar = el.attributes.some((a) => a.type === 'Attribute' && (a.directive === 'bind' || a.directive === 'use' || a.directive === 'on' || a.directive === 'transition' || a.directive === 'in' || a.directive === 'out' || a.name === 'ref'));
    const v = needsVar ? this.id('el') : null;
    if (v !== null) b.text(`const ${v} = `);
    // explicit type argument: much cheaper for TypeScript than inferring K
    b.text(`__owt.el<${JSON.stringify(el.name)}>("`);
    b.mapAs(el.name, el.nameSpan.start, el.name.length, TAG);
    b.text('", ');
    const objStart = b.code.length;
    b.text('{');
    this.attributeEntries(el, v);
    b.anchor(el.openEnd - (el.selfClosing ? 2 : 1));
    b.text('}');
    b.wrap(objStart, { start: el.start, end: el.nameSpan.end });
    b.text(');\n');
    if (v !== null) b.text(`void ${v};\n`);
    this.directives(el, v);
    this.nodes(el.children);
  }

  private attributeEntries(el: Element, _var: string | null): void {
    const b = this.b;
    for (const attr of el.attributes) {
      if (attr.type === 'SpreadAttribute') {
        b.text(' ...');
        const inner = this.src.indexOf('...', attr.start) + 3;
        this.expr({ start: inner, end: attr.end - 1 });
        b.text(',');
        continue;
      }
      if (attr.directive !== null || attr.name === 'ref') continue;
      b.text(' ');
      this.attrKey(attr);
      b.text(': ');
      if (eventName(attr.name) && this.isStatementHandler(attr) && attr.value.type === 'Expression') {
        b.text('(event) => { ');
        this.expr(attr.value.span);
        b.text('; }');
      } else {
        this.attrValue(attr);
      }
      b.text(',');
    }
  }

  private directives(el: Element, v: string | null): void {
    const b = this.b;
    for (const attr of el.attributes) {
      if (attr.type !== 'Attribute') continue;
      const value = attr.value;
      const argStart = attr.nameSpan.start + attr.name.indexOf(':') + 1;
      const target = () => {
        if (value.type === 'Expression') this.expr(value.span);
        else this.identifierRef(attr.arg, argStart);
      };
      if (attr.name === 'ref' && value.type === 'Expression' && v !== null) {
        const fn = value.expression !== null && (value.expression.type === 'ArrowFunctionExpression' || value.expression.type === 'FunctionExpression');
        if (fn) {
          b.text(`__owt.ref(${v}, `);
          this.expr(value.span);
          b.text(');\n');
        } else {
          this.expr(value.span);
          b.text(` = ${v};\n`);
        }
        continue;
      }
      switch (attr.directive) {
        case 'class':
          b.text('__owt.classValue(');
          target();
          b.text(');\n');
          break;
        case 'style':
          if (value.type === 'Expression') {
            b.text('__owt.styleValue(');
            this.expr(value.span);
            b.text(');\n');
          }
          break;
        case 'bind':
          target();
          b.text(attr.arg === 'this' && v !== null ? ` = ${v};\n` : ' = __owt.bound;\n');
          break;
        case 'use':
          if (v === null) break;
          b.text('__owt.action(');
          this.identifierRef(attr.arg.split('.')[0]!, attr.nameSpan.start + 4);
          if (attr.arg.includes('.')) b.text(attr.arg.slice(attr.arg.indexOf('.')));
          b.text(`, ${v}`);
          if (value.type === 'Expression') {
            b.text(', ');
            this.expr(value.span);
          }
          b.text(');\n');
          break;
        case 'transition':
        case 'in':
        case 'out':
          if (v === null) break;
          b.text('__owt.transition(');
          this.identifierRef(attr.arg.split('.')[0]!, attr.nameSpan.start + attr.directive.length + 1);
          if (attr.arg.includes('.')) b.text(attr.arg.slice(attr.arg.indexOf('.')));
          b.text(`, ${v}`);
          if (value.type === 'Expression') {
            b.text(', ');
            this.expr(value.span);
          }
          b.text(');\n');
          break;
        case 'on':
          if (v === null) break;
          b.text(`__owt.on(${v}, ${JSON.stringify(attr.arg)}, `);
          if (value.type === 'Expression') this.expr(value.span);
          else b.text('null');
          b.text(');\n');
          break;
        default:
          break;
      }
    }
  }

  private tagExpression(el: Element): void {
    const b = this.b;
    const parts = el.name.split('.');
    let offset = el.nameSpan.start;
    parts.forEach((part, i) => {
      if (i > 0) {
        b.text('.');
        offset++;
      }
      b.map(offset, offset + part.length, NAME);
      offset += part.length;
    });
  }

  private componentElement(el: Element): void {
    const b = this.b;
    // a direct call: generic components infer their type arguments from the props
    this.tagExpression(el);
    b.text('(');
    const objStart = b.code.length;
    b.text('{');
    const after: (() => void)[] = [];
    for (const attr of el.attributes) {
      if (attr.type === 'SpreadAttribute') {
        b.text(' ...');
        const inner = this.src.indexOf('...', attr.start) + 3;
        this.expr({ start: inner, end: attr.end - 1 });
        b.text(',');
        continue;
      }
      if (attr.directive === 'bind') {
        b.text(' ');
        this.attrKey(attr, attr.arg, attr.nameSpan.start + 5);
        b.text(': ');
        const argStart = attr.nameSpan.start + 5;
        if (attr.value.type === 'Expression') this.expr(attr.value.span);
        else this.identifierRef(attr.arg, argStart);
        b.text(',');
        after.push(() => {
          if (attr.value.type === 'Expression') this.expr(attr.value.span);
          else this.identifierRef(attr.arg, argStart);
          b.text(' = __owt.bound;\n');
        });
        continue;
      }
      if (attr.directive !== null) continue;
      b.text(' ');
      this.attrKey(attr);
      b.text(': ');
      if (eventName(attr.name) && this.isStatementHandler(attr) && attr.value.type === 'Expression') {
        b.text('(event) => { ');
        this.expr(attr.value.span);
        b.text('; }');
      } else {
        this.attrValue(attr);
      }
      b.text(',');
    }
    const slotDefs = el.children.filter((c): c is SlotDefinition => c.type === 'SlotDefinition');
    const content = el.children.filter((c) => c.type !== 'SlotDefinition');
    const meaningful = content.some((c) => c.type !== 'Comment' && !(c.type === 'Text' && c.raw.trim() === ''));
    if (meaningful) {
      b.text(' children: () => {\n');
      this.nodes(content);
      b.text('return __owt.node; },');
    }
    for (const def of slotDefs) {
      b.text(' ');
      b.mapAs(isIdentifierName(def.name) ? def.name : JSON.stringify(def.name), def.nameSpan.start, def.name.length, NAME);
      b.text(': (');
      if (def.params !== null) b.map(def.params.start ?? 0, def.params.end ?? 0);
      b.text(') => {\n');
      this.nodes(def.body.children);
      b.text('return __owt.node; },');
    }
    b.anchor(el.openEnd - (el.selfClosing ? 2 : 1));
    b.text('}');
    b.wrap(objStart, { start: el.start, end: el.nameSpan.end });
    b.text(');\n');
    for (const fn of after) fn();
  }

  private slotOutlet(el: Element): void {
    const b = this.b;
    const nameAttr = el.attributes.find((a): a is Attribute => a.type === 'Attribute' && a.name === 'name');
    const raw = nameAttr !== undefined && nameAttr.value.type === 'Static' ? nameAttr.value.value : 'children';
    const name = raw === 'default' ? 'children' : raw;
    b.text('__owt.slot(__props');
    if (nameAttr !== undefined && nameAttr.value.type === 'Static') {
      b.text('[');
      b.mapAs(JSON.stringify(name), nameAttr.value.span.start - 1, nameAttr.value.span.end - nameAttr.value.span.start + 2, NAME);
      b.text(']');
    } else {
      b.text(`[${JSON.stringify(name)}]`);
    }
    b.text(', {');
    for (const attr of el.attributes) {
      if (attr.type !== 'Attribute' || attr.name === 'name' || attr.directive !== null) continue;
      b.text(' ');
      this.attrKey(attr);
      b.text(': ');
      this.attrValue(attr);
      b.text(',');
    }
    b.text('});\n');
    if (el.children.length > 0) {
      b.text('{\n');
      this.nodes(el.children);
      b.text('}\n');
    }
  }

  // -------------------------------------------------------------------------
  // Blocks
  // -------------------------------------------------------------------------

  private block(children: readonly TemplateNode[]): void {
    this.b.text('{\n');
    this.nodes(children);
    this.b.text('}\n');
  }

  private ifBlock(node: IfBlock): void {
    const b = this.b;
    node.branches.forEach((br, i) => {
      b.text(i === 0 ? 'if ' : 'else if ');
      this.expr(br.testSpan);
      b.text(' ');
      this.block(br.body.children);
    });
    if (node.alternate !== null) {
      b.text('else ');
      this.block(node.alternate.children);
    }
  }

  private forBlock(node: ForBlock): void {
    const b = this.b;
    b.text('for (const ');
    if (node.itemSpan.end > node.itemSpan.start) b.map(node.itemSpan.start, node.itemSpan.end);
    else b.text('__item');
    b.text(' of __owt.iter(');
    const it = node.iterable;
    if (node.reverse) b.text('__owt.rev(');
    if (it.kind === 'range' && it.from !== null && it.to !== null) {
      b.text('__owt.range(');
      b.map(it.from.start ?? 0, it.from.end ?? 0);
      b.text(', ');
      b.map(it.to.start ?? 0, it.to.end ?? 0);
      b.text(')');
    } else {
      this.expr(it.span);
    }
    if (node.reverse) b.text(')');
    b.text(')) {\n');
    if (node.meta !== null) {
      b.text('const ');
      b.map(node.meta.start ?? 0, node.meta.end ?? 0);
      b.text(' = __owt.meta;\n');
    }
    if (node.track !== null) {
      b.text('void ');
      this.expr({ start: node.track.start ?? 0, end: node.track.end ?? 0 });
      b.text(';\n');
    }
    this.nodes(node.body.children);
    b.text('}\n');
    if (node.empty !== null) this.block(node.empty.children);
  }

  private switchBlock(node: SwitchBlock): void {
    const b = this.b;
    b.text('switch ');
    this.expr(node.discriminantSpan);
    b.text(' {\n');
    for (const c of node.cases) {
      for (const test of c.tests) {
        b.text('case ');
        b.map(test.start ?? 0, test.end ?? 0);
        b.text(':\n');
      }
      if (c.guard !== null) {
        b.text('if (');
        b.map(c.guard.start ?? 0, c.guard.end ?? 0);
        b.text(') ');
      }
      this.block(c.body.children);
      b.text('break;\n');
    }
    if (node.fallback !== null) {
      b.text('default: ');
      this.block(node.fallback.children);
    }
    b.text('}\n');
  }

  private awaitBlock(node: AwaitBlock): void {
    const b = this.b;
    b.text('__owt.await(');
    this.expr(node.expressionSpan);
    b.text(', () => ');
    this.block(node.pending?.children ?? []);
    b.text(', (');
    if (node.then?.value) b.map(node.then.value.start ?? 0, node.then.value.end ?? 0);
    b.text(') => ');
    this.block(node.then?.body.children ?? []);
    b.text(', (');
    if (node.catch?.error) b.map(node.catch.error.start ?? 0, node.catch.error.end ?? 0);
    b.text(') => ');
    this.block(node.catch?.body.children ?? []);
    b.text(');\n');
  }

  private tryBlock(node: TryBlock): void {
    const b = this.b;
    b.text('try ');
    this.block(node.body.children);
    b.text('catch (');
    const err = node.catch?.error ?? null;
    if (err !== null) b.map(err.start ?? 0, err.end ?? 0);
    else b.text('__error');
    b.text(') {\n');
    const reset = node.catch?.reset ?? null;
    if (reset !== null) {
      b.text('const ');
      b.map(reset.start ?? 0, reset.end ?? 0, NAME);
      b.text(' = __owt.reset;\n');
    }
    this.nodes(node.catch?.body.children ?? []);
    b.text('}\n');
  }

  private keyBlock(node: KeyBlock): void {
    this.b.text('void ');
    this.expr(node.expressionSpan);
    this.b.text(';\n');
    this.block(node.body.children);
  }
}

/** Generate the virtual TypeScript for a parsed `.owt` file. */
export function generate(program: Program): Generated {
  const src = program.source;
  const b = new Builder(src);
  for (const node of program.body) {
    if (node.type === 'Script') {
      b.map(node.start, node.end);
      b.text('\n;\n');
    } else if (node.type === 'Component') {
      new ComponentGen(b, src, node).generate();
    }
  }
  b.text("\ndeclare const __owt: import('owt/language').Helpers;\n");
  b.text("import type * as __owt_types from 'owt/language';\n");
  b.text('export {};\n');
  return { code: b.code, mappings: b.mappings };
}
