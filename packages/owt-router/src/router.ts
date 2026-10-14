/**
 * `createRouter`: route table, current location (OWT signals), history and
 * hash integration, guards, scrolling and view transitions.
 *
 * The runtime works with untyped patterns and params (`RouteMap`); the route
 * map type `R` only refines the public types (see `types.ts`).
 */
import { batch, signal, untrack, type Component } from 'owt';
import { createLink, type LinkRouter, type LooseLink } from './link';
import {
  buildPath,
  buildSegments,
  compareRank,
  decode,
  joinPath,
  matchPattern,
  normalizeBase,
  normalizePath,
  parsePattern,
  sameParams,
  splitPath,
  toHash,
  toSearch,
  type Params,
  type Pattern,
} from './path';
import type {
  AnyComponent,
  AnyRoute,
  GuardResult,
  MatchedRoute,
  NavigateOptions,
  QueryInit,
  RouteGroup,
  RouteMap,
  RouterInstance,
  RouterOptions,
  ScrollBehavior,
  ViewProps,
} from './types';

/** A leaf of the route map with the layouts around it. */
type FlatRoute = {
  readonly pattern: Pattern;
  /** layouts (outermost first), then the route component */
  readonly matched: readonly MatchedRoute[];
};

/** Path, query and fragment of a URL inside the app. */
type Address = {
  /** normalized path, without the base, percent-encoded as in the URL */
  readonly path: string;
  /** `'?a=1'` or `''` */
  readonly search: string;
  /** fragment without `#`, decoded */
  readonly hash: string;
};

type Resolved = Address & {
  readonly route: FlatRoute | null;
  readonly params: Readonly<Record<string, string>>;
};

type Mode = 'push' | 'replace' | 'pop' | 'initial';

/** A back/forward navigation: the history position it comes from. */
type Pop = { readonly from: number };

/** Options of the untyped runtime (`RouterOptions<R>` without the route map types). */
type Options = {
  readonly routes: RouteMap;
  readonly mode?: 'history' | 'hash' | undefined;
  readonly base?: string | undefined;
  readonly scroll?: ScrollBehavior | undefined;
  readonly viewTransitions?: boolean | undefined;
  beforeEach?(to: AnyRoute, from: AnyRoute): GuardResult | Promise<GuardResult>;
};

/** Untyped router: what the runtime implements. */
type LooseRouter = {
  readonly route: AnyRoute;
  readonly matched: readonly MatchedRoute[];
  readonly ready: Promise<void>;
  readonly Link: LooseLink;
  href: LinkRouter['href'];
  /** `navigate(pattern, params?, options?)` or `navigate(path, options?)` */
  navigate(to: string, a?: unknown, b?: unknown): Promise<boolean>;
  back(): void;
  forward(): void;
  go(delta: number): void;
  isActive: LinkRouter['isActive'];
  preload: LinkRouter['preload'];
  destroy(): void;
};

const ORIGIN = 'http://owt.invalid';
const INDEX = '__owtIndex';
const MAX_REDIRECTS = 10;
const NO_MATCH: readonly MatchedRoute[] = [];
const START: Resolved = { path: '', search: '', hash: '', route: null, params: {} };

function isGroup(entry: AnyComponent | RouteGroup): entry is RouteGroup {
  return typeof entry !== 'function';
}

/** Flatten nested routes and sort them by specificity. */
function flatten(routes: RouteMap, base: string, layouts: readonly MatchedRoute[], out: FlatRoute[]): FlatRoute[] {
  for (const [key, entry] of Object.entries(routes)) {
    const pattern = joinPath(base, key);
    if (isGroup(entry)) {
      const layout = entry.layout === undefined ? [] : [view(pattern, entry.layout)];
      flatten(entry.children, pattern, [...layouts, ...layout], out);
    } else {
      out.push({ pattern: parsePattern(pattern), matched: [...layouts, view(pattern, entry)] });
    }
  }
  return out;
}

function view(pattern: string, component: AnyComponent): MatchedRoute {
  // `CheckRoutes` checked this component against the props of its pattern; the router
  // passes exactly those props (`ViewProps` is their untyped form)
  return { pattern, component: component as Component<ViewProps> };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return isRecord(value) && typeof value.then === 'function';
}

function readIndex(state: unknown): number | null {
  if (!isRecord(state)) return null;
  const index = state[INDEX];
  return typeof index === 'number' ? index : null;
}

function withIndex(state: unknown, index: number): Record<string, unknown> {
  return isRecord(state) ? { ...state, [INDEX]: index } : { [INDEX]: index };
}

