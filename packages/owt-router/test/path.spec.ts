import { describe, expect, it } from 'vitest';
import { buildPath, compareRank, joinPath, matchPattern, normalizeBase, parsePattern, toSearch } from '../src/path';

const best = (patterns: string[], path: string) =>
  patterns
    .map(parsePattern)
    .sort(compareRank)
    .find((p) => matchPattern(p, path) !== null)?.source;

describe('matching', () => {
  it('extracts named params', () => {
    const pattern = parsePattern('/users/:id/posts/:post');

    const params = matchPattern(pattern, '/users/42/posts/7');

    expect(params).toEqual({ id: '42', post: '7' });
  });

  it('decodes params', () => {
    const pattern = parsePattern('/tags/:tag');

    const params = matchPattern(pattern, '/tags/caf%C3%A9%20cr%C3%A8me');

    expect(params).toEqual({ tag: 'café crème' });
  });

  it('keeps malformed escapes as they are', () => {
    const pattern = parsePattern('/tags/:tag');

    const params = matchPattern(pattern, '/tags/100%');

    expect(params).toEqual({ tag: '100%' });
  });

  it('ignores trailing and repeated slashes', () => {
    const pattern = parsePattern('/users/:id');

    const params = matchPattern(pattern, '//users//42/');

    expect(params).toEqual({ id: '42' });
  });

  it('leaves a missing optional param out', () => {
    const pattern = parsePattern('/posts/:slug?');

    const params = matchPattern(pattern, '/posts');

    expect(params).toEqual({});
  });

  it('matches an optional param in the middle of a pattern', () => {
    const pattern = parsePattern('/docs/:lang?/intro');

    const params = [matchPattern(pattern, '/docs/intro'), matchPattern(pattern, '/docs/fr/intro')];

    expect(params).toEqual([{}, { lang: 'fr' }]);
  });

  it('gives the rest of the path to a wildcard', () => {
    const pattern = parsePattern('/files/*path');

    const params = matchPattern(pattern, '/files/a/b%20c/d.txt');

    expect(params).toEqual({ path: 'a/b c/d.txt' });
  });

  it('matches an empty rest with a wildcard', () => {
    const pattern = parsePattern('/files/*path');

    const params = matchPattern(pattern, '/files');

    expect(params).toEqual({ path: '' });
  });

  it('does not match extra segments', () => {
    const pattern = parsePattern('/users/:id');

    const params = matchPattern(pattern, '/users/42/edit');

    expect(params).toBeNull();
  });

  it('rejects a wildcard that is not the last segment', () => {
    const parseInvalid = () => parsePattern('/files/*path/edit');

    expect(parseInvalid).toThrow(/last segment/);
  });
});

describe('priority', () => {
  it('prefers static segments over params', () => {
    const match = best(['/users/:id', '/users/new'], '/users/new');

    expect(match).toBe('/users/new');
  });

  it('prefers params over wildcards', () => {
    const match = best(['/files/*path', '/files/:name'], '/files/readme');

    expect(match).toBe('/files/:name');
  });

  it('prefers a shorter static pattern over an optional param', () => {
    const match = best(['/posts/:slug?', '/posts'], '/posts');

    expect(match).toBe('/posts');
  });

  it('uses the catch-all last', () => {
    const match = best(['*', '/about', '/:page'], '/about');

    expect(match).toBe('/about');
  });

  it('falls back to the catch-all', () => {
    const match = best(['*', '/about'], '/nothing/here');

    expect(match).toBe('*');
  });
});

describe('building', () => {
  it('encodes params', () => {
    const path = buildPath(parsePattern('/tags/:tag'), { tag: 'a b/c' });

    expect(path).toBe('/tags/a%20b%2Fc');
  });

  it('keeps the slashes of a wildcard value', () => {
    const path = buildPath(parsePattern('/files/*path'), { path: 'docs/read me.md' });

    expect(path).toBe('/files/docs/read%20me.md');
  });

  it('skips a missing optional param', () => {
    const path = buildPath(parsePattern('/posts/:slug?'), {});

    expect(path).toBe('/posts');
  });

  it('throws on a missing required param', () => {
    const build = () => buildPath(parsePattern('/users/:id'), {});

    expect(build).toThrow(/missing param "id"/);
  });

  it('serializes query objects, skipping empty values and repeating arrays', () => {
    const search = toSearch({ q: 'a b', page: 2, draft: false, tag: ['x', 'y'], empty: undefined });

    expect(search).toBe('?q=a+b&page=2&tag=x&tag=y');
  });

  it('joins nested patterns', () => {
    const joined = [joinPath('/admin', '/'), joinPath('/admin', '/users'), joinPath('/admin', 'users'), joinPath('/', '/about'), joinPath('', '*')];

    expect(joined).toEqual(['/admin', '/admin/users', '/admin/users', '/about', '*']);
  });

  it('normalizes the base path', () => {
    const bases = [normalizeBase('/app/'), normalizeBase('app'), normalizeBase('/'), normalizeBase(undefined)];

    expect(bases).toEqual(['/app', '/app', '', '']);
  });
});
