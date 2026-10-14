/** Patterns: parsing, ranking, matching and building paths. Pure functions, no DOM. */
import type { QueryInit } from './types';

export type Segment =
  | { readonly kind: 'static'; readonly value: string }
  | { readonly kind: 'param'; readonly name: string; readonly optional: boolean }
  /** `*name` (or `*` without a name): the rest of the path */
  | { readonly kind: 'rest'; readonly name: string };

export type Pattern = {
  readonly source: string;
  readonly segments: readonly Segment[];
  /** names of the params (empty for static patterns) */
  readonly names: readonly string[];
  /** specificity of each segment, compared lexicographically (higher wins) */
  readonly rank: readonly number[];
};

export type Params = Readonly<Record<string, string | undefined>>;

const STATIC = 5;
const PARAM = 4;
/** end of a pattern: beats segments that may match nothing (optional params, wildcards) */
const END = 3;
const OPTIONAL = 2;
const REST = 1;

/** `'/users//42/'` → `['users', '42']` */
export function splitPath(path: string): string[] {
  return path.split('/').filter((part) => part !== '');
}

export function decode(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

export function parsePattern(source: string): Pattern {
  const parts = splitPath(source);
  const segments: Segment[] = [];
  const names: string[] = [];
  const rank: number[] = [];
  parts.forEach((part, i) => {
    if (part.startsWith(':')) {
      const optional = part.endsWith('?');
      const name = part.slice(1, optional ? -1 : undefined);
      segments.push({ kind: 'param', name, optional });
      names.push(name);
      rank.push(optional ? OPTIONAL : PARAM);
    } else if (part.startsWith('*')) {
      if (i !== parts.length - 1) throw new Error(`[owt/router] "${source}": a wildcard must be the last segment`);
      const name = part.slice(1);
      segments.push({ kind: 'rest', name });
      if (name !== '') names.push(name);
      rank.push(REST);
    } else {
      segments.push({ kind: 'static', value: decode(part) });
      rank.push(STATIC);
    }
  });
  return { source, segments, names, rank };
}

/** Sort comparator: more specific patterns first (static > param > end > optional > wildcard). */
export function compareRank(a: Pattern, b: Pattern): number {
  const length = Math.max(a.rank.length, b.rank.length);
  for (let i = 0; i < length; i++) {
    const diff = (b.rank[i] ?? END) - (a.rank[i] ?? END);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Match decoded path segments; params are only written along the successful path. */
function matchFrom(segments: readonly Segment[], parts: readonly string[], si: number, pi: number, params: Record<string, string>): boolean {
  const segment = segments[si];
  if (segment === undefined) return pi === parts.length;
  const part = parts[pi];
  switch (segment.kind) {
    case 'static':
      return part === segment.value && matchFrom(segments, parts, si + 1, pi + 1, params);
    case 'param':
      if (part !== undefined && matchFrom(segments, parts, si + 1, pi + 1, params)) {
        params[segment.name] = part;
        return true;
      }
      return segment.optional && matchFrom(segments, parts, si + 1, pi, params);
    case 'rest':
      if (segment.name !== '') params[segment.name] = parts.slice(pi).join('/');
      return true;
  }
}

/** Params of `path` for `pattern`, or `null` when it does not match. */
export function matchPattern(pattern: Pattern, path: string): Record<string, string> | null {
  const params: Record<string, string> = {};
  return matchFrom(pattern.segments, splitPath(path).map(decode), 0, 0, params) ? params : null;
}

/** Decoded segments of the path a pattern builds with `params` (null when a required param is missing). */
export function buildSegments(pattern: Pattern, params: Params | undefined): string[] | null {
  const out: string[] = [];
  for (const segment of pattern.segments) {
    if (segment.kind === 'static') {
      out.push(segment.value);
      continue;
    }
    const value = segment.name === '' ? undefined : params?.[segment.name];
    if (segment.kind === 'rest') {
      if (value !== undefined) out.push(...splitPath(value));
    } else if (value !== undefined && value !== '') {
      out.push(value);
    } else if (!segment.optional) {
      return null;
    }
  }
  return out;
}

/** `'/users/:id'` + `{ id: 'a b' }` → `'/users/a%20b'` */
export function buildPath(pattern: Pattern, params: Params | undefined): string {
  const segments = buildSegments(pattern, params);
  if (segments === null) {
    const missing = pattern.names.filter((name) => params?.[name] === undefined || params[name] === '');
    throw new Error(`[owt/router] "${pattern.source}": missing param ${missing.map((n) => `"${n}"`).join(', ')}`);
  }
  return `/${segments.map(encodeURIComponent).join('/')}`;
}

/** Query string with its `?` (empty when there is nothing). */
export function toSearch(query: QueryInit | undefined): string {
  if (query === undefined) return '';
  let search: URLSearchParams;
  if (typeof query === 'string' || query instanceof URLSearchParams) {
    search = new URLSearchParams(query);
  } else {
    search = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      const values: readonly unknown[] = Array.isArray(value) ? value : [value];
      for (const v of values) {
        if (v !== null && v !== undefined && v !== false) search.append(key, String(v));
      }
    }
  }
  const out = search.toString();
  return out === '' ? '' : `?${out}`;
}

export function toHash(hash: string | undefined): string {
  if (hash === undefined || hash === '' || hash === '#') return '';
  return hash.startsWith('#') ? hash : `#${hash}`;
}

/** Pattern of a nested route (same rules as the `JoinPath` type). */
export function joinPath(base: string, pattern: string): string {
  if (base === '') return pattern === '' ? '/' : pattern;
  if (base === '/') return pattern === '' || pattern === '/' ? '/' : pattern.startsWith('/') ? pattern : `/${pattern}`;
  if (pattern === '' || pattern === '/') return base;
  return pattern.startsWith('/') ? `${base}${pattern}` : `${base}/${pattern}`;
}

/** Leading slash, no trailing slash (except the root). */
export function normalizePath(path: string): string {
  let out = path.startsWith('/') ? path : `/${path}`;
  while (out.length > 1 && out.endsWith('/')) out = out.slice(0, -1);
  return out;
}

/** `'/app/'` → `'/app'`, `'/'` → `''` */
export function normalizeBase(base: string | undefined): string {
  if (base === undefined) return '';
  const out = normalizePath(base);
  return out === '/' ? '' : out;
}

export function sameParams(a: Params, b: Params): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => a[key] === b[key]);
}
