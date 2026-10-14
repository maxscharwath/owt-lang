// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { defineElement, tick, type Component } from 'owt';
import { load } from './helpers';

type Props = Record<string, unknown>;

const source = `
export component Counter(value = 0, step = 1, label = 'Count', onChange?: (value: number) => void) {
  <button class="counter" onClick={() => { value += step; onChange?.(value) }}>{label}: {value}</button>
  <style>.counter { color: rebeccapurple }</style>
}

export component Card(title = 'Untitled') {
  <article>
    <slot name="header"><h2>{title}</h2></slot>
    <slot>No content</slot>
  </article>
}
`;

function isComponent(value: unknown): value is Component<Props> {
  return typeof value === 'function';
}

let Counter: Component<Props> = () => document.createComment('');
let Card: Component<Props> = () => document.createComment('');

beforeAll(async () => {
  const mod = await load(source);
  if (isComponent(mod.Counter)) Counter = mod.Counter;
  if (isComponent(mod.Card)) Card = mod.Card;
  defineElement('test-counter', Counter, { props: { value: Number, step: Number, label: String, onChange: 'event' } });
  defineElement('test-card', Card, { props: { title: String } });
});

afterEach(() => {
  document.body.innerHTML = '';
});

const create = (html: string): HTMLElement => {
  document.body.innerHTML = html;
  const el = document.body.firstElementChild;
  if (!(el instanceof HTMLElement)) throw new Error(`no element in ${html}`);
  return el;
};
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const shadow = (el: Element, selector: string): HTMLElement | null => el.shadowRoot?.querySelector<HTMLElement>(selector) ?? null;

describe('compiled components as custom elements', () => {
  it('renders the props given as attributes', () => {
    const el = create('<test-counter value="3" label="Total"></test-counter>');

    const text = shadow(el, 'button')?.textContent;

    expect(text).toBe('Total: 3');
  });

  it('updates the DOM when a property is set', async () => {
    const el = create('<test-counter></test-counter>');

    Object.assign(el, { value: 5 });
    await tick();

    expect(shadow(el, 'button')?.textContent).toBe('Count: 5');
  });

  it('handles delegated events inside the shadow root', async () => {
    const el = create('<test-counter step="2"></test-counter>');

    shadow(el, 'button')?.click();
    await tick();

    expect(shadow(el, 'button')?.textContent).toBe('Count: 2');
  });

  it('reflects prop assignments of the component on the element property', () => {
    const el = create('<test-counter value="1"></test-counter>');

    shadow(el, 'button')?.click();

    expect(Reflect.get(el, 'value')).toBe(2);
  });

  it('dispatches a DOM event when the component calls an event prop', () => {
    const el = create('<test-counter value="4"></test-counter>');
    const listener = vi.fn((event: Event) => (event instanceof CustomEvent ? event.detail : null));
    el.addEventListener('change', listener);

    shadow(el, 'button')?.click();

    expect(listener).toHaveReturnedWith(5);
  });

  it('projects light-DOM children into the default slot outlet', async () => {
    const el = create('<test-card><p>Body</p></test-card>');

    await settle();
    const assigned = el.shadowRoot?.querySelector<HTMLSlotElement>('slot:not([name])')?.assignedElements();

    expect(assigned?.map((node) => node.textContent)).toEqual(['Body']);
  });

  it('projects children with a slot attribute into named slot outlets', async () => {
    const el = create('<test-card><h1 slot="header">Title</h1></test-card>');

    await settle();
    const assigned = el.shadowRoot?.querySelector<HTMLSlotElement>('slot[name="header"]')?.assignedElements();

    expect(assigned?.map((node) => node.textContent)).toEqual(['Title']);
  });

  it('renders the slot fallbacks without light-DOM content', () => {
    const el = create('<test-card title="Hello"></test-card>');

    const text = el.shadowRoot?.textContent;

    expect(text).toBe('HelloNo content');
  });

  it('applies the scoped component CSS inside the shadow root', () => {
    const el = create('<test-counter></test-counter>');

    const button = shadow(el, 'button');

    expect(button === null ? '' : getComputedStyle(button).color).toBe('rebeccapurple');
  });
});
