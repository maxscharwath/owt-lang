/** Compiles one `component` declaration into a JavaScript function. */
import type * as t from '@babel/types';
import type { ComponentDecl, NamedParam, TemplateNode, StyleBlock } from '@owt/ast';
import { type Chunk, join, origin } from './chunks';
import { BindingScope, plain } from './bindings';
import { ComponentContext, type FileContext } from './context';
import { hash, scopeCss } from './css';
import { transformStatement } from './js';
import { TemplateCompiler } from './template';
import { visitComponent } from './traverse';
import { Walker, patternNames } from './walk';

export type CompiledComponent = {
  name: string;
  code: Chunk;
  css: string;
  /** scope class, null when the component has no scoped styles */
  cssScope: string | null;
};

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

/** Names written anywhere in the component (assignments, updates, bind:, ref=). */
function writtenNames(component: ComponentDecl): Set<string> {
  const names = new Set<string>();
  visitComponent(component, {
    node(node, kind) {
      const walker = new Walker({ write: (id) => names.add(id.name) });
      if (kind === 'statement') walker.statementsInScope([node as t.Statement]);
      else walker.expression(node);
    },
    written(name) {
      names.add(name);
    },
  });
  return names;
}

function isLiteralInit(node: t.Node): boolean {
  switch (node.type) {
    case 'StringLiteral':
    case 'NumericLiteral':
    case 'BooleanLiteral':
    case 'NullLiteral':
    case 'BigIntLiteral':
      return true;
    case 'TemplateLiteral':
      return node.expressions.length === 0;
    case 'UnaryExpression':
      return isLiteralInit(node.argument);
    default:
      return false;
  }
}

