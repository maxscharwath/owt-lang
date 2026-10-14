// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { compile } from '../src/index';
import { render, text } from './helpers';

const shapes = `
type Shape = { kind: 'circle'; radius: number } | { kind: 'square'; size: number } | { kind: 'group'; items: Shape[] }

export component App() {
  var shape: Shape = { kind: 'circle', radius: 2 }
  <button id="square" onClick={() => shape = { kind: 'square', size: 3 }}>square</button>
  <button id="grow" onClick={() => { if (shape.kind === 'circle') shape.radius++ }}>grow</button>
  <button id="group" onClick={() => shape = { kind: 'group', items: [shape, shape] }}>group</button>
  <p>
    match (shape) {
      case { kind: 'circle', radius } { circle {radius} }
      case { kind: 'square', size: side } { square {side} }
      case { kind: 'group', items: [first, ...others] } { group of {others.length + 1} starting with {first.kind} }
    }
  </p>
}
`;

describe('match', () => {
  it('renders the first case whose pattern matches and binds its names', async () => {
    const m = await render(shapes);

    expect(text(m, 'p').trim()).toBe('circle 2');
  });

  it('switches case when the value changes shape', async () => {
    const m = await render(shapes);

    m.click('#square');

    expect(text(m, 'p').trim()).toBe('square 3');
  });

  it('updates bindings in place when the same case still matches', async () => {
    const m = await render(shapes);
    const before = m.root.querySelector('p')!.firstChild;

    m.click('#grow');

    expect(text(m, 'p').trim()).toBe('circle 3');
    expect(m.root.querySelector('p')!.firstChild).toBe(before);
  });

  it('binds array elements and rest elements', async () => {
    const m = await render(shapes);

    m.click('#group');

    expect(text(m, 'p').trim()).toBe('group of 2 starting with circle');
  });

  it('compares literals, alternatives and guards', async () => {
    const m = await render(`export component App() {
  var n = 0
  <button onClick={() => n++}>+</button>
  <p>
    match (n) {
      case 0 { zero }
      case 1, 2 { small }
      case _ if (n % 2 === 0) { even }
      default { odd }
    }
  </p>
}`);
    const seen: string[] = [];

    for (let i = 0; i < 5; i++) {
      seen.push(text(m, 'p').trim());
      m.click('button');
    }

    expect(seen).toEqual(['zero', 'small', 'small', 'odd', 'even']);
  });

  it('lets guards use the bindings of their pattern', async () => {
    const m = await render(`export component App() {
  var user = { name: 'Ada', age: 36 }
  <p>
    match (user) {
      case { age } if (age < 18) { minor }
      case { name } { adult {name} }
    }
  </p>
}`);

    expect(text(m, 'p').trim()).toBe('adult Ada');
  });

  it('matches null and nested objects', async () => {
    const m = await render(`type Res = { data: { user: { name: string } } } | null
export component App() {
  var res: Res = null
  <button onClick={() => res = { data: { user: { name: 'Grace' } } }}>load</button>
  <p>
    match (res) {
      case null { loading }
      case { data: { user: { name } } } { hello {name} }
    }
  </p>
}`);
    const before = text(m, 'p').trim();

    m.click('button');

    expect(before).toBe('loading');
    expect(text(m, 'p').trim()).toBe('hello Grace');
  });

  it('warns about cases after a catch-all case', () => {
    const out = compile(`export component App() {\n  var n = 1\n  match (n) {\n    case _ { <p>any</p> }\n    case 1 { <p>one</p> }\n  }\n}\n`, { filename: 'App.owt' });

    expect(out.warnings.map((w) => w.code)).toContain('unreachable-case');
  });

  it('rejects names bound in alternatives', () => {
    const source = `export component App() {\n  var v = { a: 1 }\n  match (v) {\n    case { a }, { b: a } { <p>{a}</p> }\n  }\n}\n`;

    expect(() => compile(source, { filename: 'App.owt' })).toThrow(/cannot be combined/);
  });
});

describe('if (val ...)', () => {
  const source = `type User = { name: string }
const users: Record<string, User> = { ada: { name: 'Ada Lovelace' } }
export component App() {
  var id = 'nobody'
  <button onClick={() => id = 'ada'}>ada</button>
  <p>
    if (val user = users[id]) {
      {user.name}
    } else {
      unknown {id}
    }
  </p>
}`;

  it('renders the else branch when the value is null or undefined', async () => {
    const m = await render(source);

    expect(text(m, 'p').trim()).toBe('unknown nobody');
  });

  it('binds the value when it is present', async () => {
    const m = await render(source);

    m.click('button');

    expect(text(m, 'p').trim()).toBe('Ada Lovelace');
  });

  it('renders falsy values that are not null', async () => {
    const m = await render(`export component App() {\n  var count = 0\n  <p>\n    if (val n = count) { count is {n} }\n  </p>\n}`);

    expect(text(m, 'p').trim()).toBe('count is 0');
  });

  it('supports bindings in else if branches', async () => {
    const m = await render(`export component App() {\n  var a: string | null = null\n  var b: string | null = 'b'\n  <p>\n    if (val x = a) { a={x} } else if (val y = b) { b={y} }\n  </p>\n}`);

    expect(text(m, 'p').trim()).toBe('b=b');
  });
});