function toParams(value: unknown): Params | undefined {
  if (!isRecord(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, v] of Object.entries(value)) if (typeof v === 'string') out[key] = v;
  return out;
}

function isQueryInit(value: unknown): value is QueryInit {
  return typeof value === 'string' || value instanceof URLSearchParams || isRecord(value);
}

function toOptions(value: unknown): NavigateOptions {
  if (!isRecord(value)) return {};
  const { query, hash, replace } = value;
  return {
    query: isQueryInit(query) ? query : undefined,
    hash: typeof hash === 'string' ? hash : undefined,
    replace: replace === true,
  };
}

function keyOf(address: Address): string {
  return `${address.path}${address.search}#${address.hash}`;
}

function toRoute(location: Resolved): AnyRoute {
  return {
    path: location.path,
    pattern: location.route === null ? null : location.route.pattern.source,
    params: location.params,
    query: new URLSearchParams(location.search),
    hash: location.hash,
  };
}

function hasPreload(value: object): value is { preload(): unknown } {
  return typeof Reflect.get(value, 'preload') === 'function';
}

/**
 * Create a router.
 *
 * ```ts
 * export const router = createRouter({
 *   routes: {
 *     '/': Home,
 *     '/users/:id': lazy(() => import('./User.owt'), 'User'),
 *     '/admin': { layout: AdminLayout, children: { '/': AdminHome, '/users': AdminUsers } },
 *     '*': NotFound,
 *   },
 * })
 * ```
 */
export function createRouter<const R extends RouteMap>(options: RouterOptions<R>): RouterInstance<R> {
  const router: LooseRouter = createLooseRouter(options);
  // the runtime handles any route map; `R` only narrows the types of patterns, params and routes
  return router as RouterInstance<R>;
}

