import { describe, it, expect } from 'vitest';
import { parse } from './index';

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
});

