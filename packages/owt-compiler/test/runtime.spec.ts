// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { flushSync } from 'owt';
import { render, text } from './helpers';

describe('state and events', () => {
  it('increments a counter on click', async () => {
    const m = await render(`export component App() {\n  var count = 0\n  <button onClick={() => count++}>Count: {count}</button>\n}`);

    m.click('button');
    m.click('button');

    expect(text(m, 'button')).toBe('Count: 2');
  });

  it('runs inline assignment handlers', async () => {
    const m = await render(`export component App() {\n  var n = 5\n  <button onClick={n = 0}>{n}</button>\n}`);

    m.click('button');

    expect(text(m, 'button')).toBe('0');
  });

  it('recomputes val from var', async () => {
    const m = await render(`export component App() {\n  var n = 2\n  val doubled = n * 2\n  <p onClick={() => n++}>{doubled}</p>\n}`);

    m.click('p');

    expect(text(m, 'p')).toBe('6');
  });

  it('calls functions declared in the component', async () => {
    const m = await render(`export component App() {\n  var items: string[] = []\n  function add() { items = [...items, 'x'] }\n  <button onClick={add}>{items.length}</button>\n}`);

    m.click('button');

    expect(text(m, 'button')).toBe('1');
  });

  it('tracks deep mutations of var objects', async () => {
    const m = await render(`export component App() {\n  var todos = [{ done: false }]\n  <button onClick={() => todos[0].done = true}>{todos.filter((t) => t.done).length}</button>\n}`);

    m.click('button');

    expect(text(m, 'button')).toBe('1');
  });

  it('swaps vars with destructuring assignment', async () => {
    const m = await render(`export component App() {\n  var a = 1\n  var b = 2\n  <button onClick={() => [a, b] = [b, a]}>{a}-{b}</button>\n}`);

    m.click('button');

    expect(text(m, 'button')).toBe('2-1');
  });

  it('derives object literals', async () => {
    const m = await render(`export component App() {\n  var n = 1\n  val pair = { n, double: n * 2 }\n  <p onClick={() => n++}>{pair.n}:{pair.double}</p>\n}`);

    m.click('p');

    expect(text(m, 'p')).toBe('2:4');
  });

  it('passes object literal parameters to actions', async () => {
    const m = await render(`function label(el: HTMLElement, p: { text: string }) { el.textContent = p.text }\nexport component App() {\n  <p use:label={{ text: 'hi' }}></p>\n}`);

    expect(text(m, 'p')).toBe('hi');
  });

  it('iterates over object literals', async () => {
    const m = await render(`export component App() {\n  <ul>\n    for ([k, v] of { a: 1, b: 2 }) { <li>{k}={v}</li> }\n  </ul>\n}`);

    expect(text(m, 'ul')).toBe('a=1b=2');
  });

  it('destructures vals reactively', async () => {
    const m = await render(`export component App() {\n  var size = { width: 2, height: 3 }\n  val { width, height: h, depth = 1 } = size\n  <p onClick={() => size = { width: 4, height: 5 }}>{width}x{h}x{depth}</p>\n}`);
    const before = text(m, 'p');

    m.click('p');

    expect(before).toBe('2x3x1');
    expect(text(m, 'p')).toBe('4x5x1');
  });

  it('destructures arrays with rest elements in vals', async () => {
    const m = await render(`export component App() {\n  var list = [1, 2, 3]\n  val [first, ...rest] = list\n  <p onClick={() => list.push(4)}>{first}:{rest.join(',')}</p>\n}`);

    m.click('p');

    expect(text(m, 'p')).toBe('1:2,3,4');
  });

  it('destructures vars into independent state', async () => {
    const m = await render(`export component App() {\n  var [a, b] = ['x', 'y']\n  <p onClick={() => [a, b] = [b, a]}>{a}{b}</p>\n}`);

    m.click('p');

    expect(text(m, 'p')).toBe('yx');
  });

  it('destructures vals at the top of block bodies', async () => {
    const m = await render(`export component App() {\n  var points = [{ x: 1, y: 2 }]\n  <ul>\n    for (p of points) {\n      val { x, y } = p\n      <li>{x},{y}</li>\n    }\n  </ul>\n}`);

    expect(text(m, 'li')).toBe('1,2');
  });

  it('supports compound assignments', async () => {
    const m = await render(`export component App() {\n  var s = 'a'\n  <button onClick={() => s += 'b'}>{s}</button>\n}`);

    m.click('button');

    expect(text(m, 'button')).toBe('ab');
  });
});

