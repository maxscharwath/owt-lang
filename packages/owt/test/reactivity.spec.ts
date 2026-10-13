import { describe, expect, it, vi } from 'vitest';
import { Computed, Source, createRoot, effect, flushSync, get, onCleanup, renderEffect, set, untrack, batch, tick, setContext, getContext, createContext } from '../src/reactivity';

describe('signals and computeds', () => {
  it('reads and writes a signal', () => {
    const s = new Source(1);

    set(s, 2);

    expect(get(s)).toBe(2);
  });

  it('computes lazily and caches', () => {
    const s = new Source(2);
    const fn = vi.fn(() => get(s) * 2);
    const c = new Computed(fn);

    get(c);
    get(c);

    expect(get(c)).toBe(4);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('recomputes an unwatched computed after a write', () => {
    const s = new Source(1);
    const c = new Computed(() => get(s) + 1);
    get(c);

    set(s, 10);

    expect(get(c)).toBe(11);
  });

  it('does not subscribe unwatched computeds to their sources', () => {
    const s = new Source(1);
    const c = new Computed(() => get(s) + 1);

    get(c);

    expect(s.subs).toBeNull();
  });

  it('runs a diamond once per change without glitches', () => {
    const a = new Source(1);
    const b = new Computed(() => get(a) * 2);
    const c = new Computed(() => get(a) * 3);
    const seen: number[] = [];
    createRoot(() => renderEffect(() => seen.push(get(b) + get(c))));

    set(a, 2);
    flushSync();

    expect(seen).toEqual([5, 10]);
  });

  it('skips effects when a computed result is unchanged', () => {
    const a = new Source(1);
    const parity = new Computed(() => get(a) % 2);
    const fn = vi.fn(() => get(parity));
    createRoot(() => renderEffect(fn));

    set(a, 3);
    flushSync();

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('tracks dynamic dependencies', () => {
    const cond = new Source(true);
    const a = new Source('a');
    const b = new Source('b');
    const seen: string[] = [];
    createRoot(() => renderEffect(() => seen.push(get(cond) ? get(a) : get(b))));

    set(cond, false);
    flushSync();
    set(a, 'A');
    flushSync();
    set(b, 'B');
    flushSync();

    expect(seen).toEqual(['a', 'b', 'B']);
  });

  it('drops links of conditionally unread sources', () => {
    const cond = new Source(true);
    const a = new Source(1);
    createRoot(() => renderEffect(() => (get(cond) ? get(a) : 0)));

    set(cond, false);
    flushSync();

    expect(a.subs).toBeNull();
  });

  it('propagates errors from computeds to readers', () => {
    const s = new Source(0);
    const c = new Computed(() => {
      if (get(s) === 1) throw new Error('boom');
      return get(s);
    });

    set(s, 1);

    expect(() => get(c)).toThrow('boom');
  });

  it('does not track reads inside untrack', () => {
    const s = new Source(1);
    const fn = vi.fn(() => untrack(() => get(s)));
    createRoot(() => renderEffect(fn));

    set(s, 2);
    flushSync();

    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('effects and scheduling', () => {
  it('batches writes until the microtask flush', async () => {
    const s = new Source(0);
    const seen: number[] = [];
    createRoot(() => renderEffect(() => seen.push(get(s))));

    set(s, 1);
    set(s, 2);
    await tick();

    expect(seen).toEqual([0, 2]);
  });

  it('flushes synchronously at the end of batch()', () => {
    const s = new Source(0);
    const seen: number[] = [];
    createRoot(() => renderEffect(() => seen.push(get(s))));

    batch(() => {
      set(s, 1);
      set(s, 2);
    });

    expect(seen).toEqual([0, 2]);
  });

  it('runs user effects after render work', () => {
    const order: string[] = [];
    createRoot(() => {
      effect(() => order.push('user'));
      renderEffect(() => order.push('render'));
    });

    flushSync();

    expect(order).toEqual(['render', 'user']);
  });

  it('runs cleanups before re-running an effect', () => {
    const s = new Source(0);
    const log: string[] = [];
    createRoot(() =>
      renderEffect(() => {
        const v = get(s);
        onCleanup(() => log.push(`cleanup ${v}`));
      }),
    );

    set(s, 1);
    flushSync();

    expect(log).toEqual(['cleanup 0']);
  });

  it('disposes nested effects when the parent re-runs', () => {
    const outer = new Source(0);
    const inner = new Source(0);
    const fn = vi.fn();
    createRoot(() =>
      renderEffect(() => {
        get(outer);
        renderEffect(() => fn(get(inner)));
      }),
    );

    set(outer, 1);
    flushSync();
    set(inner, 1);
    flushSync();

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('stops everything when a root is disposed', () => {
    const s = new Source(0);
    const fn = vi.fn(() => get(s));
    const dispose = createRoot((d) => {
      renderEffect(fn);
      return d;
    });

    dispose();
    set(s, 1);
    flushSync();

    expect(fn).toHaveBeenCalledTimes(1);
    expect(s.subs).toBeNull();
  });

  it('reports a runaway effect instead of hanging', () => {
    const s = new Source(0);
    createRoot(() =>
      renderEffect(() => {
        set(s, get(s) + 1);
      }),
    );

    expect(() => flushSync()).toThrow(/maximum update depth/);
  });
});

describe('context', () => {
  it('does not leak context into detached roots', () => {
    const key = createContext<string>();

    const value = createRoot(() => {
      setContext(key, 'theme');
      return createRoot(() => getContext(key));
    });

    expect(value).toBeUndefined();
  });

  it('inherits context through nested owners', () => {
    const key = createContext<string>();
    let value: string | undefined;

    createRoot(() => {
      setContext(key, 'dark');
      renderEffect(() => {
        value = getContext(key);
      });
    });

    expect(value).toBe('dark');
  });
});
