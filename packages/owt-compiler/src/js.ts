/**
 * Transforms embedded TypeScript fragments:
 * - erases TypeScript-only syntax (types, assertions, type imports, enums → objects),
 * - rewrites reads / writes of reactive bindings (`count` → `$.get(count)`,
 *   `count++` → `$.update(count)`, destructuring writes...).
 * Each fragment keeps a source map back to its original location.
 */
import MagicString from 'magic-string';
import type * as t from '@babel/types';
import type { Mapped, FragmentSegments } from './chunks';
import type { Binding, BindingScope } from './bindings';
import type { Reporter } from './errors';
import { Walker, patternNames } from './walk';

export type JsContext = {
  source: string;
  /** runtime namespace alias (`$`) */
  rt: string;
  /** props object variable */
  props: string;
  scope: BindingScope;
  reporter: Reporter;
  /** fresh identifier generator */
  name(hint: string): string;
  /** unused import specifiers to drop (module level) */
  unused?: ReadonlySet<string>;
  /** are we inside a component (enums / exports are not allowed) */
  inComponent: boolean;
};

/** Edits on a fragment, ignoring edits inside ranges that were removed. */
class Edits {
  readonly ms: MagicString;
  private readonly removed: [number, number][] = [];

  constructor(
    source: string,
    readonly start: number,
    readonly end: number,
  ) {
    this.ms = new MagicString(source.slice(start, end));
  }

  private dead(start: number, end: number): boolean {
    for (const [a, b] of this.removed) if (a <= start && end <= b) return true;
    return false;
  }

  remove(start: number, end: number): void {
    if (start >= end || this.dead(start, end)) return;
    this.ms.remove(start - this.start, end - this.start);
    this.removed.push([start, end]);
  }

  overwrite(start: number, end: number, content: string): void {
    if (this.dead(start, end)) return;
    if (start === end) {
      this.ms.appendLeft(start - this.start, content);
      return;
    }
    this.ms.overwrite(start - this.start, end - this.start, content, { contentOnly: true });
  }

  appendLeft(pos: number, content: string): void {
    if (this.dead(pos, pos)) return;
    this.ms.appendLeft(pos - this.start, content);
  }

  prependLeft(pos: number, content: string): void {
    if (this.dead(pos, pos)) return;
    this.ms.prependLeft(pos - this.start, content);
  }

  prependRight(pos: number, content: string): void {
    if (this.dead(pos, pos)) return;
    this.ms.prependRight(pos - this.start, content);
  }

  result(): Mapped {
    const code = this.ms.toString();
    const decoded = this.ms.generateDecodedMap({ hires: 'boundary', includeContent: false });
    const segments: FragmentSegments = decoded.mappings.map((line) =>
      line.filter((seg) => seg.length >= 4).map((seg) => [seg[0]!, seg[2]!, seg[3]!]),
    );
    return { kind: 'mapped', code, origin: this.start, segments };
  }
}

const TS_MODIFIERS = new Set(['public', 'private', 'protected', 'readonly', 'override', 'declare', 'abstract']);

function isLetter(c: number): boolean {
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
}

function pos(node: t.Node): [number, number] {
  return [node.start ?? 0, node.end ?? 0];
}

/** Which ancestors of an identifier make it the value of a shorthand property `{ x }`. */
function isShorthandValue(parent: t.Node, key: string): boolean {
  return parent.type === 'ObjectProperty' && parent.shorthand && key === 'value';
}

class Transformer {
  readonly edits: Edits;
  private readonly patternWrites = new Map<t.Node, t.Identifier[]>();

  constructor(
    private readonly ctx: JsContext,
    start: number,
    end: number,
  ) {
    this.edits = new Edits(ctx.source, start, end);
  }

  walker(locals: readonly string[] = []): Walker {
    return new Walker(
      {
        read: (id, parent, key) => this.read(id, parent, key),
        write: (id, node, kind) => this.write(id, node, kind),
        ts: (node, parent, key) => this.eraseType(node, parent, key),
        enter: (node, parent, key) => this.enter(node, parent, key),
      },
      locals,
    );
  }