function isFunctionInit(node: t.Node | null | undefined): boolean {
  return node != null && (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression');
}

export function compileComponent(component: ComponentDecl, file: FileContext): CompiledComponent {
  const rt = file.rt;
  const props = file.reserve('$$props');
  const scopedStyles = component.styles.filter((s) => !s.global);
  const cssScope = scopedStyles.length > 0 ? `owt-${hash(`${file.filename}#${component.name}`)}` : null;
  const c = new ComponentContext(file, component.name, props, cssScope);
  const scope = new BindingScope();
  const templates = new TemplateCompiler(c);
  const lines: Chunk[] = [];

  // --- parameters -----------------------------------------------------------
  lines.push(...params(component, c, scope));
  // `props` always names the whole props object unless the component declares its own
  if (scope.lookup('props') === undefined && !declaresName(component, 'props')) {
    scope.add({ ...plain('props', component.start, { write: false, description: 'props object', read: props }), reactive: true });
  }

  // --- body bindings (registered first: functions may use later declarations) --
  const written = writtenNames(component);
  for (const item of component.body) {
    if (item.type === 'VarDecl') {
      for (const d of item.declarations) {
        if (written.has(d.name)) {
          scope.add({ name: d.name, kind: 'state', read: `${rt}.get(${d.name})`, source: d.name, write: 'state', reactive: true, stable: false, description: 'var', start: d.start });
        } else {
          scope.add({ ...plain(d.name, d.start, { write: false, description: 'var' }), reactive: true });
        }
      }
    } else if (item.type === 'ValDecl') {
      for (const d of item.declarations) {
        if (d.init !== null && isLiteralInit(d.init)) {
          scope.add(plain(d.name, d.start, { write: false, description: 'val' }));
        } else {
          scope.add({ name: d.name, kind: 'derived', read: `${rt}.get(${d.name})`, source: d.name, write: false, reactive: true, stable: false, description: 'val', start: d.start });
        }
      }
    } else if (item.type === 'Statement') {
      registerStatement(item.node, scope, c);
    }
  }

  // --- body code ------------------------------------------------------------
  const markup: TemplateNode[] = [];
  for (const item of component.body) {
    if (item.type === 'VarDecl') {
      for (const d of item.declarations) {
        const init: Chunk = d.init === null ? 'undefined' : c.expr(d.init, scope);
        const binding = scope.lookup(d.name)!;
        const fn = binding.kind === 'state' ? 'state' : 'reactive';
        lines.push([origin(`const ${d.name} = ${rt}.${fn}(`, d.start), init, ');']);
      }
    } else if (item.type === 'ValDecl') {
      for (const d of item.declarations) {
        const init: Chunk = d.init === null ? 'undefined' : c.expr(d.init, scope);
        const binding = scope.lookup(d.name)!;
        if (binding.kind === 'derived') lines.push([origin(`const ${d.name} = ${rt}.derived(() => `, d.start), init, ');']);
        else lines.push([origin(`const ${d.name} = `, d.start), init, ';']);
      }
    } else if (item.type === 'Statement') {
      checkStatement(item.node, c);
      lines.push(transformStatement(item.node, c.js(scope)));
    } else {
      markup.push(item);
    }
  }
  lines.push(...templates.body(markup, scope, 'html'));

  const exportPrefix = component.exported ? (component.isDefault ? 'export default ' : 'export ') : '';
  const code: Chunk = [
    origin(`${exportPrefix}function ${component.name}(${props}) {\n`, component.start),
    `return ${rt}.scope(() => {\n`,
    join(lines, '\n'),
    '\n});\n}\n',
  ];
  return { name: component.name, code, css: componentCss(component.styles, cssScope), cssScope };
}

function declaresName(component: ComponentDecl, name: string): boolean {
  for (const item of component.body) {
    if ((item.type === 'VarDecl' || item.type === 'ValDecl') && item.declarations.some((d) => d.name === name)) return true;
    if (item.type === 'Statement') {
      const n = item.node;
      if ((n.type === 'FunctionDeclaration' || n.type === 'ClassDeclaration') && n.id?.name === name) return true;
      if (n.type === 'VariableDeclaration' && n.declarations.some((d) => patternNames(d.id).some((id) => id.name === name))) return true;
    }
  }
  return false;
}

function componentCss(styles: readonly StyleBlock[], cssScope: string | null): string {
  return styles
    .map((s) => (s.global || cssScope === null ? s.content : scopeCss(s.content, cssScope)))
    .join('\n')
    .trim();
}

function checkStatement(node: t.Statement, c: ComponentContext): void {
  const start = node.start ?? 0;
  const end = node.end ?? start;
  switch (node.type) {
    case 'ImportDeclaration':
      c.error('import-in-component', 'Imports must be at the top of the file, outside components', start, end);
      break;
    case 'ExportNamedDeclaration':
    case 'ExportDefaultDeclaration':
    case 'ExportAllDeclaration':
      c.error('export-in-component', 'Exports are not allowed inside components', start, end);
      break;
    case 'ReturnStatement':
      c.error('return-in-component', 'Components return their markup: remove this return', start, end);
      break;
    default:
      break;
  }
  if (node.type === 'ExpressionStatement' && node.expression.type === 'AwaitExpression') {
    c.error('await-in-component', 'Component setup is synchronous: use await (promise) { } then (value) { } in markup, or onMount(async () => ...)', start, end);
  }
  if (node.type === 'VariableDeclaration') {
    for (const d of node.declarations) {
      if (d.init?.type === 'AwaitExpression') {
        c.error('await-in-component', 'Component setup is synchronous: use await (promise) { } then (value) { } in markup, or onMount(async () => ...)', d.start ?? start, d.end ?? end);
      }
    }
  }
}

function registerStatement(node: t.Statement, scope: BindingScope, c: ComponentContext): void {
  void c;
  if (node.type === 'FunctionDeclaration' && node.id != null) {
    scope.add(plain(node.id.name, node.start ?? 0, { stable: true, description: 'function' }));
  } else if (node.type === 'ClassDeclaration' && node.id != null) {
    scope.add(plain(node.id.name, node.start ?? 0, { stable: true, description: 'class' }));
  } else if (node.type === 'VariableDeclaration') {
    for (const d of node.declarations) {
      for (const id of patternNames(d.id)) {
        const isConst = node.kind === 'const';
        scope.add(plain(id.name, id.start ?? 0, { write: isConst ? false : 'plain', stable: isConst && isFunctionInit(d.init), description: isConst ? 'const' : 'variable' }));
      }
    }
  }
}

/** Props bindings for the component parameters. */
function params(component: ComponentDecl, c: ComponentContext, scope: BindingScope): Chunk[] {
  const rt = c.rt;
  const props = c.props;
  const p = component.params;
  const out: Chunk[] = [];
  switch (p.kind) {
    case 'none':
      return out;
    case 'object':
      scope.add({ ...plain(p.id.name, p.id.start ?? 0, { write: false, description: 'props object' }), reactive: true });
      out.push(`const ${p.id.name} = ${props};`);
      return out;
    case 'pattern':
      out.push(...patternProps(p.pattern, c, scope));
      return out;
    case 'named': {
      const names = p.params.filter((q) => !q.rest).map((q) => q.name);
      for (const param of p.params) out.push(...namedProp(param, names, c, scope));
      return out;
    }
  }
  void rt;
}

function namedProp(param: NamedParam, allNames: string[], c: ComponentContext, scope: BindingScope): Chunk[] {
  const rt = c.rt;
  const props = c.props;
  const key = param.name;
  if (param.rest) {
    const local = RESERVED.has(key) ? c.file.name(key) : key;
    scope.add({ ...plain(key, param.start, { write: false, description: 'rest props', read: local }), reactive: true });
    return [`const ${local} = ${rt}.restProps(${props}, ${JSON.stringify(allNames)});`];
  }
  const access = `${props}[${JSON.stringify(key)}]`;
  if (param.defaultValue === null) {
    scope.add({ name: key, kind: 'prop', read: access, propKey: key, write: 'prop', reactive: true, stable: false, description: 'prop', start: param.start });
    return [];
  }
  const local = RESERVED.has(key) ? c.file.name(key) : key;
  scope.add({ name: key, kind: 'derived', read: `${rt}.get(${local})`, source: local, propKey: key, write: 'prop', reactive: true, stable: false, description: 'prop', start: param.start });
  return [[origin(`const ${local} = ${rt}.propDefault(${props}, ${JSON.stringify(key)}, () => `, param.start), c.expr(param.defaultValue, scope), ');']];
}

function patternProps(pattern: t.ObjectPattern, c: ComponentContext, scope: BindingScope): Chunk[] {
  const rt = c.rt;
  const props = c.props;
  const out: Chunk[] = [];
  const keys: string[] = [];
  for (const prop of pattern.properties) {
    if (prop.type === 'RestElement') {
      const id = prop.argument;
      if (id.type !== 'Identifier') c.error('invalid-param', 'Rest props must be a name: ...rest', prop.start ?? 0, prop.end ?? 0);
      scope.add({ ...plain(id.name, id.start ?? 0, { write: false, description: 'rest props' }), reactive: true });
      out.push(`const ${id.name} = ${rt}.restProps(${props}, ${JSON.stringify(keys)});`);
      continue;
    }
    if (prop.computed) c.error('invalid-param', 'Computed keys are not supported in props destructuring', prop.start ?? 0, prop.end ?? 0);
    const key = prop.key.type === 'Identifier' ? prop.key.name : prop.key.type === 'StringLiteral' ? prop.key.value : '';
    keys.push(key);
    const access = `${props}[${JSON.stringify(key)}]`;
    let value = prop.value;
    if (value.type === 'AssignmentPattern' && value.left.type === 'Identifier') {
      const local = value.left.name;
      scope.add({ name: local, kind: 'derived', read: `${rt}.get(${local})`, source: local, propKey: key, write: 'prop', reactive: true, stable: false, description: 'prop', start: value.start ?? 0 });
      out.push([origin(`const ${local} = ${rt}.propDefault(${props}, ${JSON.stringify(key)}, () => `, value.start ?? 0), c.expr(value.right, scope), ');']);
      continue;
    }
    if (value.type === 'Identifier') {
      scope.add({ name: value.name, kind: 'prop', read: access, propKey: key, write: 'prop', reactive: true, stable: false, description: 'prop', start: value.start ?? 0 });
      continue;
    }
    // nested destructuring: read-only paths
    if (value.type === 'AssignmentPattern') value = value.left;
    new TemplateCompiler(c).bindPattern(value, access, scope, 'prop');
  }
  return out;
}
