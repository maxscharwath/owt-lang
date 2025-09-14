import { describe, it, expect, test } from 'vitest';
import { compile } from './index';

describe('compiler', () => {
  it('compiles to TS with exported function', () => {
    const src = `export component App(props: { title: string }) {\n  <div>\n    <h1>{props.title}</h1>\n    <button onClick={() => console.log('ok')}>Click</button>\n  </div>\n}`;

    const out = compile(src, 'App.owt');

    expect(out.js.code).toContain('export function App');
    expect(out.js.code).toContain('document.createElement');
    expect(out.js.code).toContain('addEventListener');
  });

  test('generates input handler with writeback assignment', () => {
    const src = `export component App(){ var newTodoText = ''; <input value={newTodoText} onInput={(e)=>{ newTodoText = e.target.value }} /> }`;
    const out = compile(src, 'App.owt');
    expect(out.js.code).toContain('addEventListener("input"');
    // Avoid regex: assert presence of writeback semantics
    expect(out.js.code.includes('typeof __h === \'' + 'function' + '\') __h($event)')).toBe(true);
    expect(out.js.code.includes('newTodoText !== __prev_newTodoText')).toBe(true);
    expect(out.js.code.includes('_ctx_0.newTodoText = newTodoText')).toBe(true);
  });

  test('generates click handler calling function reference', () => {
    const src = `export component App(){ function add(){ } <button onClick={add}/> }`;
    const out = compile(src, 'App.owt');
    expect(out.js.code).toContain('addEventListener("click"');
    expect(out.js.code).toMatch(/typeof __h === 'function'\) __h\(\$event\)/);
  });
});
