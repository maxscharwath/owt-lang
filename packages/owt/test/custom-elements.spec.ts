// @vitest-environment happy-dom
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { createContext, defineElement, getContext, onDestroy, tick, type Snippet } from '../src/index';
import { renderEffect } from '../src/reactivity';
import { slot } from '../src/dom/blocks';
import { injectCss } from '../src/dom/document';

type Props = {
  value?: number;
  label?: string;
  disabled?: boolean;
  maxValue?: number;
  options?: { size: number };
  items?: string[];
  date?: Date;
  onChange?: (value: number) => void;
  onValueChange?: (value: number) => void;
  children?: Snippet;
  header?: Snippet;
};

let tags = 0;
const nextTag = () => `owt-test-${++tags}`;
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const connect = <E extends HTMLElement>(el: E): E => document.body.appendChild(el);
const shadowText = (el: Element) => el.shadowRoot?.textContent ?? '';

/** Hand-written equivalent of a compiled `<p>{label}{value}</p>` component, counting its lifecycle. */
function counter() {
  const stats = { mounts: 0, destroys: 0 };
  const Counter = (props: Props): Node => {
    stats.mounts++;
    onDestroy(() => stats.destroys++);
    const p = document.createElement('p');
    renderEffect(() => {
      p.textContent = `${props.label ?? ''}${props.value ?? 0}`;
    });
    return p;
  };
  return { Counter, stats };
}

/** `<button onClick={() => onChange?.(value + 1)}>` */
function Stepper(props: Props): Node {
  const button = document.createElement('button');
  button.addEventListener('click', () => props.onChange?.((props.value ?? 0) + 1));
  return button;
}