  private lookup(name: string): Binding | undefined {
    return this.ctx.scope.lookup(name);
  }

  // ---------------------------------------------------------------------------
  // Reactive reads & writes
  // ---------------------------------------------------------------------------

  private read(id: t.Identifier, parent: t.Node, key: string): void {
    const binding = this.lookup(id.name);
    if (binding === undefined || binding.read === id.name) return;
    const [start, end] = [id.start ?? 0, (id.start ?? 0) + id.name.length];
    const replacement = isShorthandValue(parent, key) ? `${id.name}: ${binding.read}` : binding.read;
    this.edits.overwrite(start, end, replacement);
  }

  private readOnlyError(binding: Binding, id: t.Identifier): never {
    return this.ctx.reporter.error(
      'readonly-binding',
      `Cannot assign to ${binding.description} '${binding.name}'${binding.description === 'val' ? ' (use var for state you assign)' : ''}`,
      id.start ?? 0,
      id.end ?? 0,
    );
  }

  private write(id: t.Identifier, node: t.Node, kind: 'assign' | 'update' | 'pattern' | 'for'): void {
    const binding = this.lookup(id.name);
    if (binding === undefined || binding.write === 'plain') return;
    if (binding.write === false) this.readOnlyError(binding, id);
    if (kind === 'for') {
      this.ctx.reporter.error('reactive-for-target', `Use a new variable in for (... of ...) instead of the reactive '${id.name}'`, id.start ?? 0, id.end ?? 0);
    }
    if (kind === 'pattern') {
      const list = this.patternWrites.get(node) ?? [];
      list.push(id);
      this.patternWrites.set(node, list);
      return;
    }
    if (kind === 'update' && node.type === 'UpdateExpression') {
      this.rewriteUpdate(node, binding);
      return;
    }
    if (node.type === 'AssignmentExpression') this.rewriteAssignment(node, binding);
  }

  /** Opening of a setter call, e.g. `$.set(count, ` — the caller appends the value and `)`. */
  private setterOpen(binding: Binding): string {
    const rt = this.ctx.rt;
    if (binding.write === 'prop') return `${rt}.setProp(${this.ctx.props}, ${JSON.stringify(binding.propKey ?? binding.name)}, `;
    return `${rt}.set(${binding.source ?? binding.name}, `;
  }

  private setter(binding: Binding, value: string): string {
    return `${this.setterOpen(binding)}${value})`;
  }

  /** current value for read-modify-write (untracked for state) */
  private current(binding: Binding): string {
    if (binding.kind === 'state') return `${this.ctx.rt}.peek(${binding.source ?? binding.name})`;
    return binding.read;
  }

  private rewriteAssignment(node: t.AssignmentExpression, binding: Binding): void {
    const [start, end] = pos(node);
    const rightStart = node.right.start ?? end;
    const op = node.operator;
    const open = this.setterOpen(binding);
    if (op === '=') {
      this.edits.overwrite(start, rightStart, open);
      this.edits.appendLeft(end, ')');
      return;
    }
    if (op === '||=' || op === '&&=' || op === '??=') {
      const logical = op.slice(0, 2);
      this.edits.overwrite(start, rightStart, `(${this.current(binding)} ${logical} ${open}`);
      this.edits.appendLeft(end, '))');
      return;
    }
    const binary = op.slice(0, -1);
    this.edits.overwrite(start, rightStart, `${open}${this.current(binding)} ${binary} (`);
    this.edits.appendLeft(end, '))');
  }

  private rewriteUpdate(node: t.UpdateExpression, binding: Binding): void {
    const [start, end] = pos(node);
    const rt = this.ctx.rt;
    const delta = node.operator === '++' ? '' : ', -1';
    if (binding.write === 'state') {
      const fn = node.prefix ? 'updatePre' : 'update';
      this.edits.overwrite(start, end, `${rt}.${fn}(${binding.source ?? binding.name}${delta})`);
      return;
    }
    const value = `${this.current(binding)} ${node.operator === '++' ? '+' : '-'} 1`;
    this.edits.overwrite(start, end, this.setter(binding, value));
  }

