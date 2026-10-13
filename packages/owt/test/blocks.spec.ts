// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Source, createRoot, flushSync, get, renderEffect, set } from '../src/reactivity';
import { reactive } from '../src/proxy';
import { template } from '../src/dom/nodes';
import { each, branch, awaitBlock, tryBlock, lis, EACH_ONLY_CHILD, EACH_ITEM_SOURCE, EACH_META, type LoopMeta } from '../src/dom/blocks';

function host(): { root: HTMLElement; anchor: Comment } {
  const root = document.createElement('ul');
  const anchor = document.createComment('');
  root.appendChild(anchor);
  return { root, anchor };
}

const li = template('<li> </li>');

function renderList(list: Source<string[]>, flags = 0) {
  const { root, anchor } = host();
  createRoot(() =>
    each<string>(
      anchor,
      () => get(list),
      (item) => {
        const el = li() as HTMLElement;
        el.firstChild!.nodeValue = item as string;
        return el;
      },
      null,
      flags,
      null,
    ),
  );
  return root;
}

const texts = (root: Element) => Array.from(root.querySelectorAll('li'), (n) => n.textContent);

describe('lis', () => {
  it('finds the longest increasing subsequence', () => {
    expect(lis(Int32Array.from([2, 1, 3, -1, 4]))).toEqual([1, 2, 4]);
  });
});

describe('each', () => {
  it('renders items in order', () => {
    const list = new Source(['a', 'b', 'c']);

    const root = renderList(list);

    expect(texts(root)).toEqual(['a', 'b', 'c']);
  });

  it('reorders by moving existing nodes', () => {
    const list = new Source(['a', 'b', 'c', 'd']);
    const root = renderList(list);
    const nodeB = root.querySelectorAll('li')[1];

    set(list, ['d', 'b', 'a', 'c']);
    flushSync();

    expect(texts(root)).toEqual(['d', 'b', 'a', 'c']);
    expect(root.querySelectorAll('li')[1]).toBe(nodeB);
  });

  it('swaps two rows', () => {
    const list = new Source(['a', 'b', 'c', 'd', 'e']);
    const root = renderList(list);

    set(list, ['a', 'd', 'c', 'b', 'e']);
    flushSync();

    expect(texts(root)).toEqual(['a', 'd', 'c', 'b', 'e']);
  });

  it('inserts and removes in the middle', () => {
    const list = new Source(['a', 'b', 'c']);
    const root = renderList(list);

    set(list, ['a', 'x', 'c', 'y']);
    flushSync();

    expect(texts(root)).toEqual(['a', 'x', 'c', 'y']);
  });

  it('handles duplicate keys', () => {
    const list = new Source(['a', 'a', 'b']);
    const root = renderList(list);

    set(list, ['b', 'a', 'a', 'a']);
    flushSync();

    expect(texts(root)).toEqual(['b', 'a', 'a', 'a']);
  });

  it('clears only-child lists in one go and keeps the anchor', () => {
    const list = new Source(['a', 'b']);
    const root = renderList(list, EACH_ONLY_CHILD);

    set(list, []);
    flushSync();
    set(list, ['c']);
    flushSync();

    expect(texts(root)).toEqual(['c']);
  });

  it('renders the empty branch', () => {
    const { root, anchor } = host();
    const list = new Source<string[]>([]);
    createRoot(() => each(anchor, () => get(list), () => li(), null, 0, () => document.createTextNode('none')));

    expect(root.textContent).toBe('none');
  });

  it('updates rows in place for tracked keys', () => {
    const { root, anchor } = host();
    const list = new Source([{ id: 1, label: 'a' }]);
    createRoot(() =>
      each<{ id: number; label: string }>(
        anchor,
        () => get(list),
        (item) => {
          const el = li() as HTMLElement;
          renderEffect(() => {
            el.firstChild!.nodeValue = get(item as Source<{ id: number; label: string }>).label;
          });
          return el;
        },
        (item) => item.id,
        EACH_ITEM_SOURCE,
        null,
      ),
    );
    const before = root.querySelector('li');

    set(list, [{ id: 1, label: 'b' }]);
    flushSync();

    expect(root.querySelector('li')).toBe(before);
    expect(texts(root)).toEqual(['b']);
  });

  it('exposes reactive loop meta', () => {
    const { root, anchor } = host();
    const list = reactive(['a', 'b']);
    createRoot(() =>
      each<string>(
        anchor,
        () => list,
        (_item, _index, meta) => {
          const el = li() as HTMLElement;
          renderEffect(() => {
            const m = meta as LoopMeta;
            el.firstChild!.nodeValue = `${m.index}${m.last ? '!' : ''}`;
          });
          return el;
        },
        null,
        EACH_META,
        null,
      ),
    );

    list.unshift('z');
    flushSync();

    expect(texts(root)).toEqual(['0', '1', '2!']);
  });

  it('reacts to in-place array mutations', () => {
    const list = reactive(['a']);
    const { root, anchor } = host();
    createRoot(() =>
      each<string>(
        anchor,
        () => list,
        (item) => {
          const el = li() as HTMLElement;
          el.firstChild!.nodeValue = item as string;
          return el;
        },
        null,
        0,
        null,
      ),
    );

    list.push('b');
    flushSync();

    expect(texts(root)).toEqual(['a', 'b']);
  });
});

