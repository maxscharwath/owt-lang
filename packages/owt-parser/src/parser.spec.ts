import { describe, it, expect } from 'vitest';
import { parse } from './index';
import type { Program } from '@owt/ast';
import {
  isComponent,
  isElement,
  isIfBlock,
  isForBlock,
  isAttribute as isAttr,
  isShorthandAttribute as isShorthandAttr,
  isSpreadAttribute as isSpreadAttr,
} from '@owt/ast';

describe('parser', () => {
  it('parses a basic component with markup and expressions', () => {
    const src = `export component App(props: { title: string }) {\n  <div>\n    <h1>{props.title}</h1>\n  </div>\n}`;

    const ast: Program = parse(src);

    expect(ast.type).toBe('Program');
    const comp = ast.body.find(isComponent);
    expect(comp?.type).toBe('Component');
    expect(comp?.name).toBe('App');
    expect(comp?.propsType?.includes('title')).toBe(true);
    const div = comp?.body.find((n) => isElement(n) && n.name === 'div');
    expect(!!div).toBe(true);
  });

  it('parses var/val declarations and if/else', () => {
    const src = `export component App() {\n  var count = 1;\n  val doubled = count * 2;\n  if (count > 0) { <p>pos</p> } else { <p>neg</p> }\n}`;

    const ast: Program = parse(src);

    const comp = ast.body.find(isComponent);
    expect(comp).toBeTruthy();
    const varDecl = comp?.body.find((n) => n.type === 'VarDecl');
    const valDecl = comp?.body.find((n) => n.type === 'ValDecl');
    const ifBlock = comp?.body.find(isIfBlock);
    expect(varDecl?.type).toBe('VarDecl');
    expect(valDecl?.type).toBe('ValDecl');
    expect(ifBlock?.type).toBe('IfBlock');
    const firstConsequent = ifBlock?.branches?.[0]?.consequent?.[0];
    expect(firstConsequent?.type).toBe('Element');
  });

  it('parses for ... empty with range and rev', () => {
    const src = `export component L() {\n  <ul>\n    for (i of 1..10) { <li>{i}</li> } empty { <li>none</li> }\n  </ul>\n  <ul>\n    for (i of rev 1..10) { <li>{i}</li> }\n  </ul>\n}`;

    const ast: Program = parse(src);

    const comp = ast.body.find(isComponent);
    const fors = comp?.body.filter((n) => isElement(n) && n.name === 'ul') ?? [];
    // Each <ul> contains a ForBlock in its children
    expect(fors.length).toBe(2);
  });

  it('parses for loop with meta variable', () => {
    const src = `export component List() {\n  var items = ['a', 'b', 'c'];\n  <ul>\n    for (item of items, meta) {\n      <li>{meta.index}: {item} {meta.first ? '(first)' : ''} {meta.last ? '(last)' : ''}</li>\n    } empty {\n      <li>No items</li>\n    }\n  </ul>\n}`;

    const ast: Program = parse(src);

    const comp = ast.body.find(isComponent);
    const ul = comp?.body.find((n) => isElement(n) && n.name === 'ul');
    expect(!!ul).toBe(true);
    const forBlock = ul?.children.find(isForBlock);
    expect(forBlock?.type).toBe('ForBlock');
    expect(forBlock?.metaIdent).toBe('meta');
    expect(forBlock?.item).toBe('item');
    expect(forBlock?.iterable?.code).toBe('items');
  });

  it('parses for loop with destructured meta variable', () => {
    const src = `export component List() {\n  var items = ['a', 'b', 'c'];\n  <ul>\n    for (item of items, {index, first, last}) {\n      <li>{index}: {item} {first ? '(first)' : ''} {last ? '(last)' : ''}</li>\n    } empty {\n      <li>No items</li>\n    }\n  </ul>\n}`;

    const ast: Program = parse(src);

    const comp = ast.body.find(isComponent);
    const ul = comp?.body.find((n) => isElement(n) && n.name === 'ul');
    expect(!!ul).toBe(true);
    const forBlock = ul?.children.find(isForBlock);
    expect(forBlock?.type).toBe('ForBlock');
    expect(forBlock?.metaIdent ?? null).toBeNull();
    expect(forBlock?.metaDestructuring).toEqual(['index', 'first', 'last']);
    expect(forBlock?.item).toBe('item');
    expect(forBlock?.iterable?.code).toBe('items');
  });

  it('parses slot placeholder and style block', () => {
    const src = `export component Card() {\n  <slot name=\"header\" />\n  <style>.card{color:red}</style>\n}`;

    const ast: Program = parse(src);

    const comp = ast.body.find(isComponent);
    const slot = comp?.body.find((n) => n.type === 'SlotPlaceholder');
    expect(slot?.type).toBe('SlotPlaceholder');
    expect(slot?.name).toBe('header');
    expect(!!comp?.style).toBe(true);
  });

  it('throws on mismatched closing tag', () => {
    const src = `export component Bad() { <div></span> }`;

    expect(() => parse(src)).toThrow();
  });

  it('parses nested control flow (if inside for) and else-if chain', () => {
    const src = `export component Nested() {\n  var x = 1;\n  if (x > 0) {\n    <ul>\n      for (i of 1..3) {\n        if (i % 2 == 0) { <li even>{i}</li> } else if (i % 3 == 0) { <li three>{i}</li> } else { <li>{i}</li> }\n      } empty {\n        <li none />\n      }\n    </ul>\n  } else {\n    <p>no</p>\n  }\n}`;

    const ast: Program = parse(src);

    const comp = ast.body.find(isComponent);
    const ifTop = comp?.body.find(isIfBlock);
    expect(ifTop?.type).toBe('IfBlock');
    const ul = ifTop?.branches[0]?.consequent.find((n) => isElement(n) && n.name === 'ul');
    expect(!!ul).toBe(true);
    const forBlock = ul?.children.find(isForBlock);
    expect(forBlock?.type).toBe('ForBlock');
    const innerIf = forBlock?.body.find(isIfBlock);
    expect(innerIf?.type).toBe('IfBlock');
    expect(innerIf?.branches?.length ?? 0).toBeGreaterThan(1);
  });

  it('parses complex attribute expressions, shorthand and spread', () => {
    const src = `export component Btn() {\n  var a = 0;\n  const props = { id: 'ok' };\n  <button onClick={() => { a++; fn(x, {y: 2}); }} data-info={'x=' + x + ', y=' + y} {...props} {disabled}>{a}</button>\n}`;

    const ast: Program = parse(src);

    const comp = ast.body.find(isComponent);
    const btn = comp?.body.find((n) => isElement(n) && n.name === 'button');
    expect(!!btn).toBe(true);
    const attrs = btn?.attributes ?? [];
    const onClick = attrs.find((a) => isAttr(a) && a.name === 'onClick');
    expect(onClick?.value?.type).toBe('Expr');
    expect(onClick?.value?.code).toContain('a++');
    const dataInfo = attrs.find((a) => isAttr(a) && a.name === 'data-info');
    expect(dataInfo?.value?.type).toBe('Expr');
    expect(dataInfo?.value?.code).toContain("'x='");
    const spread = attrs.find(isSpreadAttr);
    expect(spread?.argument?.type).toBe('Expr');
    const shorthand = attrs.find((a) => isShorthandAttr(a) && a.name === 'disabled');
    expect(!!shorthand).toBe(true);
  });
});