  /** `[a, b] = [b, a]` with reactive targets: assign through temporaries. */
  flushPatternWrites(): void {
    for (const [node, ids] of this.patternWrites) {
      if (node.type !== 'AssignmentExpression') continue;
      const value = this.ctx.name('$v');
      const temps = ids.map(() => this.ctx.name('$t'));
      const sets: string[] = [];
      ids.forEach((id, i) => {
        const binding = this.lookup(id.name)!;
        const temp = temps[i]!;
        const start = id.start ?? 0;
        const end = start + id.name.length;
        this.edits.overwrite(start, end, temp);
        sets.push(this.setter(binding, temp));
      });
      // shorthand pattern properties `({ a } = obj)` need an explicit key
      this.expandShorthandTargets(node.left, ids);
      const [start, end] = pos(node);
      this.edits.prependLeft(start, `((${value}) => { let ${temps.join(', ')}; (`);
      this.edits.overwrite(node.left.end ?? start, node.right.start ?? end, ` = ${value}); ${sets.join('; ')}; return ${value}; })(`);
      this.edits.appendLeft(end, ')');
    }
  }

  private expandShorthandTargets(pattern: t.Node, ids: readonly t.Identifier[]): void {
    if (pattern.type === 'ObjectPattern') {
      for (const p of pattern.properties) {
        if (p.type === 'ObjectProperty') {
          if (p.shorthand && p.value.type === 'Identifier' && ids.includes(p.value)) {
            this.edits.prependLeft(p.value.start ?? 0, `${p.value.name}: `);
          } else {
            this.expandShorthandTargets(p.value, ids);
          }
        } else {
          this.expandShorthandTargets(p.argument, ids);
        }
      }
    } else if (pattern.type === 'ArrayPattern') {
      for (const el of pattern.elements) if (el !== null) this.expandShorthandTargets(el, ids);
    } else if (pattern.type === 'AssignmentPattern') {
      this.expandShorthandTargets(pattern.left, ids);
    }
  }

  // ---------------------------------------------------------------------------
  // TypeScript erasure
  // ---------------------------------------------------------------------------

  private eraseType(node: t.Node, parent: t.Node, key: string): void {
    const [start, end] = pos(node);
    if (key === 'implements') return; // removed with its keyword in enter(class)
    if (node.type === 'TSImportEqualsDeclaration' && node.importKind !== 'type') {
      this.ctx.reporter.error('ts-import-equals', '`import x = require()` is not supported; use an ES import', start, end);
    }
    if (node.type === 'TSModuleDeclaration' && node.declare !== true && node.body?.type === 'TSModuleBlock') {
      const hasValues = node.body.body.some((s) => !s.type.startsWith('TS') && !(s.type === 'ExportNamedDeclaration' && s.exportKind === 'type'));
      if (hasValues) this.ctx.reporter.error('ts-namespace', 'TypeScript namespaces with runtime code are not supported', start, end);
    }
    if (node.type === 'TSTypeAnnotation' && parent.type === 'Identifier') {
      const idStart = parent.start ?? start;
      this.edits.remove(idStart + parent.name.length, end);
      return;
    }
    if (node.type === 'TSTypeAnnotation' && (parent.type === 'ClassProperty' || parent.type === 'ClassPrivateProperty' || parent.type === 'ClassAccessorProperty')) {
      this.edits.remove(parent.key.end ?? start, end);
      return;
    }
    this.edits.remove(start, end);
  }

