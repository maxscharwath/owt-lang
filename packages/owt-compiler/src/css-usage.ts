/**
 * Which tags, classes and ids the markup of a component can produce, to find
 * `<style>` selectors that can never match (Svelte's "unused CSS selector").
 *
 * The analysis is conservative: dynamic class expressions contribute the
 * string literals they contain, and anything that cannot be known statically
 * (a variable class, a spread, a dynamic id) means "any class" / "any id",
 * so a selector is only reported when no element of the component can match.
 */
import type * as t from '@babel/types';
import { walkTemplate, type ComponentDecl, type TemplateNode } from '@owt/ast';

export type ElementShape = {
  tag: string;
  classes: Set<string>;
  /** a class could come from an expression we cannot read */
  anyClass: boolean;
  ids: Set<string>;
  anyId: boolean;
};

const ANY = Symbol('any');

/** Whitespace-separated words of a class attribute. */
function words(text: string, out: Set<string>): void {
  let start = -1;
  for (let i = 0; i <= text.length; i++) {
    const c = text.charCodeAt(i);
    const space = i === text.length || c === 32 || c === 9 || c === 10 || c === 13 || c === 12;
    if (space) {
      if (start >= 0) out.add(text.slice(start, i));
      start = -1;
    } else if (start < 0) {
      start = i;
    }
  }
}

/** Class names an expression can produce, or ANY when unknown. */
function classLiterals(node: t.Node, out: Set<string>): typeof ANY | null {
  switch (node.type) {
    case 'StringLiteral':
      words(node.value, out);
      return null;
    case 'TemplateLiteral':
      if (node.expressions.length > 0) return ANY;
      for (const q of node.quasis) words(q.value.cooked ?? '', out);
      return null;
    case 'ArrayExpression':
      for (const el of node.elements) {
        if (el === null) continue;
        if (el.type === 'SpreadElement' || classLiterals(el, out) === ANY) return ANY;
      }
      return null;
    case 'ObjectExpression':
      for (const prop of node.properties) {
        if (prop.type !== 'ObjectProperty' || prop.computed) return ANY;
        if (prop.key.type === 'Identifier') out.add(prop.key.name);
        else if (prop.key.type === 'StringLiteral') words(prop.key.value, out);
        else return ANY;
      }
      return null;
    case 'ConditionalExpression':
      return classLiterals(node.consequent, out) === ANY || classLiterals(node.alternate, out) === ANY ? ANY : null;
    case 'LogicalExpression':
      if (node.operator === '&&') return classLiterals(node.right, out);
      return classLiterals(node.left, out) === ANY || classLiterals(node.right, out) === ANY ? ANY : null;
    case 'NullLiteral':
    case 'BooleanLiteral':
    case 'NumericLiteral':
      return null;
    case 'Identifier':
      return node.name === 'undefined' ? null : ANY;
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
    case 'TSNonNullExpression':
    case 'ParenthesizedExpression':
      return classLiterals(node.expression, out);
    default:
      return ANY;
  }
}

/** Shapes of the HTML / SVG elements a component renders itself (not child components). */
export function elementShapes(component: ComponentDecl): ElementShape[] {
  const shapes: ElementShape[] = [];
  const markup = component.body.filter((n): n is TemplateNode => n.type !== 'VarDecl' && n.type !== 'Statement' && n.type !== 'ValDecl');
  walkTemplate(markup, (node) => {
    if (node.type !== 'Element' || node.kind !== 'element') return;
    const shape: ElementShape = { tag: node.name.toLowerCase(), classes: new Set(), anyClass: false, ids: new Set(), anyId: false };
    for (const attr of node.attributes) {
      if (attr.type === 'SpreadAttribute') {
        shape.anyClass = true;
        shape.anyId = true;
        continue;
      }
      const value = attr.value;
      if (attr.directive === 'class') {
        shape.classes.add(attr.arg);
      } else if (attr.directive === null && attr.name === 'class') {
        if (value.type === 'Static') words(value.value, shape.classes);
        else if (value.type === 'Expression' && (value.expression === null || classLiterals(value.expression, shape.classes) === ANY)) shape.anyClass = true;
      } else if (attr.directive === null && attr.name === 'id') {
        if (value.type === 'Static') shape.ids.add(value.value);
        else shape.anyId = true;
      }
    }
    shapes.push(shape);
  });
  return shapes;
}

/**
 * Can one of `shapes` match this compound selector (`div.card#main:hover`)?
 * Attribute selectors and pseudo-classes are assumed to match.
 */
export function compoundCanMatch(compound: string, shapes: readonly ElementShape[]): boolean {
  let tag = '';
  const classes: string[] = [];
  const ids: string[] = [];
  let i = 0;
  const readName = () => {
    let j = i;
    while (j < compound.length) {
      const c = compound.charCodeAt(j);
      const nameChar = (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 45 || c === 95 || c > 127;
      if (c === 92) j += 2;
      else if (nameChar) j++;
      else break;
    }
    const name = compound.slice(i, j).replaceAll('\\', '');
    i = j;
    return name;
  };
  const skipGroup = () => {
    const open = compound[i];
    const close = open === '(' ? ')' : ']';
    let depth = 0;
    while (i < compound.length) {
      const c = compound[i];
      if (c === open) depth++;
      else if (c === close && --depth === 0) {
        i++;
        return;
      }
      i++;
    }
  };
  if (compound[0] !== '.' && compound[0] !== '#' && compound[0] !== '[' && compound[0] !== ':' && compound[0] !== '*') tag = readName().toLowerCase();
  while (i < compound.length) {
    const c = compound[i];
    if (c === '.') {
      i++;
      classes.push(readName());
    } else if (c === '#') {
      i++;
      ids.push(readName());
    } else if (c === '[' || c === '(') {
      skipGroup();
    } else {
      i++;
    }
  }
  return shapes.some(
    (s) =>
      (tag === '' || s.tag === tag) &&
      (s.anyClass || classes.every((c) => s.classes.has(c))) &&
      (s.anyId || ids.every((id) => s.ids.has(id))),
  );
}
