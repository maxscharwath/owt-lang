/**
 * Scope-aware walker over Babel ASTs. It reports identifiers that are *free*
 * in the walked fragment (not declared inside it): reads, and writes through
 * assignment / update expressions or destructuring. TypeScript-only nodes are
 * reported separately and never descended into.
 */
import type * as t from '@babel/types';

const META_KEYS = new Set([
  'type',
  'start',
  'end',
  'loc',
  'range',
  'extra',
  'leadingComments',
  'trailingComments',
  'innerComments',
  'errors',
  'comments',
  'tokens',
]);

export type WriteKind = 'assign' | 'update' | 'pattern' | 'for';

export type WalkCallbacks = {
  /** free identifier read */
  read?(id: t.Identifier, parent: t.Node, key: string): void;
  /** free identifier written (`x = v`, `x++`, `[x] = v`, `for (x of ...)`) */
  write?(id: t.Identifier, node: t.Node, kind: WriteKind): void;
  /** TypeScript-only node (type annotation, assertion...): not descended */
  ts?(node: t.Node, parent: t.Node, key: string): void;
  /** every node before its children */
  enter?(node: t.Node, parent: t.Node | null, key: string): void;
  /** identifiers declared anywhere in the fragment */
  declare?(id: t.Identifier): void;
};

/** Node types that only exist in TypeScript and are erased. */
const TS_TYPE_NODES = new Set([
  'TSTypeAnnotation',
  'TSTypeParameterDeclaration',
  'TSTypeParameterInstantiation',
  'TSTypeAliasDeclaration',
  'TSInterfaceDeclaration',
  'TSDeclareFunction',
  'TSDeclareMethod',
  'TSIndexSignature',
  'TSModuleDeclaration',
  'TSExpressionWithTypeArguments',
  'TSClassImplements',
  'TSInterfaceHeritage',
]);

export function isTsOnly(node: t.Node): boolean {
  return TS_TYPE_NODES.has(node.type);
}

function isNode(value: unknown): value is t.Node {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';
}

/** Names declared by a binding pattern. */
export function patternNames(pattern: t.Node | null | undefined, out: t.Identifier[] = []): t.Identifier[] {
  if (pattern == null) return out;
  switch (pattern.type) {
    case 'Identifier':
      out.push(pattern);
      break;
    case 'ObjectPattern':
      for (const p of pattern.properties) {
        if (p.type === 'RestElement') patternNames(p.argument, out);
        else patternNames(p.value, out);
      }
      break;
    case 'ArrayPattern':
      for (const el of pattern.elements) patternNames(el, out);
      break;
    case 'AssignmentPattern':
      patternNames(pattern.left, out);
      break;
    case 'RestElement':
      patternNames(pattern.argument, out);
      break;
    case 'TSParameterProperty':
      patternNames(pattern.parameter, out);
      break;
    default:
      break;
  }
  return out;
}

class Scope {
  readonly names = new Set<string>();
  constructor(readonly parent: Scope | null) {}
  has(name: string): boolean {
    for (let s: Scope | null = this; s !== null; s = s.parent) if (s.names.has(name)) return true;
    return false;
  }
}

const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
  'ObjectMethod',
  'ClassMethod',
  'ClassPrivateMethod',
]);

function isFunction(node: t.Node): node is t.Function {
  return FUNCTION_TYPES.has(node.type);
}

/** `var` declarations hoisted to a function scope (not crossing nested functions). */
function collectVars(node: t.Node, scope: Scope, cb: WalkCallbacks): void {
  if (isFunction(node)) return;
  if (node.type === 'VariableDeclaration' && node.kind === 'var') {
    for (const d of node.declarations) {
      for (const id of patternNames(d.id)) {
        scope.names.add(id.name);
        cb.declare?.(id);
      }
    }
  }
  for (const key in node) {
    if (META_KEYS.has(key)) continue;
    const value = (node as unknown as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      for (const v of value) if (isNode(v) && !isTsOnly(v)) collectVars(v, scope, cb);
    } else if (isNode(value) && !isTsOnly(value)) {
      collectVars(value, scope, cb);
    }
  }
}

