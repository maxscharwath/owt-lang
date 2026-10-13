import { describe, expect, it } from 'vitest';
import {
  isComponent,
  isElement,
  isExpressionTag,
  isForBlock,
  isIfBlock,
  isScript,
  isStatement,
  isSwitchBlock,
  isAwaitBlock,
  isTryBlock,
  isText,
  isVarDecl,
  isValDecl,
  isSlotDefinition,
  isKeyBlock,
  type ComponentDecl,
  type Element,
  type Program,
} from '@owt/ast';
import { parse } from './index';
import { scanStatementEnd } from './js-scanner';

function component(src: string): ComponentDecl {
  const program = parse(src);
  const comp = program.body.find(isComponent);
  if (comp === undefined) throw new Error('no component');
  return comp;
}

function firstElement(src: string): Element {
  const el = component(src).body.find(isElement);
  if (el === undefined) throw new Error('no element');
  return el;
}

const errors = (program: Program) => program.diagnostics.map((d) => d.message);

describe('program', () => {
  it('keeps module code around components as scripts', () => {
    const src = `import { a } from './a'\ntype T = { x: number }\nexport component App() { <div/> }\nconst after = 1`;

    const program = parse(src);

    expect(program.body.map((n) => n.type)).toEqual(['Script', 'Component', 'Script']);
    expect(program.body.filter(isScript)[0]?.statements.length).toBe(2);
  });

  it('parses several components', () => {
    const src = `export component A() { <a/> }\ncomponent B() { <b/> }`;

    const comps = parse(src).body.filter(isComponent);

    expect(comps.map((c) => [c.name, c.exported])).toEqual([
      ['A', true],
      ['B', false],
    ]);
  });

  it('parses default exported components', () => {
    expect(component('export default component Main() { <main/> }').isDefault).toBe(true);
  });

  it('does not mistake member access for a component', () => {
    const program = parse('const x = obj.component\nfoo()');

    expect(program.body.every(isScript)).toBe(true);
  });

  it('reports no diagnostics for valid code', () => {
    const src = `export component App(props: { title: string }) {\n  var count = 0\n  <h1>{props.title} {count}</h1>\n}`;

    expect(errors(parse(src))).toEqual([]);
  });
});

describe('component parameters', () => {
  it('treats a single `props` parameter as the props object', () => {
    const comp = component('component A(props: { a: string }) {}');

    expect(comp.params.kind).toBe('object');
  });

  it('parses destructured props', () => {
    const comp = component('component A({ a, b = 2 }: P) {}');

    expect(comp.params.kind === 'pattern' && comp.params.pattern.properties.length).toBe(2);
  });

  it('treats other parameters as named props, including reserved words', () => {
    const comp = component('component Icon(class: string = "w-4", size?: number, ...rest: Rest) {}');

    const names = comp.params.kind === 'named' ? comp.params.params.map((p) => [p.name, p.optional, p.rest, p.defaultValue !== null]) : [];
    expect(names).toEqual([
      ['class', false, false, true],
      ['size', true, false, false],
      ['rest', false, true, false],
    ]);
  });

  it('keeps generic type parameters', () => {
    const src = 'component List<T extends { id: number }>(items: T[]) {}';

    const comp = component(src);

    expect(comp.typeParams && src.slice(comp.typeParams.start, comp.typeParams.end)).toBe('<T extends { id: number }>');
  });
});