  private enter(node: t.Node, parent: t.Node | null, key: string): void {
    switch (node.type) {
      case 'TSAsExpression':
      case 'TSSatisfiesExpression':
      case 'TSNonNullExpression':
        this.edits.remove(node.expression.end ?? 0, node.end ?? 0);
        return;
      case 'TSTypeAssertion':
        this.edits.remove(node.start ?? 0, node.expression.start ?? 0);
        return;
      case 'TSEnumDeclaration':
        this.enumDeclaration(node, parent);
        return;
      case 'TSExportAssignment':
        this.ctx.reporter.error('ts-export-assignment', '`export =` is not supported; use export default', node.start ?? 0, node.end ?? 0);
        return;
      case 'ImportDeclaration':
        this.importDeclaration(node);
        return;
      case 'ExportNamedDeclaration':
        this.exportDeclaration(node);
        return;
      case 'ExportAllDeclaration':
        if (node.exportKind === 'type') this.edits.remove(...pos(node));
        return;
      case 'VariableDeclaration':
        if (node.declare === true) this.removeStatement(node, parent);
        else for (const d of node.declarations) if (d.definite === true && d.id.type === 'Identifier' && d.id.typeAnnotation == null) this.edits.remove((d.id.start ?? 0) + d.id.name.length, d.id.end ?? 0);
        return;
      case 'ClassDeclaration':
      case 'ClassExpression':
        this.classDeclaration(node, parent);
        return;
      case 'ClassProperty':
      case 'ClassPrivateProperty':
      case 'ClassAccessorProperty':
      case 'ClassMethod':
      case 'ClassPrivateMethod':
        this.classMember(node);
        return;
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
      case 'ObjectMethod':
        this.thisParam(node);
        if (node.type === 'FunctionDeclaration' && node.declare === true) this.removeStatement(node, parent);
        return;
      default:
        void key;
    }
  }

  private removeStatement(node: t.Node, parent: t.Node | null): void {
    if (parent !== null && (parent.type === 'ExportNamedDeclaration' || parent.type === 'ExportDefaultDeclaration')) {
      this.edits.remove(...pos(parent));
    } else {
      this.edits.remove(...pos(node));
    }
  }

  private thisParam(node: t.Function): void {
    const first = node.params[0];
    if (first === undefined || first.type !== 'Identifier' || first.name !== 'this') return;
    const second = node.params[1];
    this.edits.remove(first.start ?? 0, second !== undefined ? (second.start ?? 0) : (first.end ?? 0));
  }

  private removeListItem(list: readonly t.Node[], index: number): void {
    const item = list[index]!;
    const next = list[index + 1];
    const prev = list[index - 1];
    if (next !== undefined) this.edits.remove(item.start ?? 0, next.start ?? 0);
    else if (prev !== undefined) this.edits.remove(prev.end ?? 0, item.end ?? 0);
    else this.edits.remove(item.start ?? 0, item.end ?? 0);
  }

  private importDeclaration(node: t.ImportDeclaration): void {
    if (node.importKind === 'type' || node.importKind === 'typeof') {
      this.edits.remove(...pos(node));
      return;
    }
    if (node.specifiers.length === 0) return;
    const unused = this.ctx.unused;
    const keep = node.specifiers.filter(
      (s) => !(s.type === 'ImportSpecifier' && (s.importKind === 'type' || s.importKind === 'typeof')) && !(unused?.has(s.local.name) ?? false),
    );
    if (keep.length === 0) {
      this.edits.remove(...pos(node));
      return;
    }
    if (keep.length === node.specifiers.length) return;
    // rebuild the specifier list
    const parts: string[] = [];
    let defaultPart = '';
    let namespacePart = '';
    for (const s of keep) {
      const text = this.ctx.source.slice(s.start ?? 0, s.end ?? 0);
      if (s.type === 'ImportDefaultSpecifier') defaultPart = text;
      else if (s.type === 'ImportNamespaceSpecifier') namespacePart = text;
      else parts.push(text.startsWith('type ') ? text.slice(5) : text);
    }
    const clauses = [defaultPart, namespacePart, parts.length > 0 ? `{ ${parts.join(', ')} }` : ''].filter((c) => c !== '');
    const first = node.specifiers[0]!;
    const last = node.specifiers[node.specifiers.length - 1]!;
    // find the closing brace if the last specifier was in braces
    let clauseEnd = last.end ?? 0;
    const sourceStart = node.source.start ?? clauseEnd;
    const between = this.ctx.source.slice(clauseEnd, sourceStart);
    const brace = between.indexOf('}');
    if (brace >= 0) clauseEnd += brace + 1;
    let clauseStart = first.start ?? 0;
    const head = this.ctx.source.slice(node.start ?? 0, clauseStart);
    const openBrace = head.lastIndexOf('{');
    if (first.type === 'ImportSpecifier' && openBrace >= 0) clauseStart = (node.start ?? 0) + openBrace;
    this.edits.overwrite(clauseStart, clauseEnd, clauses.join(', '));
  }

