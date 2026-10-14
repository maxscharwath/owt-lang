// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createRoot, flushSync, signal, effect, type Component } from '../src/index';
import { lazy, resource } from '../src/resource';

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('resource', () => {
  it('loads once and exposes the value', async () => {
    const res = createRoot(() => resource(async () => 42));
    const before = { state: res.state, loading: res.loading };

    await settle();

    expect(before).toEqual({ state: 'pending', loading: true });
    expect(res.value).toBe(42);
    expect(res.state).toBe('ready');
  });

  it('reloads when the source changes and ignores outdated responses', async () => {
    const id = signal(1);
    const pending = new Map<number, ReturnType<typeof deferred<string>>>();
    const res = createRoot(() =>
      resource(
        () => id.value,
        (n) => {
          const d = deferred<string>();
          pending.set(n, d);
          return d.promise;
        },
      ),
    );

    id.value = 2;
    flushSync();
    pending.get(2)!.resolve('two');
    pending.get(1)!.resolve('one');
    await settle();

    expect(res.value).toBe('two');
  });

  it('aborts the previous request when the source changes', () => {
    const id = signal(1);
    const signals: AbortSignal[] = [];
    createRoot(() =>
      resource(
        () => id.value,
        (_n, { signal: abort }) => {
          signals.push(abort);
          return new Promise<number>(() => {});
        },
      ),
    );

    id.value = 2;
    flushSync();

    expect(signals.map((s) => s.aborted)).toEqual([true, false]);
  });

  it('waits while the source is null', async () => {
    const id = signal<number | null>(null);
    let calls = 0;
    const res = createRoot(() =>
      resource(
        () => id.value,
        async (n) => {
          calls++;
          return n * 2;
        },
      ),
    );
    const waiting = res.state;

    id.value = 21;
    flushSync();
    await settle();

    expect(waiting).toBe('unresolved');
    expect(calls).toBe(1);
    expect(res.value).toBe(42);
  });

  it('keeps the last value while refreshing and records errors', async () => {
    let fail = false;
    const res = createRoot(() =>
      resource(async () => {
        if (fail) throw new Error('offline');
        return 'data';
      }),
    );
    await settle();

    fail = true;
    const refreshing = res.refetch();
    const during = { state: res.state, value: res.value };
    await refreshing;

    expect(during).toEqual({ state: 'refreshing', value: 'data' });
    expect(res.state).toBe('errored');
    expect((res.error as Error).message).toBe('offline');
    expect(res.value).toBe('data');
  });

  it('notifies readers when the state changes', async () => {
    const seen: string[] = [];
    createRoot(() => {
      const res = resource(async () => 'x', { initialValue: '' });
      effect(() => {
        seen.push(`${res.state}:${res.value}`);
      });
    });

    flushSync();
    await settle();
    flushSync();

    expect(seen).toEqual(['pending:', 'ready:x']);
  });

  it('applies local mutations', async () => {
    const res = createRoot(() => resource(async () => [1, 2]));
    await settle();

    res.mutate([1, 2, 3]);

    expect(res.value).toEqual([1, 2, 3]);
  });

  it('aborts the request when its owner is destroyed', () => {
    let aborted = false;
    createRoot((dispose) => {
      resource(({ signal: abort }) => {
        abort.addEventListener('abort', () => (aborted = true));
        return new Promise<number>(() => {});
      });
      dispose();
    });

    expect(aborted).toBe(true);
  });
});

describe('lazy', () => {
  const Hello: Component<{ name: string }> = (props) => {
    const p = document.createElement('p');
    p.textContent = `Hello ${props.name}`;
    return p;
  };

  it('renders the component once its module is loaded', async () => {
    const Lazy = lazy<{ name: string }>(async () => ({ Hello }), 'Hello');
    const root = document.createElement('div');

    createRoot(() => root.appendChild(Lazy({ name: 'Ada' })));
    const before = root.textContent;
    await settle();
    flushSync();

    expect(before).toBe('');
    expect(root.textContent).toBe('Hello Ada');
  });

  it('renders synchronously after preload', async () => {
    const Lazy = lazy<{ name: string }>(async () => ({ default: Hello }));
    await Lazy.preload();
    const root = document.createElement('div');

    createRoot(() => root.appendChild(Lazy({ name: 'Grace' })));

    expect(root.textContent).toBe('Hello Grace');
  });

  it('loads the module only once', async () => {
    let loads = 0;
    const Lazy = lazy<{ name: string }>(async () => {
      loads++;
      return { default: Hello };
    });

    await Promise.all([Lazy.preload(), Lazy.preload()]);

    expect(loads).toBe(1);
  });
});