describe('attributes', () => {
  it('updates dynamic attributes and class directives', async () => {
    const m = await render(`export component App() {\n  var on = false\n  <div title={on ? 'yes' : 'no'} class:active={on} onClick={() => on = !on}/>\n}`);

    m.click('div');

    expect(m.html()).toBe('<div title="yes" class="active"></div>');
  });

  it('accepts class arrays and objects', async () => {
    const m = await render(`export component App() {\n  var big = true\n  <p class={['a', { big, small: !big }]}/>\n}`);

    expect(m.html()).toBe('<p class="a big"></p>');
  });

  it('sets style properties', async () => {
    const m = await render(`export component App() {\n  var color = 'red'\n  <p style:color={color} style={{ marginTop: '2px' }}/>\n}`);

    expect(m.root.querySelector('p')?.getAttribute('style')).toContain('color: red');
    expect(m.root.querySelector('p')?.getAttribute('style')).toContain('margin-top: 2px');
  });

  it('spreads reactive attribute objects', async () => {
    const m = await render(`export component App() {\n  var attrs = { title: 'a' }\n  <p {...attrs} onClick={() => attrs = { title: 'b' }}/>\n}`);

    m.click('p');

    expect(m.html()).toBe('<p title="b"></p>');
  });

  it('binds input values both ways', async () => {
    const m = await render(`export component App() {\n  var name = 'a'\n  <input bind:value={name}/>\n  <p>{name}</p>\n}`);

    m.input('input', 'hello');

    expect(text(m, 'p')).toBe('hello');
  });

  it('binds checkboxes', async () => {
    const m = await render(`export component App() {\n  var ok = false\n  <input type="checkbox" bind:checked={ok}/>\n  <p>{ok ? 'on' : 'off'}</p>\n}`);
    const box = m.root.querySelector('input')!;

    box.click();
    flushSync();

    expect(text(m, 'p')).toBe('on');
  });

  it('assigns element refs', async () => {
    const m = await render(`export component App() {\n  var el: HTMLElement | null = null\n  <p ref={el}>{el ? el.tagName : 'none'}</p>\n}`);

    flushSync();

    expect(text(m, 'p')).toBe('P');
  });

  it('runs actions with parameters', async () => {
    const m = await render(`function tip(el: HTMLElement, text: string) { el.dataset.tip = text }\nexport component App() {\n  <p use:tip={'hi'}/>\n}`);

    flushSync();

    expect(m.root.querySelector('p')?.dataset.tip).toBe('hi');
  });
});