  private exportDeclaration(node: t.ExportNamedDeclaration): void {
    if (node.exportKind === 'type') {
      this.edits.remove(...pos(node));
      return;
    }
    const decl = node.declaration;
    if (decl != null) {
      const typeOnly =
        decl.type === 'TSTypeAliasDeclaration' ||
        decl.type === 'TSInterfaceDeclaration' ||
        decl.type === 'TSDeclareFunction' ||
        (decl.type === 'TSModuleDeclaration' && decl.declare === true) ||
        decl.type === 'TSModuleDeclaration' ||
        ((decl.type === 'VariableDeclaration' || decl.type === 'ClassDeclaration' || decl.type === 'TSEnumDeclaration') && decl.declare === true);
      if (typeOnly) this.edits.remove(...pos(node));
      return;
    }
    const typeSpecifiers = node.specifiers.filter((s) => s.type === 'ExportSpecifier' && s.exportKind === 'type');
    if (typeSpecifiers.length === 0) return;
    if (typeSpecifiers.length === node.specifiers.length) {
      this.edits.remove(...pos(node));
      return;
    }
    for (let i = node.specifiers.length - 1; i >= 0; i--) {
      const s = node.specifiers[i]!;
      if (s.type === 'ExportSpecifier' && s.exportKind === 'type') this.removeListItem(node.specifiers, i);
    }
  }

  private classDeclaration(node: t.ClassDeclaration | t.ClassExpression, parent: t.Node | null): void {
    if (node.type === 'ClassDeclaration' && node.declare === true) {
      this.removeStatement(node, parent);
      return;
    }
    if (node.type === 'ClassDeclaration' && node.abstract === true) {
      const src = this.ctx.source;
      const at = src.indexOf('abstract', node.start ?? 0);
      if (at >= 0 && at < (node.body.start ?? 0)) this.edits.remove(at, at + 'abstract'.length + 1);
    }
    const impls = node.implements;
    if (impls != null && impls.length > 0) {
      const firstStart = impls[0]!.start ?? 0;
      const kw = this.ctx.source.lastIndexOf('implements', firstStart);
      this.edits.remove(kw >= 0 ? kw : firstStart, impls[impls.length - 1]!.end ?? firstStart);
    }
  }

  private classMember(node: t.ClassProperty | t.ClassPrivateProperty | t.ClassAccessorProperty | t.ClassMethod | t.ClassPrivateMethod): void {
    const flags = node as { declare?: boolean | null; abstract?: boolean | null; optional?: boolean | null; definite?: boolean | null };
    if (flags.declare === true || flags.abstract === true) {
      this.edits.remove(...pos(node));
      return;
    }
    // drop TS modifiers between the member start and its key
    const src = this.ctx.source;
    const keyStart = node.key.start ?? 0;
    let p = node.start ?? 0;
    while (p < keyStart) {
      while (p < keyStart && (src[p] === ' ' || src[p] === '\t' || src[p] === '\n' || src[p] === '\r')) p++;
      let q = p;
      while (q < keyStart && isLetter(src.charCodeAt(q))) q++;
      const word = src.slice(p, q);
      if (word === '') break;
      if (TS_MODIFIERS.has(word)) {
        let r = q;
        while (r < keyStart && (src[r] === ' ' || src[r] === '\t')) r++;
        this.edits.remove(p, r);
      }
      p = q;
    }
    if (node.type === 'ClassMethod' && node.kind === 'constructor') {
      for (const param of node.params) {
        if (param.type === 'TSParameterProperty') {
          this.ctx.reporter.error('ts-parameter-property', 'Constructor parameter properties are not supported; declare fields explicitly', param.start ?? 0, param.end ?? 0);
        }
      }
    }
    if ((flags.optional === true || flags.definite === true) && !('typeAnnotation' in node && node.typeAnnotation != null)) {
      const keyEnd = node.key.end ?? 0;
      if (src[keyEnd] === '?' || src[keyEnd] === '!') this.edits.remove(keyEnd, keyEnd + 1);
    }
  }

