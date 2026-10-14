import { describe, expect, it } from 'vitest';
import { compile } from '../src/index';

const app = (markup: string, params = '') => `export component App(${params}) {\n  ${markup}\n}`;
const warningsOf = (source: string) => compile(source, { filename: 'App.owt' }).warnings;
const codesOf = (source: string) => warningsOf(source).map((w) => w.code);

describe('a11y-missing-alt', () => {
  it('warns about an <img> without alt', () => {
    const source = app('<img src="a.png">');

    const codes = codesOf(source);

    expect(codes).toEqual(['a11y-missing-alt']);
  });

  it('accepts an empty alt for decorative images', () => {
    const source = app('<img src="a.png" alt="">');

    const codes = codesOf(source);

    expect(codes).toEqual([]);
  });

  it('accepts a dynamic alt', () => {
    const source = app('<img src="a.png" alt={description}>', 'description: string');

    const codes = codesOf(source);

    expect(codes).toEqual([]);
  });

  it('warns about an <area> without alt', () => {
    const source = app('<map name="m"><area href="/a" shape="rect" coords="0,0,9,9"></map>');

    const codes = codesOf(source);

    expect(codes).toEqual(['a11y-missing-alt']);
  });

  it('warns about an <input type="image"> without alt', () => {
    const source = app('<input type="image" src="go.png">');

    const codes = codesOf(source);

    expect(codes).toEqual(['a11y-missing-alt']);
  });

  it('reports the warning on the opening tag', () => {
    const source = app('<p>Logo: <img src="a.png"></p>');

    const [warning] = warningsOf(source);

    expect(source.slice(warning?.start, warning?.end)).toBe('<img');
  });
});

describe('a11y-missing-content', () => {
  it('warns about an empty <button>', () => {
    const source = app('<button onClick={close}></button>');

    const codes = codesOf(source);

    expect(codes).toEqual(['a11y-missing-content']);
  });

  it('warns about a heading with only whitespace', () => {
    const source = app('<h2>  </h2>');

    const codes = codesOf(source);

    expect(codes).toEqual(['a11y-missing-content']);
  });

  it('accepts an aria-label on an icon-only button', () => {
    const source = app('<button aria-label="Close" onClick={close}></button>');

    const codes = codesOf(source);

    expect(codes).toEqual([]);
  });

  it('accepts an expression as content', () => {
    const source = app('<h1>{title}</h1>', 'title: string');

    const codes = codesOf(source);

    expect(codes).toEqual([]);
  });

  it('accepts a component as content', () => {
    const source = `import Icon from './Icon.owt'\n${app('<a href="/home"><Icon /></a>')}`;

    const codes = codesOf(source);

    expect(codes).toEqual([]);
  });
});

describe('a11y-invalid-href', () => {
  it('warns about an <a> without href', () => {
    const source = app('<a>Home</a>');

    const codes = codesOf(source);

    expect(codes).toEqual(['a11y-invalid-href']);
  });

  it('warns about href="#"', () => {
    const source = app('<a href="#">Top</a>');

    const codes = codesOf(source);

    expect(codes).toEqual(['a11y-invalid-href']);
  });

  it('warns about javascript: URLs', () => {
    const source = app('<a href="javascript:void(0)">Run</a>');

    const codes = codesOf(source);

    expect(codes).toEqual(['a11y-invalid-href']);
  });

  it('suggests a <button> when the link has a click handler', () => {
    const source = app('<a onClick={save}>Save</a>');

    const [warning] = warningsOf(source);

    expect(warning?.message).toContain('use a <button>');
  });

  it('accepts a dynamic href', () => {
    const source = app('<a href={url}>Docs</a>', 'url: string');

    const codes = codesOf(source);

    expect(codes).toEqual([]);
  });

  it('accepts an anchor target with an id', () => {
    const source = app('<a id="top">Top</a>');

    const codes = codesOf(source);

    expect(codes).toEqual([]);
  });
});