describe('control flow', () => {
  it('switches if / else branches', async () => {
    const m = await render(`export component App() {\n  var n = 0\n  <button onClick={() => n++}/>\n  if (n > 0) { <p>positive</p> } else { <p>zero</p> }\n}`);

    m.click('button');

    expect(text(m, 'p')).toBe('positive');
  });

  it('renders keyed lists with meta and empty state', async () => {
    const src = `export component App() {\n  var items = ['a', 'b']\n  <button onClick={() => items = []}/>\n  <ul>\n    for (x of items, { index }) { <li>{index}:{x}</li> } empty { <li>none</li> }\n  </ul>\n}`;
    const m = await render(src);
    const before = m.root.querySelectorAll('li').length;

    m.click('button');

    expect(before).toBe(2);
    expect(text(m, 'ul')).toBe('none');
  });

  it('keeps row nodes when items are reordered', async () => {
    const src = `export component App() {\n  var items = [{ id: 1 }, { id: 2 }]\n  <button onClick={() => items = [items[1], items[0]]}/>\n  <ul>\n    for (item of items; track item.id) { <li>{item.id}</li> }\n  </ul>\n}`;
    const m = await render(src);
    const first = m.root.querySelector('li');

    m.click('button');

    expect(text(m, 'ul')).toBe('21');
    expect(m.root.querySelectorAll('li')[1]).toBe(first);
  });

  it('iterates ranges in reverse', async () => {
    const m = await render(`export component App() {\n  <p>\n    for (i of rev 1..3) { {i} }\n  </p>\n}`);

    expect(text(m, 'p')).toBe('321');
  });

  it('supports destructured loop items and vals in loop bodies', async () => {
    const m = await render(`export component App() {\n  var users = [{ name: 'ada', age: 36 }]\n  <ul>\n    for ({ name, age } of users) {\n      val label = name + ':' + age\n      <li>{label}</li>\n    }\n  </ul>\n}`);

    expect(text(m, 'li')).toBe('ada:36');
  });

  it('matches switch cases with several values', async () => {
    const m = await render(`export component App() {\n  var s = 'b'\n  <div>\n    switch (s) { case 'a', 'b' { <p>ab</p> } default { <p>other</p> } }\n  </div>\n}`);

    expect(text(m, 'p')).toBe('ab');
  });

  it('renders await blocks', async () => {
    const m = await render(`export component App() {\n  val data = Promise.resolve('loaded')\n  <div>\n    await (data) { <p>wait</p> } then (value) { <p>{value}</p> }\n  </div>\n}`);

    await Promise.resolve();
    await Promise.resolve();
    flushSync();

    expect(text(m, 'p')).toBe('loaded');
  });

  it('catches render errors with try / catch', async () => {
    const m = await render(`component Boom() {\n  throw new Error('kaboom')\n}\nexport component App() {\n  <div>\n    try { <Boom/> } catch (e) { <p>{(e as Error).message}</p> }\n  </div>\n}`);

    expect(text(m, 'p')).toBe('kaboom');
  });

  it('re-creates key block content when the key changes', async () => {
    const m = await render(`export component App() {\n  var id = 1\n  <button onClick={() => id++}/>\n  <div>\n    key (id) { <p>{id}</p> }\n  </div>\n}`);
    const before = m.root.querySelector('p');

    m.click('button');

    expect(m.root.querySelector('p')).not.toBe(before);
  });
});