/** `<section><slot name="header">default header</slot><slot /></section>` */
function Layout(props: Props): Node {
  const section = document.createElement('section');
  const header = section.appendChild(document.createComment(''));
  const main = section.appendChild(document.createComment(''));
  slot(header, () => props.header, {}, () => document.createTextNode('default header'));
  slot(main, () => props.children, {}, null);
  return section;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('defineElement', () => {
  it('returns the existing class when the tag is defined again with the same component', () => {
    const tag = nextTag();
    const { Counter } = counter();
    const first = defineElement(tag, Counter, { props: { value: Number } });

    const second = defineElement(tag, Counter, { props: { value: Number } });

    expect(second).toBe(first);
  });

  it('throws when the tag is already defined with another component', () => {
    const tag = nextTag();
    defineElement(tag, counter().Counter);

    const redefine = () => defineElement(tag, counter().Counter);

    expect(redefine).toThrow(/already defined/);
  });

  it('observes the attributes of the declared props in kebab-case', () => {
    const { Counter } = counter();

    const Element = defineElement(nextTag(), Counter, { props: { value: Number, maxValue: Number, onChange: 'event' } });

    expect(Element.observedAttributes).toEqual(['value', 'max-value']);
  });

  it('types the declared props as element properties', () => {
    const Element = defineElement(nextTag(), counter().Counter, { props: { value: Number, onChange: 'event' } });

    const el = new Element();

    expectTypeOf(el.value).toEqualTypeOf<number | undefined>();
    expectTypeOf(el).not.toHaveProperty('onChange');
  });

  it('rejects props that the component does not declare', () => {
    const define = () =>
      // @ts-expect-error `size` is not a prop of Counter
      defineElement(nextTag(), counter().Counter, { props: { size: Number } });

    expect(define).not.toThrow();
  });
});

describe('attributes', () => {
  it('coerces Number attributes', () => {
    const Element = defineElement(nextTag(), counter().Counter, { props: { value: Number } });
    const el = new Element();

    el.setAttribute('value', '3');

    expect(el.value).toBe(3);
  });

  it('reads a present Boolean attribute as true', () => {
    const Element = defineElement(nextTag(), counter().Counter, { props: { disabled: Boolean } });
    const el = new Element();

    el.setAttribute('disabled', '');

    expect(el.disabled).toBe(true);
  });

  it('reads a Boolean attribute set to "false" as false', () => {
    const Element = defineElement(nextTag(), counter().Counter, { props: { disabled: Boolean } });
    const el = new Element();

    el.setAttribute('disabled', 'false');

    expect(el.disabled).toBe(false);
  });

  it('keeps String attributes as they are', () => {
    const Element = defineElement(nextTag(), counter().Counter, { props: { label: String } });
    const el = new Element();

    el.setAttribute('label', '42');

    expect(el.label).toBe('42');
  });

  it('parses Object attributes as JSON', () => {
    const Element = defineElement(nextTag(), counter().Counter, { props: { options: Object } });
    const el = new Element();

    el.setAttribute('options', '{"size":2}');

    expect(el.options).toEqual({ size: 2 });
  });

  it('parses Array attributes as JSON', () => {
    const Element = defineElement(nextTag(), counter().Counter, { props: { items: Array } });
    const el = new Element();

    el.setAttribute('items', '["a","b"]');

    expect(el.items).toEqual(['a', 'b']);
  });

  it('parses attributes with a custom parser', () => {
    const Element = defineElement(nextTag(), counter().Counter, { props: { date: (attr: string | null) => new Date(attr ?? 0) } });
    const el = new Element();

    el.setAttribute('date', '2026-01-02');

    expect(el.date?.getUTCDate()).toBe(2);
  });

  it('sets camelCase props from kebab-case attributes', () => {
    const Element = defineElement(nextTag(), counter().Counter, { props: { maxValue: Number } });
    const el = new Element();

    el.setAttribute('max-value', '9');

    expect(el.maxValue).toBe(9);
  });

  it('unsets a prop when its attribute is removed', () => {
    const Element = defineElement(nextTag(), counter().Counter, { props: { value: Number } });
    const el = new Element();
    el.setAttribute('value', '3');

    el.removeAttribute('value');

    expect(el.value).toBeUndefined();
  });

  it('renders the attribute values of parsed markup', () => {
    const tag = nextTag();
    defineElement(tag, counter().Counter, { props: { value: Number, label: String } });

    document.body.innerHTML = `<${tag} value="3" label="Count: "></${tag}>`;

    expect(shadowText(document.body.firstElementChild!)).toBe('Count: 3');
  });
});

describe('properties', () => {
  it('updates the component when a property is set', async () => {
    const Element = defineElement(nextTag(), counter().Counter, { props: { value: Number } });
    const el = connect(new Element());

    el.value = 10;
    await tick();

    expect(shadowText(el)).toBe('10');
  });

  it('does not re-mount the component when a property is set', async () => {
    const { Counter, stats } = counter();
    const Element = defineElement(nextTag(), Counter, { props: { value: Number } });
    const el = connect(new Element());

    el.value = 10;
    await tick();

    expect(stats.mounts).toBe(1);
  });

  it('applies properties set before the element is upgraded', () => {
    const tag = nextTag();
    const el = connect(Object.assign(document.createElement(tag), { value: 7 }));

    defineElement(tag, counter().Counter, { props: { value: Number } });

    expect(shadowText(el)).toBe('7');
  });

  it('lets the component assign a declared prop', () => {
    const Writer = (props: Props): Node => {
      props.value = 5;
      return document.createTextNode('');
    };
    const Element = defineElement(nextTag(), Writer, { props: { value: Number } });

    const el = connect(new Element());

    expect(el.value).toBe(5);
  });
});

describe('events', () => {
  it('dispatches a CustomEvent with the first argument as detail when an event prop is called', () => {
    const Element = defineElement(nextTag(), Stepper, { props: { value: Number, onChange: 'event' } });
    const el = connect(new Element());
    el.value = 1;
    const listener = vi.fn((event: Event) => (event instanceof CustomEvent ? event.detail : null));
    el.addEventListener('change', listener);

    el.shadowRoot?.querySelector('button')?.click();

    expect(listener).toHaveReturnedWith(2);
  });

  it('dispatches bubbling, composed events', () => {
    const Element = defineElement(nextTag(), Stepper, { props: { onChange: 'event' } });
    const el = connect(new Element());
    const listener = vi.fn((event: Event) => event.composed);
    document.addEventListener('change', listener);

    el.shadowRoot?.querySelector('button')?.click();
    document.removeEventListener('change', listener);

    expect(listener).toHaveReturnedWith(true);
  });

  it('names the event of a camelCase prop in lowercase', () => {
    const Emitter = (props: Props): Node => {
      props.onValueChange?.(1);
      return document.createTextNode('');
    };
    const Element = defineElement(nextTag(), Emitter, { props: { onValueChange: 'event' } });
    const el = new Element();
    const listener = vi.fn();
    el.addEventListener('valuechange', listener);

    connect(el);

    expect(listener).toHaveBeenCalledOnce();
  });
});

describe('slots', () => {
  it('projects light-DOM children through a native default slot', () => {
    const Element = defineElement(nextTag(), Layout);
    const el = new Element();
    const child = el.appendChild(document.createElement('p'));

    connect(el);

    expect(el.shadowRoot?.querySelector<HTMLSlotElement>('slot:not([name])')?.assignedNodes()).toEqual([child]);
  });

  it('projects children with a slot attribute through a named slot', () => {
    const Element = defineElement(nextTag(), Layout);
    const el = new Element();
    const child = Object.assign(el.appendChild(document.createElement('h2')), { slot: 'header' });

    connect(el);

    expect(el.shadowRoot?.querySelector<HTMLSlotElement>('slot[name="header"]')?.assignedNodes()).toEqual([child]);
  });

  it('renders the slot fallback of the component when no child targets the slot', () => {
    const Element = defineElement(nextTag(), Layout);

    const el = connect(new Element());

    expect(shadowText(el)).toBe('default header');
  });

  it('projects children added after the element is connected', async () => {
    const Element = defineElement(nextTag(), Layout);
    const el = connect(new Element());

    el.innerHTML = 'Hello';
    await settle();

    expect(el.shadowRoot?.querySelector('slot:not([name])')).not.toBeNull();
  });

  it('does not project children without a shadow root', () => {
    const Element = defineElement(nextTag(), Layout, { shadow: false });
    const el = new Element();
    el.appendChild(document.createElement('p'));

    connect(el);

    expect(el.querySelector('slot')).toBeNull();
  });
});

describe('styles', () => {
  it('adopts the CSS injected by components into the shadow root', () => {
    injectCss('Adopted.owt', '.adopted { color: red }');
    const Element = defineElement(nextTag(), counter().Counter);

    const el = connect(new Element());

    expect(el.shadowRoot?.adoptedStyleSheets.some((sheet) => sheet.cssRules[0]?.cssText.includes('.adopted'))).toBe(true);
  });

  it('adopts the styles option after the injected CSS', () => {
    const Element = defineElement(nextTag(), counter().Counter, { styles: ':host { display: block }' });

    const el = connect(new Element());

    expect(el.shadowRoot?.adoptedStyleSheets.at(-1)?.cssRules[0]?.cssText).toContain(':host');
  });

  it('adopts CSS injected after the element is connected', () => {
    const Element = defineElement(nextTag(), counter().Counter);
    const el = connect(new Element());

    injectCss('Late.owt', '.late { color: blue }');

    expect(el.shadowRoot?.adoptedStyleSheets.some((sheet) => sheet.cssRules[0]?.cssText.includes('.late'))).toBe(true);
  });

  it('falls back to style elements without constructable stylesheets', () => {
    vi.stubGlobal('CSSStyleSheet', undefined);
    const Element = defineElement(nextTag(), counter().Counter, { styles: ':host { display: block }' });

    const el = connect(new Element());
    vi.unstubAllGlobals();

    expect(el.shadowRoot?.querySelector('style:last-of-type')?.textContent).toBe(':host { display: block }');
  });

  it('still adds injected CSS to the document head', () => {
    injectCss('Head.owt', '.head { color: green }');

    const style = document.head.querySelector('style[data-owt="Head.owt"]');

    expect(style?.textContent).toBe('.head { color: green }');
  });
});

describe('lifecycle', () => {
  it('mounts the component into an open shadow root when connected', () => {
    const Element = defineElement(nextTag(), counter().Counter, { props: { value: Number } });
    const el = new Element();
    el.value = 4;

    connect(el);

    expect(shadowText(el)).toBe('4');
  });

  it('renders into the element itself with shadow: false', () => {
    const Element = defineElement(nextTag(), counter().Counter, { shadow: false });

    const el = connect(new Element());

    expect(el.innerHTML).toBe('<p>0</p>');
  });

  it('keeps the component instance when the element is moved', async () => {
    const { Counter, stats } = counter();
    const Element = defineElement(nextTag(), Counter);
    const el = connect(new Element());

    document.body.appendChild(document.createElement('div')).appendChild(el);
    await settle();

    expect(stats).toEqual({ mounts: 1, destroys: 0 });
  });

  it('destroys the component when the element is removed', async () => {
    const { Counter, stats } = counter();
    const Element = defineElement(nextTag(), Counter);
    const el = connect(new Element());

    el.remove();
    await settle();

    expect(stats.destroys).toBe(1);
  });

  it('mounts again with the current props when connected after removal', async () => {
    const Element = defineElement(nextTag(), counter().Counter, { props: { value: Number } });
    const el = connect(new Element());
    el.value = 8;
    el.remove();
    await settle();

    connect(el);

    expect(shadowText(el)).toBe('8');
  });

  it('runs components without a parent owner (no context)', () => {
    const key = createContext<string>();
    const Reader = (): Node => document.createTextNode(getContext(key) ?? 'none');
    const Element = defineElement(nextTag(), Reader);

    const el = connect(new Element());

    expect(shadowText(el)).toBe('none');
  });
});
