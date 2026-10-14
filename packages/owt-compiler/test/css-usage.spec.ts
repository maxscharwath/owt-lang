import { describe, expect, it } from 'vitest';
import { compile } from '../src/index';

const unused = (markup: string, css: string) =>
  compile(`export component App() {\n  var on = true\n  var name = 'x'\n  ${markup}\n  <style>\n${css}\n  </style>\n}\n`, { filename: 'App.owt' })
    .warnings.filter((w) => w.code === 'css-unused-selector')
    .map((w) => w.message.slice(w.message.indexOf('"') + 1, w.message.indexOf('"', w.message.indexOf('"') + 1)));

describe('unused CSS selectors', () => {
  it('reports a class that no element has', () => {
    expect(unused('<p class="a">x</p>', '.a { color: red } .b { color: blue }')).toEqual(['.b']);
  });

  it('reports a tag that is not rendered', () => {
    expect(unused('<p>x</p>', 'p { margin: 0 } h1 { margin: 0 }')).toEqual(['h1']);
  });

  it('reports a complex selector when one of its parts matches nothing', () => {
    expect(unused('<div class="card"><p>x</p></div>', '.card p { margin: 0 } .card h3 { margin: 0 }')).toEqual(['.card h3']);
  });

  it('reports each unused selector of a list separately', () => {
    expect(unused('<p class="a">x</p>', '.a, .b, .c { color: red }')).toEqual(['.b', '.c']);
  });

  it('counts class: directives and literals in class expressions', () => {
    expect(unused(`<p class:active={on} class={['big', on ? 'red' : 'blue', { bold: on }]}>x</p>`, '.active, .big, .red, .blue, .bold { color: red }')).toEqual([]);
  });

  it('assumes any class for class expressions it cannot read', () => {
    expect(unused('<p class={name}>x</p>', '.anything { color: red }')).toEqual([]);
  });

  it('assumes any class and id with a spread', () => {
    expect(unused('<p {...{}}>x</p>', '.x, #y { color: red }')).toEqual([]);
  });

  it('checks ids', () => {
    expect(unused('<p id="main">x</p>', '#main { color: red } #other { color: red }')).toEqual(['#other']);
  });

  it('ignores global selectors, pseudo-classes and attribute selectors', () => {
    expect(unused('<input type="text" />', ':global(.x) { color: red } input:focus { outline: 0 } input[type=text] { color: red } :global(body) input { color: red }')).toEqual([]);
  });

  it('checks rules nested in media queries and nested rules', () => {
    expect(unused('<p class="a">x</p>', '@media (min-width: 1px) { .a { color: red } .gone { color: red } } .a { &:hover { color: blue } .missing { color: red } }')).toEqual(['.gone', '.missing']);
  });

  it('ignores elements of child components', () => {
    expect(unused('<Child class="x" />', '.x { color: red }')).toEqual(['.x']);
  });

  it('reports the location of the selector', () => {
    const source = `export component App() {\n  <p>x</p>\n  <style>\n    h2 { color: red }\n  </style>\n}\n`;

    const [warning] = compile(source, { filename: 'App.owt' }).warnings;

    expect(source.slice(warning!.start, warning!.end)).toBe('h2');
  });
});
