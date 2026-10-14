import { describe, expect, it, vi } from 'vitest';
import { createRoot, flushSync, renderEffect } from '../src/reactivity';
import { reactive, toRaw, isReactive, markRaw } from '../src/proxy';

function watchValue<T>(read: () => T): T[] {
  const seen: T[] = [];
  createRoot(() => renderEffect(() => seen.push(read())));
  return seen;
}

describe('reactive proxies', () => {
  it('tracks object properties', () => {
    const obj = reactive({ count: 0 });
    const seen = watchValue(() => obj.count);

    obj.count++;
    flushSync();

    expect(seen).toEqual([0, 1]);
  });

  it('tracks nested objects lazily', () => {
    const obj = reactive({ user: { name: 'a' } });
    const seen = watchValue(() => obj.user.name);

    obj.user.name = 'b';
    flushSync();

    expect(seen).toEqual(['a', 'b']);
  });

  it('notifies on array push', () => {
    const list = reactive<number[]>([]);
    const seen = watchValue(() => list.length);

    list.push(1, 2);
    flushSync();

    expect(seen).toEqual([0, 2]);
  });

  it('does not subscribe the caller of push to length', () => {
    const list = reactive<number[]>([]);
    const fn = vi.fn(() => {
      list.push(1);
    });
    createRoot(() => renderEffect(fn));

    flushSync();

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('notifies iteration methods on item changes', () => {
    const list = reactive([{ done: false }, { done: true }]);
    const seen = watchValue(() => list.filter((t) => t.done).length);

    list[0]!.done = true;
    flushSync();

    expect(seen).toEqual([1, 2]);
  });

  it('returns reactive items from filter', () => {
    const list = reactive([{ done: false }]);

    const [item] = list.filter(() => true);

    expect(isReactive(item)).toBe(true);
  });

  it('finds raw and proxied values with includes', () => {
    const raw = { id: 1 };
    const list = reactive([raw]);

    expect(list.includes(raw)).toBe(true);
    expect(list.includes(list[0]!)).toBe(true);
  });

  it('keeps raw objects free of proxies', () => {
    const list = reactive<{ id: number }[]>([]);
    const item = reactive({ id: 1 });

    list.push(item);

    expect(isReactive(toRaw(list)[0])).toBe(false);
  });

  it('tracks added keys through ownKeys', () => {
    const obj = reactive<Record<string, number>>({});
    const seen = watchValue(() => Object.keys(obj).length);

    obj.a = 1;
    flushSync();

    expect(seen).toEqual([0, 1]);
  });

  it('notifies deleted properties', () => {
    const obj = reactive<{ a?: number }>({ a: 1 });
    const seen = watchValue(() => obj.a);

    delete obj.a;
    flushSync();

    expect(seen).toEqual([1, undefined]);
  });

  it('leaves class instances untouched', () => {
    const date = new Date();

    expect(reactive(date)).toBe(date);
  });

  it('respects markRaw', () => {
    const obj = markRaw({ a: 1 });

    expect(reactive(obj)).toBe(obj);
  });

  it('returns the same proxy for the same object', () => {
    const raw = { a: 1 };

    expect(reactive(raw)).toBe(reactive(raw));
  });
});

describe('reactive array searches', () => {
  it('finds items in arrays rebuilt from proxies', () => {
    const list = reactive([{ id: 1 }, { id: 2 }]);
    const rebuilt = reactive(list.filter(() => true));

    expect(rebuilt.indexOf(list[1]!)).toBe(1);
  });

  it('does not treat NaN as found by indexOf', () => {
    const list = reactive([Number.NaN]);

    expect([list.indexOf(Number.NaN), list.includes(Number.NaN)]).toEqual([-1, true]);
  });
});