describe('branch', () => {
  it('switches branches and keeps the anchor last', () => {
    const { root, anchor } = host();
    const n = new Source(0);
    createRoot(() =>
      branch(anchor, () => (get(n) > 0 ? 0 : 1), [() => document.createTextNode('pos'), () => document.createTextNode('zero')]),
    );

    set(n, 5);
    flushSync();

    expect(root.textContent).toBe('pos');
    expect(root.lastChild).toBe(anchor);
  });

  it('does not re-create a branch when the index is unchanged', () => {
    const { root, anchor } = host();
    const n = new Source(1);
    createRoot(() => branch(anchor, () => (get(n) > 0 ? 0 : -1), [() => document.createElement('b')]));
    const before = root.firstChild;

    set(n, 2);
    flushSync();

    expect(root.firstChild).toBe(before);
  });
});

describe('awaitBlock', () => {
  it('shows pending then the resolved value', async () => {
    const { root, anchor } = host();
    let resolve!: (v: string) => void;
    const promise = new Promise<string>((r) => (resolve = r));
    createRoot(() =>
      awaitBlock(
        anchor,
        () => promise,
        () => document.createTextNode('loading'),
        (value) => {
          const t = document.createTextNode('');
          renderEffect(() => (t.data = get(value)));
          return t;
        },
        null,
      ),
    );
    const pending = root.textContent;

    resolve('done');
    await promise;
    await Promise.resolve();

    expect(pending).toBe('loading');
    expect(root.textContent).toBe('done');
  });
});

describe('tryBlock', () => {
  it('renders the fallback when the body throws', () => {
    const { root, anchor } = host();
    createRoot(() =>
      tryBlock(
        anchor,
        () => {
          throw new Error('nope');
        },
        (error) => document.createTextNode((get(error) as Error).message),
      ),
    );

    expect(root.textContent).toBe('nope');
  });

  it('catches errors thrown by effects after mount and can reset', () => {
    const { root, anchor } = host();
    const fail = new Source(false);
    let reset!: () => void;
    createRoot(() =>
      tryBlock(
        anchor,
        () => {
          const t = document.createTextNode('ok');
          renderEffect(() => {
            if (get(fail)) throw new Error('later');
          });
          return t;
        },
        (_error, r) => {
          reset = r;
          return document.createTextNode('failed');
        },
      ),
    );

    set(fail, true);
    flushSync();
    const failed = root.textContent;
    set(fail, false);
    reset();

    expect(failed).toBe('failed');
    expect(root.textContent).toBe('ok');
  });
});
