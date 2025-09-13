import { describe, it, expect } from 'vitest';
import { parse } from './index.js';

describe('parser', () => {
  it('parses a basic component with markup and expressions', () => {
    const src = `export component App(props: { title: string }) {\n  <div>\n    <h1>{props.title}</h1>\n  </div>\n}`;
    const ast = parse(src);
    expect(ast.type).toBe('Program');
    const comp = ast.body[0] as any;
    expect(comp.type).toBe('Component');
    expect(comp.name).toBe('App');
    expect(comp.propsType?.includes('title')).toBe(true);
    const div = comp.body.find((n: any) => n.type === 'Element' && n.name === 'div');
    expect(div).toBeTruthy();
  });

  it('parses var/val declarations and if/else', () => {
    const src = `export component App() {\n  var count = 1;\n  val doubled = count * 2;\n  if (count > 0) { <p>pos</p> } else { <p>neg</p> }\n}`;
    const ast: any = parse(src);
    const comp = ast.body[0];
    const varDecl = comp.body.find((n: any) => n.type === 'VarDecl');
    const valDecl = comp.body.find((n: any) => n.type === 'ValDecl');
    const ifBlock = comp.body.find((n: any) => n.type === 'IfBlock');
    expect(varDecl?.type).toBe('VarDecl');
    expect(valDecl?.type).toBe('ValDecl');
    expect(ifBlock?.type).toBe('IfBlock');
    expect(ifBlock?.branches?.[0]?.consequent?.[0]?.type).toBe('Element');
  });

  it('parses for ... empty with range and rev', () => {
    const src = `export component L() {\n  <ul>\n    for (i of 1..10) { <li>{i}</li> } empty { <li>none</li> }\n  </ul>\n  <ul>\n    for (i of rev 1..10) { <li>{i}</li> }\n  </ul>\n}`;
    const ast: any = parse(src);
    const comp = ast.body[0];
    const fors = comp.body.filter((n: any) => n.type === 'Element' && n.name === 'ul');
    // Each <ul> contains a ForBlock in its children
    expect(fors.length).toBe(2);
  });

  it('parses slot placeholder and style block', () => {
    const src = `export component Card() {\n  <slot name="header" />\n  <style>.card{color:red}</style>\n}`;
    const ast: any = parse(src);
    const comp = ast.body[0];
    const slot = comp.body.find((n: any) => n.type === 'SlotPlaceholder');
    expect(slot?.type).toBe('SlotPlaceholder');
    expect(slot?.name).toBe('header');
    expect(comp.style).toBeTruthy();
  });

  it('throws on mismatched closing tag', () => {
    const src = `export component Bad() { <div></span> }`;
    expect(() => parse(src)).toThrow();
  });

  it('parses nested control flow (if inside for) and else-if chain', () => {
    const src = `export component Nested() {\n  var x = 1;\n  if (x > 0) {\n    <ul>\n      for (i of 1..3) {\n        if (i % 2 == 0) { <li even>{i}</li> } else if (i % 3 == 0) { <li three>{i}</li> } else { <li>{i}</li> }\n      } empty {\n        <li none />\n      }\n    </ul>\n  } else {\n    <p>no</p>\n  }\n}`;
    const ast: any = parse(src);
    const comp = ast.body[0];
    const ifTop = comp.body.find((n: any) => n.type === 'IfBlock');
    expect(ifTop?.type).toBe('IfBlock');
    const ul = ifTop.branches[0].consequent.find((n: any) => n.type === 'Element' && n.name === 'ul');
    expect(ul).toBeTruthy();
    const forBlock = ul.children.find((n: any) => n.type === 'ForBlock');
    expect(forBlock?.type).toBe('ForBlock');
    const innerIf = forBlock.body.find((n: any) => n.type === 'IfBlock');
    expect(innerIf?.type).toBe('IfBlock');
    expect((innerIf as any).branches?.length).toBeGreaterThan(1);
  });

  it('parses complex attribute expressions, shorthand and spread', () => {
    const src = `export component Btn() {\n  var a = 0;\n  const props = { id: 'ok' };\n  <button onClick={() => { a++; fn(x, {y: 2}); }} data-info={'x=' + x + ', y=' + y} {...props} {disabled}>{a}</button>\n}`;
    const ast: any = parse(src);
    const comp = ast.body[0];
    const btn = comp.body.find((n: any) => n.type === 'Element' && n.name === 'button');
    expect(btn).toBeTruthy();
    const attrs = (btn as any).attributes;
    const onClick = attrs.find((a: any) => a.type === 'Attribute' && a.name === 'onClick');
    expect(onClick?.value?.type).toBe('Expr');
    expect(onClick?.value?.code).toContain('a++');
    const dataInfo = attrs.find((a: any) => a.type === 'Attribute' && a.name === 'data-info');
    expect(dataInfo?.value?.type).toBe('Expr');
    expect(dataInfo?.value?.code).toContain("'x='");
    const spread = attrs.find((a: any) => a.type === 'SpreadAttribute');
    expect(spread?.argument?.type).toBe('Expr');
    const shorthand = attrs.find((a: any) => a.type === 'ShorthandAttribute' && a.name === 'disabled');
    expect(shorthand).toBeTruthy();
  });
});
