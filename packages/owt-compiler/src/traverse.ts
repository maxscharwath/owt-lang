/** Enumerate the embedded TypeScript of a component (for usage / write analysis). */
import type * as t from '@babel/types';
import type { ComponentDecl, TemplateNode } from '@owt/ast';

export type JsVisitor = {
  /** an expression or statement tree */
  node(node: t.Node, kind: 'expression' | 'statement'): void;
  /** an identifier implicitly referenced by markup (component tags, `use:` actions, `{x}` shorthands) */
  name?(name: string, start: number): void;
  /** an identifier implicitly written by markup (`bind:x`, `ref={x}`) */
  written?(name: string, start: number): void;
};

export function visitTemplate(nodes: readonly TemplateNode[], v: JsVisitor): void {
  const expr = (e: t.Node | null | undefined) => {
    if (e != null) v.node(e, 'expression');
  };
  for (const node of nodes) {
    switch (node.type) {
      case 'ExpressionTag':
        expr(node.expression);
        break;
      case 'ValDecl':
        for (const d of node.declarations) expr(d.init);
        break;
      case 'Element':
        if (node.kind === 'component') v.name?.(node.name.split('.')[0]!, node.nameSpan.start);
        for (const a of node.attributes) {
          if (a.type === 'SpreadAttribute') {
            expr(a.expression);
            continue;
          }
          if (a.directive === 'use') v.name?.(a.arg.split('.')[0]!, a.nameSpan.start);
          if (a.value.type === 'Expression') {
            const e = a.value.expression;
            if (e === null) continue;
            if (e.type === 'Identifier' && a.shorthand) v.name?.(e.name, e.start ?? 0);
            else expr(e);
            if ((a.directive === 'bind' || a.name === 'ref') && e.type === 'Identifier') v.written?.(e.name, e.start ?? 0);
          } else if (a.value.type === 'Boolean' && (a.directive === 'class' || a.directive === 'bind')) {
            v.name?.(a.arg, a.nameSpan.start);
            if (a.directive === 'bind') v.written?.(a.arg, a.nameSpan.start);
          }
        }
        visitTemplate(node.children, v);
        break;
      case 'IfBlock':
        for (const b of node.branches) {
          expr(b.test);
          visitTemplate(b.body.children, v);
        }
        if (node.alternate) visitTemplate(node.alternate.children, v);
        break;
      case 'ForBlock':
        if (node.iterable.kind === 'range') {
          expr(node.iterable.from);
          expr(node.iterable.to);
        } else {
          expr(node.iterable.expression);
        }
        expr(node.track);
        if (node.item !== null) v.node(node.item, 'expression');
        visitTemplate(node.body.children, v);
        if (node.empty) visitTemplate(node.empty.children, v);
        break;
      case 'SwitchBlock':
        expr(node.discriminant);
        for (const c of node.cases) {
          for (const test of c.tests) expr(test);
          expr(c.guard);
          visitTemplate(c.body.children, v);
        }
        if (node.fallback) visitTemplate(node.fallback.children, v);
        break;
      case 'AwaitBlock':
        expr(node.expression);
        if (node.pending) visitTemplate(node.pending.children, v);
        if (node.then) visitTemplate(node.then.body.children, v);
        if (node.catch) visitTemplate(node.catch.body.children, v);
        break;
      case 'TryBlock':
        visitTemplate(node.body.children, v);
        if (node.catch) visitTemplate(node.catch.body.children, v);
        break;
      case 'KeyBlock':
        expr(node.expression);
        visitTemplate(node.body.children, v);
        break;
      case 'SlotDefinition':
        visitTemplate(node.body.children, v);
        break;
      default:
        break;
    }
  }
}

export function visitComponent(component: ComponentDecl, v: JsVisitor): void {
  const params = component.params;
  if (params.kind === 'pattern') v.node(params.pattern, 'expression');
  if (params.kind === 'named') for (const p of params.params) if (p.defaultValue !== null) v.node(p.defaultValue, 'expression');
  const markup: TemplateNode[] = [];
  for (const item of component.body) {
    if (item.type === 'VarDecl' || item.type === 'ValDecl') {
      for (const d of item.declarations) if (d.init !== null) v.node(d.init, 'expression');
    } else if (item.type === 'Statement') {
      v.node(item.node, 'statement');
    } else {
      markup.push(item);
    }
  }
  visitTemplate(markup, v);
}
