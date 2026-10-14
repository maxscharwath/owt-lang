// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from '../src/index';
import { render } from './helpers';

type FakeAnimation = {
  el: Element;
  options: KeyframeAnimationOptions;
  finished: Promise<unknown>;
  reversed: boolean;
  cancelled: boolean;
  finish(): void;
  cancel(): void;
  reverse(): void;
};

let animations: FakeAnimation[] = [];
const original = Element.prototype.animate;

beforeEach(() => {
  animations = [];
  Element.prototype.animate = function (this: Element, _keyframes: unknown, options?: number | KeyframeAnimationOptions) {
    let resolve: (value: unknown) => void = () => {};
    let reject: (error: unknown) => void = () => {};
    const finished = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const animation: FakeAnimation = {
      el: this,
      options: typeof options === 'object' ? options : {},
      finished,
      reversed: false,
      cancelled: false,
      finish: () => resolve(animation),
      cancel: () => {
        animation.cancelled = true;
        reject(new Error('cancelled'));
      },
      reverse: () => {
        animation.reversed = true;
      },
    };
    animations.push(animation);
    return animation as unknown as Animation;
  } as typeof Element.prototype.animate;
});

afterEach(() => {
  Element.prototype.animate = original;
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const grow = `
export function grow(node: Element, params?: { duration?: number }) {
  return { duration: params?.duration ?? 100, keyframes: [{ opacity: 0 }, { opacity: 1 }] }
}
`;

const toggle = (initial: boolean, body: string) => `${grow}
export component App() {
  var open = ${initial}
  <button id="toggle" onClick={() => open = !open}>toggle</button>
  if (open) {
    ${body}
  }
}
`;

describe('transitions', () => {
  it('does not play intros on the initial render', async () => {
    await render(toggle(true, '<p id="panel" transition:grow>Hello</p>'));

    await settle();

    expect(animations).toHaveLength(0);
  });

  it('plays the intro when a block shows its content', async () => {
    const m = await render(toggle(false, '<p id="panel" transition:grow={{ duration: 50 }}>Hello</p>'));

    m.click('#toggle');
    await settle();

    expect(animations).toHaveLength(1);
    expect(animations[0]!.el.id).toBe('panel');
    expect(animations[0]!.options).toMatchObject({ duration: 50, direction: 'normal' });
  });

  it('keeps outroing content in the document until the outro finishes', async () => {
    const m = await render(toggle(true, '<p id="panel" transition:grow>Hello</p>'));

    m.click('#toggle');
    const during = m.root.querySelector('#panel');
    animations[0]!.finish();
    await settle();

    expect(during).not.toBeNull();
    expect(animations[0]!.options.direction).toBe('reverse');
    expect(m.root.querySelector('#panel')).toBeNull();
  });

  it('reverses an intro that is interrupted by the outro', async () => {
    const m = await render(toggle(false, '<p id="panel" transition:grow>Hello</p>'));
    m.click('#toggle');
    await settle();

    m.click('#toggle');
    animations[0]!.finish();
    await settle();

    expect(animations).toHaveLength(1);
    expect(animations[0]!.reversed).toBe(true);
    expect(m.root.querySelector('#panel')).toBeNull();
  });

  it('plays in: only on intro and out: only on outro', async () => {
    const m = await render(toggle(false, '<p id="a" in:grow>A</p><p id="b" out:grow>B</p>'));
    m.click('#toggle');
    await settle();
    const intros = animations.map((a) => a.el.id);

    m.click('#toggle');
    const outros = animations.slice(intros.length).map((a) => a.el.id);

    expect(intros).toEqual(['a']);
    expect(outros).toEqual(['b']);
  });

  it('only plays transitions of the block that changed (local transitions)', async () => {
    const m = await render(toggle(false, `<div>
      <p id="outer" in:grow>outer</p>
      if (true) {
        <p id="inner" in:grow>inner</p>
      }
    </div>`));

    m.click('#toggle');
    await settle();

    expect(animations.map((a) => a.el.id)).toEqual(['outer']);
  });

  it('plays transitions of elements inside child components', async () => {
    const m = await render(`${grow}
component Panel() {
  <p id="panel" transition:grow>Panel</p>
}
export component App() {
  var open = false
  <button id="toggle" onClick={() => open = !open}>toggle</button>
  if (open) {
    <Panel />
  }
}
`);

    m.click('#toggle');
    await settle();

    expect(animations.map((a) => a.el.id)).toEqual(['panel']);
  });

  it('plays the outro of portal content before removing it', async () => {
    const m = await render(`${grow}
import { Portal } from 'owt'
export component App() {
  var open = false
  <button id="toggle" onClick={() => open = !open}>toggle</button>
  if (open) {
    <Portal><p id="modal" transition:grow>Modal</p></Portal>
  }
}
`);
    m.click('#toggle');
    await settle();
    animations[0]!.finish();
    await settle();

    m.click('#toggle');
    const during = document.querySelector('#modal');
    animations[1]!.finish();
    await settle();

    expect(animations.map((a) => a.options.direction)).toEqual(['normal', 'reverse']);
    expect(during).not.toBeNull();
    expect(document.querySelector('#modal')).toBeNull();
  });

  it('animates list rows that are added and removed', async () => {
    const m = await render(`${grow}
export component App() {
  var items = [1, 2]
  <button id="add" onClick={() => items.push(items.length + 1)}>add</button>
  <button id="clear" onClick={() => items = []}>clear</button>
  <ul>
    for (item of items) {
      <li transition:grow>{item}</li>
    }
  </ul>
}
`);

    m.click('#add');
    await settle();
    const added = animations.map((a) => a.el.textContent);
    m.click('#clear');
    const leaving = m.root.querySelectorAll('li').length;
    for (const a of animations) a.finish();
    await settle();

    expect(added).toEqual(['3']);
    expect(leaving).toBe(3);
    expect(m.root.querySelectorAll('li')).toHaveLength(0);
  });

  it('dispatches intro and outro events', async () => {
    const m = await render(`${grow}
export component App() {
  var open = false
  var log: string[] = []
  <button id="toggle" onClick={() => open = !open}>toggle</button>
  if (open) {
    <p transition:grow onIntroStart={() => log.push('introstart')} onIntroEnd={() => log.push('introend')} onOutroStart={() => log.push('outrostart')} onOutroEnd={() => log.push('outroend')}>Hi</p>
  }
  <output>{log.join(',')}</output>
}
`);

    m.click('#toggle');
    await settle();
    animations[0]!.finish();
    await settle();
    m.click('#toggle');
    animations[1]!.finish();
    await settle();

    expect(m.root.querySelector('output')!.textContent).toBe('introstart,introend,outrostart,outroend');
  });

  it('removes content right away when the transition returns nothing', async () => {
    const m = await render(`
function maybe(node: Element, enabled: boolean) {
  return enabled ? { keyframes: [{ opacity: 0 }, { opacity: 1 }] } : null
}
export component App() {
  var open = true
  <button id="toggle" onClick={() => open = !open}>toggle</button>
  if (open) {
    <p id="panel" transition:maybe={false}>Hello</p>
  }
}
`);

    m.click('#toggle');

    expect(animations).toHaveLength(0);
    expect(m.root.querySelector('#panel')).toBeNull();
  });

  it('rejects conflicting transition directives', () => {
    const source = `${grow}\nexport component App() {\n  <p transition:grow in:grow>Hi</p>\n}\n`;

    expect(() => compile(source, { filename: 'App.owt' })).toThrow(/conflicts with transition:grow/);
  });

  it('rejects transition modifiers', () => {
    const source = `${grow}\nexport component App() {\n  <p transition:grow|global>Hi</p>\n}\n`;

    expect(() => compile(source, { filename: 'App.owt' })).toThrow(/no modifiers/);
  });

  it('animates moved list rows from their old position (animate:)', async () => {
    const rect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const index = this.parentNode === null ? 0 : Array.prototype.indexOf.call(this.parentNode.children, this);
      return { left: 0, top: index * 20, width: 100, height: 20, right: 100, bottom: index * 20 + 20, x: 0, y: index * 20, toJSON: () => ({}) };
    };
    const m = await render(`
const moves: string[] = []
function slide(node: Element, rects: { from: DOMRect; to: DOMRect }) {
  moves.push(node.textContent + ':' + rects.from.top + '>' + rects.to.top)
  return { duration: 100, keyframes: [{ transform: 'translateY(' + (rects.from.top - rects.to.top) + 'px)' }, { transform: 'none' }] }
}
export component App() {
  var items = ['a', 'b', 'c']
  <button onClick={() => items = [items[1]!, items[0]!, items[2]!]}>swap</button>
  <ul>
    for (item of items; track item) {
      <li animate:slide>{item}</li>
    }
  </ul>
  <output>{moves.join(' ')}</output>
}
`);

    m.click('button');
    Element.prototype.getBoundingClientRect = rect;

    expect(animations.map((a) => a.el.textContent)).toEqual(['b', 'a']);
    expect(animations.map((a) => a.options.fill)).toEqual(['backwards', 'backwards']);
  });

  it('rejects animate: outside a for row', () => {
    const source = `${grow}\nexport component App() {\n  <p animate:grow>Hi</p>\n}\n`;

    expect(() => compile(source, { filename: 'App.owt' })).toThrow(/directly inside a for block/);
  });
});
