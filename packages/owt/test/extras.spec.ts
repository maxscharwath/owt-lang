// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, effect, flushSync, signal } from '../src/index';
import { selector, uid } from '../src/selector';
import { Defer } from '../src/dom/defer';

describe('selector', () => {
  it('reports whether a key is the selected one', () => {
    const selected = signal(2);

    const isSelected = createRoot(() => selector(() => selected.value));

    expect([1, 2, 3].map((k) => isSelected(k))).toEqual([false, true, false]);
  });

  it('only notifies the keys whose state changed', () => {
    const selected = signal(1);
    const runs: number[] = [];
    createRoot(() => {
      const isSelected = selector(() => selected.value);
      for (const key of [1, 2, 3, 4]) {
        effect(() => {
          isSelected(key);
          runs.push(key);
        });
      }
    });
    flushSync();
    runs.length = 0;

    selected.value = 3;
    flushSync();

    expect(runs.sort()).toEqual([1, 3]);
  });
});

describe('uid', () => {
  it('returns unique ids with a prefix', () => {
    const a = uid('email');
    const b = uid('email');

    expect(a).not.toBe(b);
    expect(a.startsWith('email-')).toBe(true);
  });
});

describe('Defer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const text = (value: string) => () => document.createTextNode(value);

  function mountDefer(props: Parameters<typeof Defer>[0]) {
    const root = document.createElement('div');
    document.body.appendChild(root);
    createRoot(() => root.appendChild(Defer(props)));
    return root;
  }

  it('shows the placeholder, then the content after a delay', () => {
    vi.useFakeTimers();
    const root = mountDefer({ on: 50, children: text('content'), placeholder: text('loading') });
    const before = root.textContent;

    vi.advanceTimersByTime(60);
    flushSync();

    expect(before).toBe('loading');
    expect(root.textContent).toBe('content');
  });

  it('renders on interaction with the placeholder', () => {
    const root = mountDefer({
      on: 'interaction',
      children: text('content'),
      placeholder: () => {
        const b = document.createElement('button');
        b.textContent = 'load';
        return b;
      },
    });

    root.querySelector('button')!.click();
    flushSync();

    expect(root.textContent).toBe('content');
  });

  it('renders when a condition becomes true and stays rendered', () => {
    const open = signal(false);
    const root = mountDefer({
      get on() {
        return open.value;
      },
      children: text('content'),
    });
    const before = root.textContent;

    open.value = true;
    flushSync();
    open.value = false;
    flushSync();

    expect(before).toBe('');
    expect(root.textContent).toBe('content');
  });
});