describe('component body', () => {
  it('parses var and val with types', () => {
    const comp = component('component A() {\n  var count: number = 0\n  val doubled = count * 2\n}');

    const v = comp.body.find(isVarDecl);
    const d = comp.body.find(isValDecl);
    expect(v?.declarations[0]?.name).toBe('count');
    expect(v?.declarations[0]?.type).not.toBeNull();
    expect(d?.declarations[0]?.init?.type).toBe('BinaryExpression');
  });

  it('ends a declaration at a markup line', () => {
    const comp = component('component A() {\n  var x: Array<number> = []\n  <div/>\n}');

    expect(comp.body.map((n) => n.type)).toEqual(['VarDecl', 'Element']);
  });

  it('keeps multi-line expressions together', () => {
    const comp = component('component A() {\n  val total = items\n    .filter(Boolean)\n    .length\n  <p/>\n}');

    expect(comp.body.map((n) => n.type)).toEqual(['ValDecl', 'Element']);
  });

  it('parses functions and statements', () => {
    const comp = component('component A() {\n  function inc() { count++ }\n  const x = 1\n  console.log(x)\n}');

    expect(comp.body.filter(isStatement).map((s) => s.node?.type)).toEqual(['FunctionDeclaration', 'VariableDeclaration', 'ExpressionStatement']);
  });

  it('collects styles', () => {
    const comp = component('component A() {\n  <div/>\n  <style>.a { color: red }</style>\n}');

    expect(comp.styles[0]?.content).toBe('.a { color: red }');
  });

  it('reports a val without value', () => {
    expect(errors(parse('component A() { val x }'))).toContain('val x needs a value: val x = ...');
  });
});

describe('markup', () => {
  it('parses attributes of every kind', () => {
    const el = firstElement('component A() { <input type="text" value={v} {disabled} {...rest} bind:value={v} class:on={x} hidden /> }');

    expect(el.attributes.map((a) => (a.type === 'Attribute' ? `${a.name}:${a.value.type}${a.directive ? `:${a.directive}` : ''}` : 'spread'))).toEqual([
      'type:Static',
      'value:Expression',
      'disabled:Expression',
      'spread',
      'bind:value:Expression:bind',
      'class:on:Expression:class',
      'hidden:Boolean',
    ]);
  });

  it('parses nested elements, text and expressions', () => {
    const el = firstElement('component A() { <p>Count: {count}<b>!</b></p> }');

    expect(el.children.map((c) => c.type)).toEqual(['Text', 'ExpressionTag', 'Element']);
  });

  it('keeps template literals and strings with braces intact', () => {
    const el = firstElement('component A() { <p title={`a ${b + "}"} c`}>{ "{x}" }</p> }');

    const tag = el.children.find(isExpressionTag);
    expect(tag?.expression?.type).toBe('StringLiteral');
    expect(errors(parse('component A() { <p title={`a ${b + "}"} c`}/> }'))).toEqual([]);
  });

  it('treats void elements as self-closing', () => {
    const el = firstElement('component A() { <div><br><input></div> }');

    expect(el.children.filter(isElement).map((c) => c.name)).toEqual(['br', 'input']);
  });

  it('classifies components and special elements', () => {
    const comp = component('component A() {\n  <Button/>\n  <Icons.Plus/>\n  <slot/>\n  <window/>\n}');

    expect(comp.body.filter(isElement).map((e) => e.kind)).toEqual(['component', 'component', 'slot', 'window']);
  });

  it('does not treat keywords in the middle of text as blocks', () => {
    const el = firstElement('component A() { <p>Click if (you) {want}</p> }');

    expect(el.children.map((c) => c.type)).toEqual(['Text', 'ExpressionTag']);
  });

  it('reports a mismatched closing tag and recovers', () => {
    const program = parse('component A() { <div><span></div> <p/> }');

    expect(errors(program)).toContain('Missing closing tag </span>');
    expect(program.body.filter(isComponent)[0]?.body.filter(isElement).map((e) => e.name)).toEqual(['div', 'p']);
  });

  it('parses html comments', () => {
    const el = firstElement('component A() { <p><!-- note --></p> }');

    expect(el.children[0]?.type).toBe('Comment');
  });
});

