/**
 * `match` patterns. A pattern is written as an expression and read as a
 * destructuring pattern with checks:
 *
 * - `_` matches anything;
 * - literals (`'circle'`, `42`, `-1`, `true`, `null`, `undefined`) and other
 *   expressions at the top level or as property values (`Kind.Circle`,
 *   `MAX + 1`) compare with `===`;
 * - `{ kind: 'circle', radius, center: { x } }` matches objects (not null),
 *   checks the literal properties and binds the names (`radius`, `x`);
 *   `{ radius: r }` binds `r`;
 * - `[first, _, ...rest]` matches arrays of that length (at least, with a
 *   rest element) and binds by position.
 *
 * Top-level names other than `_` compare by value (`case MAX`); names only
 * bind inside object and array patterns.
 *
 * The compiler and the editor tooling both render checks and bindings from
 * this description, so runtime behaviour and type narrowing agree.
 */
import type * as t from '@babel/types';

/** Property keys and array indexes from the matched value. */
export type PatternPath = readonly (string | number)[];

/** Source node of each path segment (the property key; null for array positions). */
export type PatternKeys = readonly (t.Node | null)[];

export type PatternCheck = { path: PatternPath; keys: PatternKeys; node: t.Node } & (
  | { kind: 'object' }
  | { kind: 'array'; length: number; rest: boolean }
  | { kind: 'equals'; value: t.Expression }
);

export type PatternBinding = {
  name: string;
  id: t.Identifier;
  path: PatternPath;
  keys: PatternKeys;
  /** `...rest` in an array pattern: elements from this index */
  restFrom: number | null;
};

export type PatternError = { message: string; start: number; end: number };

export type PatternInfo = {
  checks: PatternCheck[];
  bindings: PatternBinding[];
  errors: PatternError[];
};

function isWildcard(node: t.Node): boolean {
  return node.type === 'Identifier' && node.name === '_';
}

export function analyzePattern(pattern: t.Expression): PatternInfo {
  const info: PatternInfo = { checks: [], bindings: [], errors: [] };
  const error = (node: t.Node, message: string) => info.errors.push({ message, start: node.start ?? 0, end: node.end ?? 0 });

  const visit = (node: t.Node, path: PatternPath, keys: PatternKeys, top: boolean): void => {
    if (isWildcard(node)) return;
    switch (node.type) {
      case 'Identifier':
        if (top || node.name === 'undefined') info.checks.push({ kind: 'equals', path, keys, node, value: node });
        else info.bindings.push({ name: node.name, id: node, path, keys, restFrom: null });
        return;
      case 'ObjectExpression':
        info.checks.push({ kind: 'object', path, keys, node });
        for (const prop of node.properties) {
          if (prop.type !== 'ObjectProperty' || prop.computed) {
            error(prop, prop.type === 'SpreadElement' ? 'Rest properties are not supported in match patterns' : 'Only plain properties are allowed in match patterns: { key: pattern }');
            continue;
          }
          const key = prop.key.type === 'Identifier' ? prop.key.name : prop.key.type === 'StringLiteral' ? prop.key.value : prop.key.type === 'NumericLiteral' ? String(prop.key.value) : null;
          if (key === null) {
            error(prop.key, 'Unsupported property key in match pattern');
            continue;
          }
          if (prop.value.type === 'AssignmentPattern' || prop.value.type === 'RestElement' || prop.value.type === 'ArrayPattern' || prop.value.type === 'ObjectPattern') {
            error(prop.value, 'Default values are not supported in match patterns (use a guard)');
            continue;
          }
          visit(prop.value, [...path, key], [...keys, prop.key], false);
        }
        return;
      case 'ArrayExpression': {
        const elements = node.elements;
        const last = elements[elements.length - 1];
        const rest = last !== undefined && last !== null && last.type === 'SpreadElement';
        const fixed = rest ? elements.length - 1 : elements.length;
        info.checks.push({ kind: 'array', path, keys, node, length: fixed, rest });
        elements.forEach((el, i) => {
          if (el === null) return;
          if (el.type === 'SpreadElement') {
            if (i !== elements.length - 1) {
              error(el, 'The rest element must be last');
            } else if (el.argument.type === 'Identifier') {
              if (!isWildcard(el.argument)) info.bindings.push({ name: el.argument.name, id: el.argument, path, keys, restFrom: i });
            } else {
              error(el.argument, 'The rest element must be a name: [first, ...rest]');
            }
            return;
          }
          visit(el, [...path, i], [...keys, null], false);
        });
        return;
      }
      default:
        if (node.type === 'ArgumentPlaceholder' || node.type === 'SpreadElement' || node.type === 'JSXNamespacedName') {
          error(node, 'Unsupported match pattern');
          return;
        }
        info.checks.push({ kind: 'equals', path, keys, node, value: node as t.Expression });
    }
  };

  visit(pattern, [], [], true);
  const seen = new Set<string>();
  for (const b of info.bindings) {
    if (seen.has(b.name)) error(b.id, `'${b.name}' is bound twice in this pattern`);
    seen.add(b.name);
  }
  return info;
}

function isIdentifierName(s: string): boolean {
  if (s === '') return false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const letter = (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 36 || c === 95;
    if (!letter && !(i > 0 && c >= 48 && c <= 57)) return false;
  }
  return true;
}

export function isPathKey(seg: string | number): seg is string {
  return typeof seg === 'string' && isIdentifierName(seg);
}

/** `base.key[0]["odd-key"]` */
export function renderPatternPath(base: string, path: PatternPath): string {
  let out = base;
  for (const seg of path) {
    if (typeof seg === 'number') out += `[${seg}]`;
    else out += isIdentifierName(seg) ? `.${seg}` : `[${JSON.stringify(seg)}]`;
  }
  return out;
}