  private enumDeclaration(node: t.TSEnumDeclaration, parent: t.Node | null): void {
    if (node.declare === true) {
      this.removeStatement(node, parent);
      return;
    }
    if (this.ctx.inComponent) {
      this.ctx.reporter.error('enum-in-component', 'Declare enums at module level, outside components', node.start ?? 0, node.end ?? 0);
    }
    const name = node.id.name;
    const src = this.ctx.source;
    const lines: string[] = [];
    let auto = 0;
    let autoValid = true;
    const members = 'members' in node ? node.members : [];
    for (const m of members) {
      const key = m.id.type === 'Identifier' ? m.id.name : m.id.value;
      const k = JSON.stringify(key);
      if (m.initializer == null) {
        if (!autoValid) this.ctx.reporter.error('enum-member', `Enum member ${key} needs an initializer`, m.start ?? 0, m.end ?? 0);
        lines.push(`${name}[${name}[${k}] = ${auto}] = ${k};`);
        auto++;
      } else if (m.initializer.type === 'StringLiteral') {
        lines.push(`${name}[${k}] = ${JSON.stringify(m.initializer.value)};`);
        autoValid = false;
      } else if (m.initializer.type === 'NumericLiteral') {
        auto = m.initializer.value + 1;
        lines.push(`${name}[${name}[${k}] = ${m.initializer.value}] = ${k};`);
      } else {
        const expr = src.slice(m.initializer.start ?? 0, m.initializer.end ?? 0);
        lines.push(`${name}[${name}[${k}] = ${expr}] = ${k};`);
        autoValid = false;
      }
    }
    const code = `var ${name} = /* @__PURE__ */ ((${name}) => { ${lines.join(' ')} return ${name}; })(${name} || {});`;
    this.edits.overwrite(node.start ?? 0, node.end ?? 0, code);
  }
}

/** Transform a single expression. */
export function transformExpression(node: t.Node, ctx: JsContext, locals: readonly string[] = []): Mapped {
  const tr = new Transformer(ctx, node.start ?? 0, node.end ?? 0);
  tr.walker(locals).expression(node);
  tr.flushPatternWrites();
  return tr.edits.result();
}

/** Transform module-level statements (their declarations are local to the module). */
export function transformModule(nodes: readonly t.Statement[], start: number, end: number, ctx: JsContext): Mapped {
  const tr = new Transformer(ctx, start, end);
  tr.walker().statements(nodes);
  tr.flushPatternWrites();
  return tr.edits.result();
}

/** Transform component-level statements (their declarations are component bindings). */
export function transformStatement(node: t.Statement, ctx: JsContext): Mapped {
  const tr = new Transformer(ctx, node.start ?? 0, node.end ?? 0);
  tr.walker().statementsInScope([node]);
  tr.flushPatternWrites();
  return tr.edits.result();
}

/** Free identifiers read or written in a node (for dependency / usage analysis). */
export function freeIdentifiers(node: t.Node, locals: readonly string[] = []): { reads: t.Identifier[]; writes: t.Identifier[] } {
  const reads: t.Identifier[] = [];
  const writes: t.Identifier[] = [];
  new Walker({ read: (id) => reads.push(id), write: (id) => writes.push(id) }, locals).expression(node);
  return { reads, writes };
}

export function freeIdentifiersInStatements(nodes: readonly t.Statement[], inScope: boolean): { reads: t.Identifier[]; writes: t.Identifier[] } {
  const reads: t.Identifier[] = [];
  const writes: t.Identifier[] = [];
  const w = new Walker({ read: (id) => reads.push(id), write: (id) => writes.push(id) });
  if (inScope) w.statementsInScope(nodes);
  else w.statements(nodes);
  return { reads, writes };
}

export { patternNames };