describe('components', () => {
  it('passes reactive props', async () => {
    const src = `component Label(props: { text: string }) {\n  <span>{props.text}</span>\n}\nexport component App() {\n  var t = 'a'\n  <button onClick={() => t = 'b'}/>\n  <Label text={t}/>\n}`;
    const m = await render(src);

    m.click('button');

    expect(text(m, 'span')).toBe('b');
  });

  it('supports destructured props with defaults', async () => {
    const src = `component Badge({ label, size = 'md' }: { label: string; size?: string }) {\n  <b>{label}-{size}</b>\n}\nexport component App() {\n  <Badge label="x"/>\n}`;

    const m = await render(src);

    expect(text(m, 'b')).toBe('x-md');
  });

  it('supports named props, including reserved words', async () => {
    const src = `component Icon(class: string = 'w-4', name: string) {\n  <i {class}>{name}</i>\n}\nexport component App() {\n  <Icon name="star"/>\n}`;

    const m = await render(src);

    expect(m.html()).toBe('<i class="w-4">star</i>');
  });

  it('renders default and named slots with arguments', async () => {
    const src = `component Card() {\n  <section>\n    <slot name="header" title="T"/>\n    <slot/>\n  </section>\n}\nexport component App() {\n  <Card>\n    slot header({ title }) { <h1>{title}</h1> }\n    <p>body</p>\n  </Card>\n}`;

    const m = await render(src);

    expect(m.html().split('<!---->').join('')).toBe('<section><h1>T</h1><p>body</p></section>');
  });

  it('renders slot fallback content', async () => {
    const m = await render(`component Box() {\n  <div><slot>empty</slot></div>\n}\nexport component App() {\n  <Box/>\n}`);

    expect(text(m, 'div')).toBe('empty');
  });

  it('binds component props both ways', async () => {
    const src = `component Toggle({ on }: { on: boolean }) {\n  <button onClick={() => on = !on}>{on ? 'on' : 'off'}</button>\n}\nexport component App() {\n  var on = false\n  <Toggle bind:on={on}/>\n  <p>{on ? 'yes' : 'no'}</p>\n}`;
    const m = await render(src);

    m.click('button');

    expect(text(m, 'p')).toBe('yes');
  });

  it('renders dynamic components', async () => {
    const src = `component A() { <i>A</i> }\ncomponent B() { <i>B</i> }\nexport component App() {\n  var C = A\n  <button onClick={() => C = B}/>\n  <C/>\n}`;
    const m = await render(src);

    m.click('button');

    expect(text(m, 'i')).toBe('B');
  });

  it('runs onMount and onDestroy', async () => {
    const src = `import { onMount, onDestroy } from 'owt'\nexport const log: string[] = []\ncomponent Child() {\n  onMount(() => log.push('mount'))\n  onDestroy(() => log.push('destroy'))\n  <i/>\n}\nexport component App() {\n  var show = true\n  <button onClick={() => show = false}/>\n  if (show) { <Child/> }\n}`;
    const m = await render(src);

    m.click('button');

    expect(m.html()).toBe('<button></button><!---->');
  });

  it('forwards rest props', async () => {
    const src = `component Field({ label, ...rest }: { label: string; [key: string]: unknown }) {\n  <input {...rest}/>\n}\nexport component App() {\n  <Field label="x" placeholder="Name"/>\n}`;

    const m = await render(src);

    expect(m.html()).toBe('<input placeholder="Name">');
  });
});

describe('runtime components', () => {
  it('renders Defer content on interaction with its placeholder slot', async () => {
    const m = await render(`import { Defer } from 'owt'\nexport component App() {\n  <Defer on="interaction">\n    <p>Comments</p>\n    slot placeholder { <button>Show comments</button> }\n  </Defer>\n}`);
    const before = m.html();

    m.click('button');

    expect(before).toContain('Show comments');
    expect(text(m, 'p')).toBe('Comments');
  });

  it('highlights the selected row with a selector', async () => {
    const m = await render(`import { selector } from 'owt'\nexport component App() {\n  var selected = 1\n  const isSelected = selector(() => selected)\n  <ul>\n    for (id of [1, 2, 3]) { <li class:on={isSelected(id)} onClick={() => selected = id}>{id}</li> }\n  </ul>\n}`);

    m.click('li:nth-child(3)');

    expect(Array.from(m.root.querySelectorAll('li.on'), (li) => li.textContent)).toEqual(['3']);
  });
});

describe('typescript', () => {
  it('erases types, generics, enums and type-only imports', async () => {
    const src = `import type { Foo } from './nope'\nenum Color { Red, Green = 'g' }\ninterface P { a: number }\nfunction first<T>(xs: T[]): T | undefined { return xs[0] }\nexport component App() {\n  val c: string = Color.Green as string\n  val n = first<number>([1, 2])!\n  <p>{c}{n}{Color.Red}</p>\n}`;

    const m = await render(src);

    expect(text(m, 'p')).toBe('g10');
  });
});

describe('styles', () => {
  it('adds the scope class to elements of components with styles', async () => {
    const m = await render(`export component App() {\n  <p class="a">x</p>\n  <style>.a { color: red }</style>\n}`);

    expect(m.root.querySelector('p')?.className).toMatch(/^a owt-/);
  });
});