describe('a11y-click-without-key', () => {
  it('warns about a click handler without a keyboard handler', () => {
    const source = app('<div role="button" tabindex="0" onClick={open}>Open</div>');

    const codes = codesOf(source);

    expect(codes).toEqual(['a11y-click-without-key']);
  });

  it('sees click handlers with modifiers', () => {
    const source = app('<li role="option" tabindex="-1" onClick|self={pick}>One</li>');

    const codes = codesOf(source);

    expect(codes).toEqual(['a11y-click-without-key']);
  });

  it('accepts a keyboard handler with modifiers', () => {
    const source = app('<div role="button" tabindex="0" onClick={open} onKeyDown|enter={open}>Open</div>');

    const codes = codesOf(source);

    expect(codes).toEqual([]);
  });

  it('ignores presentational elements', () => {
    const source = app('<div class="backdrop" role="presentation" onClick|self={close}>…</div>');

    const codes = codesOf(source);

    expect(codes).toEqual([]);
  });

  it('ignores elements hidden from screen readers', () => {
    const source = app('<span aria-hidden="true" onClick={close}>×</span>');

    const codes = codesOf(source);

    expect(codes).toEqual([]);
  });

  it('ignores interactive elements', () => {
    const source = app('<button onClick={save}>Save</button> <a href="/next" onClick|preventDefault={go}>Next</a>');

    const codes = codesOf(source);

    expect(codes).toEqual([]);
  });

  it('ignores modifier-only listeners that just stop the event', () => {
    const source = app('<div class="modal" onClick|stopPropagation>…</div>');

    const codes = codesOf(source);

    expect(codes).toEqual([]);
  });
});

describe('a11y-interactive-without-role', () => {
  it('warns about a clickable <div> without role and tabindex', () => {
    const source = app('<div onClick={open} onKeyDown={open}>Open</div>');

    const codes = codesOf(source);

    expect(codes).toEqual(['a11y-interactive-without-role']);
  });

  it('accepts a role and a tabindex', () => {
    const source = app('<span role="button" tabindex="0" onClick={open} onKeyUp={open}>Open</span>');

    const codes = codesOf(source);

    expect(codes).toEqual([]);
  });
});

describe('a11y-autofocus', () => {
  it('warns about autofocus', () => {
    const source = app('<input autofocus>');

    const codes = codesOf(source);

    expect(codes).toEqual(['a11y-autofocus']);
  });

  it('accepts autofocus inside a <dialog>', () => {
    const source = app('<dialog open><form><input autofocus></form></dialog>');

    const codes = codesOf(source);

    expect(codes).toEqual([]);
  });
});

describe('a11y-positive-tabindex', () => {
  it('warns about a tabindex above 0', () => {
    const source = app('<div tabindex="2">x</div>');

    const codes = codesOf(source);

    expect(codes).toEqual(['a11y-positive-tabindex']);
  });

  it('reads literal expression values', () => {
    const source = app('<div tabindex={1}>x</div>');

    const codes = codesOf(source);

    expect(codes).toEqual(['a11y-positive-tabindex']);
  });

  it('accepts tabindex 0 and -1', () => {
    const source = app('<div tabindex="0">a</div> <div tabindex="-1">b</div>');

    const codes = codesOf(source);

    expect(codes).toEqual([]);
  });
});

describe('a11y-unknown-aria', () => {
  it('warns about an unknown aria attribute', () => {
    const source = app('<nav aria-foo="x">…</nav>');

    const codes = codesOf(source);

    expect(codes).toEqual(['a11y-unknown-aria']);
  });

  it('suggests the closest aria attribute', () => {
    const source = app('<button aria-lable="Close">×</button>');

    const [warning] = warningsOf(source);

    expect(warning?.message).toContain('Did you mean aria-label?');
  });

  it('accepts WAI-ARIA attributes', () => {
    const source = app('<div aria-describedby="hint" aria-live="polite" aria-hidden={hidden}>…</div>', 'hidden: boolean');

    const codes = codesOf(source);

    expect(codes).toEqual([]);
  });
});

describe('a11y-unknown-role', () => {
  it('suggests the closest role', () => {
    const source = app('<div role="buton">…</div>');

    const [warning] = warningsOf(source);

    expect(warning?.message).toContain('Did you mean "button"?');
  });

  it('warns about abstract roles', () => {
    const source = app('<div role="widget">…</div>');

    const codes = codesOf(source);

    expect(codes).toEqual(['a11y-unknown-role']);
  });

  it('checks each role of a fallback list', () => {
    const source = app('<div role="switch tabbbb">…</div>');

    const codes = codesOf(source);

    expect(codes).toEqual(['a11y-unknown-role']);
  });

  it('accepts known and dynamic roles', () => {
    const source = app('<section role="region" aria-label="News">…</section> <div role={kind}>…</div>', 'kind: string');

    const codes = codesOf(source);

    expect(codes).toEqual([]);
  });
});