/** Block-scoped declarations directly inside a statement list. */
function collectLexical(body: readonly t.Node[], scope: Scope, cb: WalkCallbacks): void {
  for (const stmt of body) {
    let decl: t.Node = stmt;
    if ((decl.type === 'ExportNamedDeclaration' || decl.type === 'ExportDefaultDeclaration') && decl.declaration != null) {
      decl = decl.declaration;
    }
    if (decl.type === 'VariableDeclaration' && decl.kind !== 'var') {
      for (const d of decl.declarations) {
        for (const id of patternNames(d.id)) {
          scope.names.add(id.name);
          cb.declare?.(id);
        }
      }
    } else if ((decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration') && decl.id != null) {
      scope.names.add(decl.id.name);
      cb.declare?.(decl.id);
    } else if (decl.type === 'TSEnumDeclaration') {
      scope.names.add(decl.id.name);
      cb.declare?.(decl.id);
    } else if (decl.type === 'ImportDeclaration') {
      for (const s of decl.specifiers) {
        scope.names.add(s.local.name);
        cb.declare?.(s.local);
      }
    }
  }
}

export class Walker {
  private scope: Scope;

  constructor(
    private readonly cb: WalkCallbacks,
    /** names declared outside the fragment but local to the generated code (shadowing outer bindings) */
    locals: readonly string[] = [],
  ) {
    this.scope = new Scope(null);
    for (const name of locals) this.scope.names.add(name);
  }

  /** Walk statements as a block (their declarations are local to the fragment). */
  statements(body: readonly t.Statement[]): void {
    const prev = this.scope;
    this.scope = new Scope(prev);
    collectLexical(body, this.scope, this.cb);
    for (const stmt of body) collectVars(stmt, this.scope, this.cb);
    for (const stmt of body) this.visit(stmt, null, '');
    this.scope = prev;
  }

  /** Walk statements whose top-level declarations are *not* local (component body: they are bindings). */
  statementsInScope(body: readonly t.Statement[]): void {
    for (const stmt of body) this.visit(stmt, null, '');
  }

  expression(node: t.Node): void {
    this.visit(node, null, '');
  }

  /** Walk a binding pattern: only default values and computed keys are expressions. */
  pattern(node: t.Node, parent: t.Node | null): void {
    switch (node.type) {
      case 'Identifier':
        if (node.typeAnnotation != null) this.cb.ts?.(node.typeAnnotation, node, 'typeAnnotation');
        break;
      case 'ObjectPattern':
        for (const p of node.properties) {
          if (p.type === 'RestElement') this.pattern(p, node);
          else {
            if (p.computed) this.visit(p.key, p, 'key');
            this.pattern(p.value, p);
          }
        }
        if (node.typeAnnotation != null) this.cb.ts?.(node.typeAnnotation, node, 'typeAnnotation');
        break;
      case 'ArrayPattern':
        for (const el of node.elements) if (el !== null) this.pattern(el, node);
        if (node.typeAnnotation != null) this.cb.ts?.(node.typeAnnotation, node, 'typeAnnotation');
        break;
      case 'AssignmentPattern':
        this.pattern(node.left, node);
        this.visit(node.right, node, 'right');
        break;
      case 'RestElement':
        this.pattern(node.argument, node);
        if (node.typeAnnotation != null) this.cb.ts?.(node.typeAnnotation, node, 'typeAnnotation');
        break;
      case 'TSParameterProperty':
        this.cb.ts?.(node, parent ?? node, 'params');
        this.pattern(node.parameter, node);
        break;
      default:
        // member expressions in assignment targets
        this.visit(node, parent, '');
    }
  }

  /** Assignment target: identifiers are writes. */
  private target(node: t.Node, assignment: t.Node, kind: WriteKind): void {
    switch (node.type) {
      case 'Identifier':
        if (!this.scope.has(node.name)) this.cb.write?.(node, assignment, kind);
        break;
      case 'ObjectPattern':
        for (const p of node.properties) {
          if (p.type === 'RestElement') this.target(p.argument, assignment, 'pattern');
          else {
            if (p.computed) this.visit(p.key, p, 'key');
            this.target(p.value, assignment, 'pattern');
          }
        }
        break;
      case 'ArrayPattern':
        for (const el of node.elements) if (el !== null) this.target(el, assignment, 'pattern');
        break;
      case 'AssignmentPattern':
        this.target(node.left, assignment, 'pattern');
        this.visit(node.right, node, 'right');
        break;
      case 'RestElement':
        this.target(node.argument, assignment, 'pattern');
        break;
      case 'TSAsExpression':
      case 'TSSatisfiesExpression':
      case 'TSNonNullExpression':
      case 'TSTypeAssertion':
        this.cb.enter?.(node, assignment, 'left');
        this.target(node.expression, assignment, kind);
        break;
      case 'ParenthesizedExpression':
        this.target(node.expression, assignment, kind);
        break;
      default:
        this.visit(node, assignment, 'left');
    }
  }

  private withScope(fn: () => void): void {
    const prev = this.scope;
    this.scope = new Scope(prev);
    try {
      fn();
    } finally {
      this.scope = prev;
    }
  }

  private declarePattern(pattern: t.Node | null | undefined): void {
    for (const id of patternNames(pattern)) {
      this.scope.names.add(id.name);
      this.cb.declare?.(id);
    }
  }

  private visitFunction(node: t.Function, parent: t.Node | null, key: string): void {
    this.cb.enter?.(node, parent, key);
    if (node.type !== 'ArrowFunctionExpression' && node.type !== 'ObjectMethod' && 'typeParameters' in node && node.typeParameters != null) {
      this.cb.ts?.(node.typeParameters, node, 'typeParameters');
    } else if (node.type === 'ArrowFunctionExpression' && node.typeParameters != null) {
      this.cb.ts?.(node.typeParameters, node, 'typeParameters');
    }
    if ((node.type === 'ClassMethod' || node.type === 'ClassPrivateMethod' || node.type === 'ObjectMethod') && node.computed) {
      this.visit(node.key, node, 'key');
    }
    this.withScope(() => {
      if (node.type === 'FunctionExpression' && node.id != null) {
        this.scope.names.add(node.id.name);
        this.cb.declare?.(node.id);
      }
      for (const p of node.params) this.declarePattern(p);
      for (const p of node.params) this.pattern(p, node);
      if (node.returnType != null) this.cb.ts?.(node.returnType, node, 'returnType');
      const body = node.body;
      if (body.type === 'BlockStatement') {
        collectLexical(body.body, this.scope, this.cb);
        for (const stmt of body.body) collectVars(stmt, this.scope, this.cb);
        for (const stmt of body.body) this.visit(stmt, body, 'body');
      } else {
        this.visit(body, node, 'body');
      }
    });
  }

  visit(node: t.Node, parent: t.Node | null, key: string): void {
    if (node.type.startsWith('TS')) {
      this.visitTs(node, parent, key);
      return;
    }
    switch (node.type) {
      case 'Identifier':
        if (!this.scope.has(node.name) && (parent === null || isReference(node, parent, key))) this.cb.read?.(node, parent ?? node, key);
        if (node.typeAnnotation != null) this.cb.ts?.(node.typeAnnotation, node, 'typeAnnotation');
        return;
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
      case 'ObjectMethod':
      case 'ClassMethod':
      case 'ClassPrivateMethod':
        this.visitFunction(node, parent, key);
        return;
      case 'BlockStatement':
      case 'StaticBlock':
        this.cb.enter?.(node, parent, key);
        this.withScope(() => {
          collectLexical(node.body, this.scope, this.cb);
          for (const stmt of node.body) this.visit(stmt, node, 'body');
        });
        return;
      case 'SwitchStatement':
        this.cb.enter?.(node, parent, key);
        this.visit(node.discriminant, node, 'discriminant');
        this.withScope(() => {
          for (const c of node.cases) collectLexical(c.consequent, this.scope, this.cb);
          for (const c of node.cases) {
            if (c.test != null) this.visit(c.test, c, 'test');
            for (const stmt of c.consequent) this.visit(stmt, c, 'consequent');
          }
        });
        return;
      case 'CatchClause':
        this.cb.enter?.(node, parent, key);
        this.withScope(() => {
          this.declarePattern(node.param);
          if (node.param != null) this.pattern(node.param, node);
          this.visit(node.body, node, 'body');
        });
        return;
      case 'ForStatement':
      case 'ForInStatement':
      case 'ForOfStatement':
        this.cb.enter?.(node, parent, key);
        this.withScope(() => {
          const init = node.type === 'ForStatement' ? node.init : node.left;
          if (init != null && init.type === 'VariableDeclaration') {
            if (init.kind !== 'var') for (const d of init.declarations) this.declarePattern(d.id);
            this.visit(init, node, 'init');
          } else if (init != null && node.type !== 'ForStatement') {
            this.target(init, node, 'for');
          } else if (init != null) {
            this.visit(init, node, 'init');
          }
          if (node.type === 'ForStatement') {
            if (node.test != null) this.visit(node.test, node, 'test');
            if (node.update != null) this.visit(node.update, node, 'update');
          } else {
            this.visit(node.right, node, 'right');
          }
          this.visit(node.body, node, 'body');
        });
        return;
      case 'VariableDeclarator':
        this.cb.enter?.(node, parent, key);
        this.pattern(node.id, node);
        if (node.init != null) this.visit(node.init, node, 'init');
        return;
      case 'ClassDeclaration':
      case 'ClassExpression':
        this.cb.enter?.(node, parent, key);
        this.withScope(() => {
          if (node.id != null) {
            this.scope.names.add(node.id.name);
            this.cb.declare?.(node.id);
          }
          if (node.typeParameters != null) this.cb.ts?.(node.typeParameters, node, 'typeParameters');
          if (node.superClass != null) this.visit(node.superClass, node, 'superClass');
          if (node.superTypeParameters != null) this.cb.ts?.(node.superTypeParameters, node, 'superTypeParameters');
          if (node.implements != null) for (const impl of node.implements) this.cb.ts?.(impl, node, 'implements');
          for (const member of node.body.body) this.visit(member, node.body, 'body');
        });
        return;
      case 'AssignmentExpression':
        this.cb.enter?.(node, parent, key);
        this.target(node.left, node, 'assign');
        this.visit(node.right, node, 'right');
        return;
      case 'UpdateExpression':
        this.cb.enter?.(node, parent, key);
        this.target(node.argument, node, 'update');
        return;
      case 'ImportDeclaration':
        this.cb.enter?.(node, parent, key);
        return;
      case 'ExportNamedDeclaration':
        this.cb.enter?.(node, parent, key);
        if (node.declaration != null) this.visit(node.declaration, node, 'declaration');
        else if (node.source == null) {
          for (const s of node.specifiers) {
            if (s.type === 'ExportSpecifier' && s.local.type === 'Identifier' && !this.scope.has(s.local.name)) {
              this.cb.read?.(s.local, s, 'local');
            }
          }
        }
        return;
      case 'LabeledStatement':
        this.cb.enter?.(node, parent, key);
        this.visit(node.body, node, 'body');
        return;
      case 'BreakStatement':
      case 'ContinueStatement':
        return;
      default:
        break;
    }
    this.cb.enter?.(node, parent, key);
    this.children(node);
  }

  /** TypeScript nodes: value-carrying wrappers are walked, pure type nodes are reported and skipped. */
  private visitTs(node: t.Node, parent: t.Node | null, key: string): void {
    switch (node.type) {
      case 'TSAsExpression':
      case 'TSSatisfiesExpression':
      case 'TSTypeAssertion':
      case 'TSNonNullExpression':
        this.cb.enter?.(node, parent, key);
        this.visit(node.expression, node, 'expression');
        return;
      case 'TSInstantiationExpression':
        this.cb.enter?.(node, parent, key);
        this.visit(node.expression, node, 'expression');
        if (node.typeParameters != null) this.cb.ts?.(node.typeParameters, node, 'typeParameters');
        return;
      case 'TSEnumDeclaration':
        this.cb.enter?.(node, parent, key);
        for (const m of node.members) if (m.initializer != null) this.visit(m.initializer, m, 'initializer');
        return;
      case 'TSExportAssignment':
        this.cb.enter?.(node, parent, key);
        this.visit(node.expression, node, 'expression');
        return;
      default:
        this.cb.ts?.(node, parent ?? node, key);
    }
  }

  private children(node: t.Node): void {
    for (const key in node) {
      if (META_KEYS.has(key)) continue;
      const value = (node as unknown as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        for (const v of value) if (isNode(v)) this.visit(v, node, key);
      } else if (isNode(value)) {
        this.visit(value, node, key);
      }
    }
  }
}

/** Is this identifier (in this position) a value reference? */
export function isReference(node: t.Identifier, parent: t.Node, key: string): boolean {
  switch (parent.type) {
    case 'MemberExpression':
    case 'OptionalMemberExpression':
      return key !== 'property' || parent.computed;
    case 'ObjectProperty':
      return key !== 'key' || parent.computed;
    case 'ObjectMethod':
    case 'ClassMethod':
    case 'ClassPrivateMethod':
    case 'ClassProperty':
    case 'ClassAccessorProperty':
    case 'ClassPrivateProperty':
      return key !== 'key' || ('computed' in parent && parent.computed === true);
    case 'TSEnumMember':
      return key !== 'id';
    case 'ImportSpecifier':
    case 'ImportDefaultSpecifier':
    case 'ImportNamespaceSpecifier':
    case 'ExportNamespaceSpecifier':
    case 'ExportDefaultSpecifier':
    case 'MetaProperty':
    case 'LabeledStatement':
    case 'BreakStatement':
    case 'ContinueStatement':
      return false;
    case 'ExportSpecifier':
      return key === 'local';
    case 'FunctionDeclaration':
    case 'FunctionExpression':
    case 'ClassDeclaration':
    case 'ClassExpression':
      return key !== 'id';
    case 'TSEnumDeclaration':
      return key !== 'id';
    default:
      return true;
  }
}