function createLooseRouter(options: Options): LooseRouter {
  const hashMode = options.mode === 'hash';
  const base = hashMode ? '' : normalizeBase(options.base);
  const scroll = options.scroll ?? 'top';
  const routes = flatten(options.routes, '', [], []).sort((a, b) => compareRank(a.pattern, b.pattern));
  const byPattern = new Map<string, FlatRoute>();
  for (const route of routes) if (!byPattern.has(route.pattern.source)) byPattern.set(route.pattern.source, route);
  const parsed = new Map<string, Pattern>();
  const compile = (pattern: string): Pattern => {
    const known = byPattern.get(pattern)?.pattern ?? parsed.get(pattern);
    if (known !== undefined) return known;
    const created = parsePattern(pattern);
    parsed.set(pattern, created);
    return created;
  };

  // --- state ---------------------------------------------------------------
  // One signal per field, all written in one batch: readers only update when their field changed.
  // (Plain signals rather than computeds over one `current` signal: a computed reading another
  // computed does not always propagate updates in the current runtime.)
  let current: Resolved = START;
  const path = signal('');
  const hash = signal('');
  const pattern = signal<string | null>(null);
  const params = signal<Params>({}, { equals: sameParams });
  const query = signal(new URLSearchParams(), { equals: (a, b) => a.toString() === b.toString() });
  const matched = signal<readonly MatchedRoute[]>(NO_MATCH);
  const setCurrent = (next: Resolved) => {
    current = next;
    batch(() => {
      path.value = next.path;
      hash.value = next.hash;
      pattern.value = next.route === null ? null : next.route.pattern.source;
      params.value = next.params;
      query.value = new URLSearchParams(next.search);
      matched.value = next.route === null ? NO_MATCH : next.route.matched;
    });
  };
  const route: AnyRoute = {
    get path() {
      return path.value;
    },
    get pattern() {
      return pattern.value;
    },
    get params() {
      return params.value;
    },
    get query() {
      return query.value;
    },
    get hash() {
      return hash.value;
    },
  };

  // --- locations -------------------------------------------------------------
  /** Parse a URL relative to the current location (null for another origin). */
  const parse = (url: string): Address | null => {
    const u = new URL(url, `${ORIGIN}${current.path === '' ? '/' : current.path}${current.search}`);
    if (u.origin !== ORIGIN) return null;
    return { path: normalizePath(u.pathname), search: u.search, hash: decode(u.hash.slice(1)) };
  };

  const readLocation = (): Address | null => {
    if (hashMode) return parse(location.hash.slice(1) || '/');
    let pathname = location.pathname;
    if (base !== '' && (pathname === base || pathname.startsWith(`${base}/`))) pathname = pathname.slice(base.length) || '/';
    return parse(`${pathname}${location.search}${location.hash}`);
  };

  const toUrl = (address: Address): string => `${hashMode ? '#' : base}${address.path}${address.search}${toHash(address.hash)}`;

  const resolve = (address: Address): Resolved => {
    for (const route of routes) {
      const found = matchPattern(route.pattern, address.path);
      if (found !== null) return { ...address, route, params: found };
    }
    return { ...address, route: null, params: {} };
  };

  // --- history ---------------------------------------------------------------
  let index = readIndex(history.state) ?? 0;
  const positions = new Map<number, { x: number; y: number }>();
  let navigation = 0;
  let pendingKey: string | null = null;

  const saveScroll = () => {
    if (scroll === 'restore') positions.set(index, { x: window.scrollX, y: window.scrollY });
  };

  const scrollAfter = (target: Resolved, mode: Mode) => {
    if (scroll === false || mode === 'initial') return;
    const saved = mode === 'pop' && scroll === 'restore' ? positions.get(index) : undefined;
    if (saved !== undefined) {
      window.scrollTo(saved.x, saved.y);
      return;
    }
    const anchor = target.hash === '' ? null : document.getElementById(target.hash);
    if (anchor !== null) anchor.scrollIntoView();
    else window.scrollTo(0, 0);
  };

  const commit = (target: Resolved, mode: Mode) => {
    if (mode === 'push') {
      saveScroll();
      index++;
      history.pushState(withIndex(null, index), '', toUrl(target));
    } else if (mode === 'replace') {
      history.replaceState(withIndex(history.state, index), '', toUrl(target));
    }
    setCurrent(target);
    scrollAfter(target, mode);
  };

  const finish = (target: Resolved, mode: Mode, id: number): boolean | Promise<boolean> => {
    const apply = (): boolean => {
      if (id !== navigation) return false;
      pendingKey = null;
      commit(target, mode);
      return true;
    };
    if (options.viewTransitions === true && mode !== 'initial' && typeof document.startViewTransition === 'function') {
      let applied = false;
      const transition = document.startViewTransition(() => {
        applied = apply();
      });
      // `ready` rejects when the animation is skipped (e.g. by the next navigation): nothing to do
      transition.ready.catch(() => {});
      return transition.updateCallbackDone.then(() => applied);
    }
    return apply();
  };

  /** Back/forward cancelled by a guard: go back to where we were. */
  const revert = (pop: Pop) => {
    const delta = pop.from - index;
    index = pop.from;
    if (delta !== 0) history.go(delta);
  };

  const decide = (result: GuardResult, target: Resolved, mode: Mode, pop: Pop | null, id: number, redirects: number): boolean | Promise<boolean> => {
    if (id !== navigation) return false;
    if (result === false) {
      pendingKey = null;
      if (pop !== null) revert(pop);
      return false;
    }
    if (typeof result === 'string') {
      if (redirects >= MAX_REDIRECTS) throw new Error(`[owt/router] too many redirects (last: "${result}")`);
      const next = parse(result);
      if (next === null) {
        location.assign(result);
        return false;
      }
      return attempt(resolve(next), mode === 'push' ? 'push' : 'replace', pop, id, redirects + 1);
    }
    return finish(target, mode, id);
  };

  const attempt = (target: Resolved, mode: Mode, pop: Pop | null, id: number, redirects: number): boolean | Promise<boolean> => {
    pendingKey = keyOf(target);
    const guard = options.beforeEach;
    if (guard === undefined) return finish(target, mode, id);
    const result = untrack(() => guard.call(options, toRoute(target), toRoute(current)));
    if (isPromiseLike(result)) {
      return Promise.resolve(result).then((value) => decide(value, target, mode, pop, id, redirects));
    }
    return decide(result, target, mode, pop, id, redirects);
  };

  const run = (target: Resolved, mode: Mode, pop: Pop | null): Promise<boolean> => {
    const id = ++navigation;
    const fail = (err: unknown): never => {
      if (id === navigation) {
        pendingKey = null;
        if (pop !== null) revert(pop);
      }
      throw err;
    };
    try {
      return Promise.resolve(attempt(target, mode, pop, id, 0)).catch(fail);
    } catch (err) {
      return Promise.reject(err).catch(fail);
    }
  };

  const report = (promise: Promise<boolean>) => {
    promise.catch((err: unknown) => console.error(err));
  };

  const onLocationChange = () => {
    const now = readLocation();
    if (now === null) return;
    const key = keyOf(now);
    if (key === pendingKey || (pendingKey === null && key === keyOf(current))) return;
    const from = index;
    let next = readIndex(history.state);
    if (next === null) {
      // a new entry the router did not create (in-page anchor, edited URL)
      next = index + 1;
      history.replaceState(withIndex(history.state, next), '');
    }
    saveScroll();
    index = next;
    report(run(resolve(now), 'pop', { from }));
  };

  // --- navigation API --------------------------------------------------------
  /** Address of `navigate(to, params, options)` (null for another origin). */
  const locate = (to: string, params: Params | undefined, opts: NavigateOptions): Address | null => {
    const known = byPattern.get(to);
    const found = known === undefined ? parse(to) : { path: buildPath(known.pattern, params), search: '', hash: '' };
    if (found === null) return null;
    return {
      path: found.path,
      search: opts.query === undefined ? found.search : toSearch(opts.query),
      hash: opts.hash === undefined ? found.hash : decode(toHash(opts.hash).slice(1)),
    };
  };

  const go = (to: string, params: Params | undefined, opts: NavigateOptions): Promise<boolean> => {
    let next: Address | null;
    try {
      next = locate(to, params, opts);
    } catch (err) {
      return Promise.reject(err);
    }
    if (next === null) {
      location.assign(to);
      return Promise.resolve(true);
    }
    const same = keyOf(next) === keyOf(current);
    return run(resolve(next), opts.replace === true || same ? 'replace' : 'push', null);
  };

  const href = (to: string, params?: Params, opts?: { query?: QueryInit | undefined; hash?: string | undefined }): string => {
    const pattern = compile(to);
    return toUrl({ path: buildPath(pattern, params), search: toSearch(opts?.query), hash: decode(toHash(opts?.hash).slice(1)) });
  };

  const isActive = (to: string, given?: Params, opts?: { exact?: boolean | undefined }): boolean => {
    const exact = opts?.exact === true;
    const wanted = compile(to);
    const built = given === undefined && wanted.names.length > 0 ? null : buildSegments(wanted, given);
    if (built !== null) {
      const now = splitPath(path.value).map(decode);
      if (exact || built.length === 0) return now.length === built.length && built.every((s, i) => now[i] === s);
      return built.every((s, i) => now[i] === s);
    }
    const currentPattern = pattern.value;
    if (currentPattern === null) return false;
    // params not given: compare patterns (`/users/:id` is active on every user page)
    const now = splitPath(currentPattern);
    const parts = splitPath(to);
    if (exact && now.length !== parts.length) return false;
    if (!parts.every((s, i) => now[i] === s)) return false;
    const values = params.value;
    return Object.entries(given ?? {}).every(([key, value]) => value === undefined || values[key] === value);
  };

  const preload = (to: string): Promise<void> => {
    const found = byPattern.get(to);
    if (found === undefined) return Promise.resolve();
    const loads = found.matched.map(({ component }) => (hasPreload(component) ? component.preload() : undefined));
    return Promise.all(loads).then(() => undefined);
  };

  // --- start -----------------------------------------------------------------
  const restoration = history.scrollRestoration;
  if (scroll === 'restore') history.scrollRestoration = 'manual';
  if (readIndex(history.state) === null) history.replaceState(withIndex(history.state, index), '');
  window.addEventListener('popstate', onLocationChange);
  if (hashMode) window.addEventListener('hashchange', onLocationChange);

  const initial = readLocation();
  const ready = run(resolve(initial ?? { path: '/', search: '', hash: '' }), 'initial', null).then(
    () => undefined,
    (err: unknown) => console.error(err),
  );

  const linkRouter: LinkRouter = { href, isActive, preload, navigate: go };
  return {
    route,
    get matched() {
      return matched.value;
    },
    ready,
    Link: createLink(linkRouter),
    href,
    navigate(to, a, b) {
      const known = byPattern.get(to);
      if (known !== undefined && (known.pattern.names.length > 0 || b !== undefined)) return go(to, toParams(a), toOptions(b));
      return go(to, undefined, toOptions(a));
    },
    back: () => history.back(),
    forward: () => history.forward(),
    go: (delta) => history.go(delta),
    isActive,
    preload,
    destroy() {
      navigation++;
      window.removeEventListener('popstate', onLocationChange);
      window.removeEventListener('hashchange', onLocationChange);
      if (scroll === 'restore') history.scrollRestoration = restoration;
    },
  };
}