describe('control flow', () => {
  it('parses if / else if / else', () => {
    const comp = component('component A() {\n  if (a) { <a/> } else if (b) { <b/> } else { <c/> }\n}');

    const block = comp.body.find(isIfBlock);
    expect(block?.branches.length).toBe(2);
    expect(block?.alternate?.children.filter(isElement).length).toBe(1);
  });

  it('parses blocks inside elements at the start of a line', () => {
    const el = firstElement('component A() {\n  <ul>\n    for (x of xs) { <li>{x}</li> }\n  </ul>\n}');

    expect(el.children.some(isForBlock)).toBe(true);
  });

  it('parses for headers with meta, destructuring and track', () => {
    const comp = component('component A() { for ({ id, name } of users, { index, last }; track id) { <p/> } empty { <i/> } }');

    const block = comp.body.find(isForBlock);
    expect(block?.item?.type).toBe('ObjectPattern');
    expect(block?.meta?.type).toBe('ObjectPattern');
    expect(block?.track?.type).toBe('Identifier');
    expect(block?.empty?.children.filter(isElement).length).toBe(1);
  });

  it('parses ranges and rev', () => {
    const comp = component('component A() { for (i of rev 1..count) { <p/> } }');

    const block = comp.body.find(isForBlock);
    expect(block?.reverse).toBe(true);
    expect(block?.iterable.kind).toBe('range');
  });

  it('parses switch with several values and guards', () => {
    const comp = component("component A() { switch (s) { case 'a', 'b' { <a/> } case 'c' if (ok) { <c/> } default { <d/> } } }");

    const block = comp.body.find(isSwitchBlock);
    expect(block?.cases.map((c) => [c.tests.length, c.guard !== null])).toEqual([
      [2, false],
      [1, true],
    ]);
    expect(block?.fallback?.children.filter(isElement).length).toBe(1);
  });

  it('parses await with pending, then and catch', () => {
    const comp = component('component A() { await (load()) { <p>…</p> } then (data) { <p>{data}</p> } catch (err) { <p>{err}</p> } }');

    const block = comp.body.find(isAwaitBlock);
    expect([block?.pending !== null, block?.then?.value?.type, block?.catch?.error?.type]).toEqual([true, 'Identifier', 'Identifier']);
  });

  it('parses try / catch with reset', () => {
    const comp = component('component A() { try { <Risky/> } catch (error, reset) { <button onClick={reset}/> } }');

    const block = comp.body.find(isTryBlock);
    expect(block?.catch?.reset?.name).toBe('reset');
  });

  it('parses key blocks', () => {
    expect(component('component A() { key (id) { <Profile/> } }').body.some(isKeyBlock)).toBe(true);
  });

  it('parses slot definitions inside component elements', () => {
    const el = firstElement('component A() {\n  <Table>\n    slot row({ item }) { <td>{item}</td> }\n    <p>default</p>\n  </Table>\n}');

    expect(el.children.filter(isSlotDefinition).map((s) => s.name)).toEqual(['row']);
    expect(el.children.some((c) => isElement(c) && c.name === 'p')).toBe(true);
  });

  it('parses val declarations inside blocks', () => {
    const comp = component('component A() { for (x of xs) {\n  val doubled = x * 2\n  <p>{doubled}</p>\n} }');

    const block = comp.body.find(isForBlock);
    expect(block?.body.children.some(isValDecl)).toBe(true);
  });

  it('keeps text before a block keyword on its own line', () => {
    const el = firstElement('component A() { <p>Hello\n  if (x) { <b/> }\n</p> }');

    expect(el.children.filter(isText).length).toBeGreaterThan(0);
    expect(el.children.some(isIfBlock)).toBe(true);
  });
});

describe('statement scanner', () => {
  it('stops at a newline followed by markup', () => {
    const src = 'var a = b\n<div>';

    expect(scanStatementEnd(src, 0)).toBe(9);
  });

  it('continues across operators and member chains', () => {
    const src = 'val x = a +\n  b\n  .c()\nnext';

    expect(src.slice(0, scanStatementEnd(src, 0))).toBe('val x = a +\n  b\n  .c()');
  });

  it('does not continue after a property named like a keyword', () => {
    const src = 'val k = item.type\n<p/>';

    expect(src.slice(0, scanStatementEnd(src, 0))).toBe('val k = item.type');
  });

  it('handles regex literals and division', () => {
    const src = 'val r = /}/.test(s) ? a / b : c\n<p/>';

    expect(src.slice(0, scanStatementEnd(src, 0))).toBe('val r = /}/.test(s) ? a / b : c');
  });
});