describe('a11y-label-without-control', () => {
  it('warns about a label without a control', () => {
    const source = app('<label>Name</label>');

    const codes = codesOf(source);

    expect(codes).toEqual(['a11y-label-without-control']);
  });

  it('accepts a for attribute', () => {
    const source = app('<label htmlFor="name">Name</label> <input id="name">');

    const codes = codesOf(source);

    expect(codes).toEqual([]);
  });

  it('accepts a nested control, also inside blocks', () => {
    const source = app('<label>\n    Name\n    if (editable) { <input> } else { <output>-</output> }\n  </label>', 'editable: boolean');

    const codes = codesOf(source);

    expect(codes).toEqual([]);
  });

  it('accepts a nested component', () => {
    const source = `import Select from './Select.owt'\n${app('<label>Flavor <Select /></label>')}`;

    const codes = codesOf(source);

    expect(codes).toEqual([]);
  });
});

describe('a11y-media-captions', () => {
  it('warns about a <video> without captions', () => {
    const source = app('<video src="intro.mp4" controls></video>');

    const codes = codesOf(source);

    expect(codes).toEqual(['a11y-media-captions']);
  });

  it('accepts a captions track', () => {
    const source = app('<video src="intro.mp4" controls><track kind="captions" src="intro.vtt"></video>');

    const codes = codesOf(source);

    expect(codes).toEqual([]);
  });

  it('accepts a muted video', () => {
    const source = app('<video src="loop.mp4" autoplay muted loop></video>');

    const codes = codesOf(source);

    expect(codes).toEqual([]);
  });
});

describe('a11y-distracting', () => {
  it('warns about <marquee>', () => {
    const source = app('<marquee>News</marquee>');

    const codes = codesOf(source);

    expect(codes).toEqual(['a11y-distracting']);
  });

  it('warns about <blink>', () => {
    const source = app('<blink>Sale</blink>');

    const codes = codesOf(source);

    expect(codes).toEqual(['a11y-distracting']);
  });
});

describe('owt-ignore comments', () => {
  it('silence a warning on the next element', () => {
    const source = app('<!-- owt-ignore a11y-missing-alt -->\n  <img src="a.png">');

    const codes = codesOf(source);

    expect(codes).toEqual([]);
  });

  it('accept several codes separated by commas or spaces', () => {
    const source = app('<!-- owt-ignore a11y-autofocus, a11y-positive-tabindex a11y-unknown-aria -->\n  <input autofocus tabindex="1" aria-foo="x">');

    const codes = codesOf(source);

    expect(codes).toEqual([]);
  });

  it('keep the codes they do not list', () => {
    const source = app('<!-- owt-ignore a11y-autofocus -->\n  <img src="a.png">');

    const codes = codesOf(source);

    expect(codes).toEqual(['a11y-missing-alt']);
  });

  it('only apply to the next element', () => {
    const source = app('<div>\n    <!-- owt-ignore a11y-missing-alt -->\n    <img src="a.png">\n    <img src="b.png">\n  </div>');

    const codes = codesOf(source);

    expect(codes).toEqual(['a11y-missing-alt']);
  });

  it('cover the content of the next element', () => {
    const source = app('<!-- owt-ignore a11y-missing-alt -->\n  <figure><img src="a.png"></figure>');

    const codes = codesOf(source);

    expect(codes).toEqual([]);
  });

  it('silence any warning code', () => {
    const source = app('<!-- owt-ignore unreachable-case -->\n  match (n) {\n    case _ { <p>any</p> }\n    case 1 { <p>one</p> }\n  }', 'n: number');

    const codes = codesOf(source);

    expect(codes).toEqual([]);
  });
});

describe('spread attributes', () => {
  it('turn off checks for missing attributes', () => {
    const source = app('<img {...attrs}> <a {...attrs}></a> <label {...attrs}>Name</label>', 'attrs: Record<string, string>');

    const codes = codesOf(source);

    expect(codes).toEqual([]);
  });

  it('keep checks on the attributes that are written', () => {
    const source = app('<div {...attrs} tabindex="3">x</div>', 'attrs: Record<string, string>');

    const codes = codesOf(source);

    expect(codes).toEqual(['a11y-positive-tabindex']);
  });
});
