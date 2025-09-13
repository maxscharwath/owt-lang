import { describe, it, expect } from 'vitest';
import { compile } from './index';

describe('compiler', () => {
  it('compiles to TS with exported function', () => {
    const src = `export component App(props: { title: string }) {\n  <div>\n    <h1>{props.title}</h1>\n    <button onClick={() => console.log('ok')}>Click</button>\n  </div>\n}`;
    const out = compile(src, 'App.owt');
    expect(out.js.code).toContain('export function App');
    expect(out.js.code).toContain('document.createElement');
    expect(out.js.code).toContain('addEventListener');
  });
});

