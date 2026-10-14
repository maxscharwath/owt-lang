/**
 * Type-level part of the router: params extracted from patterns, the props
 * of route components, the patterns of a route map and the typed API.
 */
import type { Component, Snippet } from 'owt';
import type { AnchorAttributes } from 'owt/elements';

type Simplify<T> = { [K in keyof T]: T[K] } & {};

/** The segments of a pattern: `'/users/:id'` → `'' | 'users' | ':id'`. */
type Segments<P extends string> = P extends `${infer Head}/${infer Tail}` ? Head | Segments<Tail> : P;

type RequiredName<S extends string> = S extends `:${infer Name}`
  ? Name extends `${string}?`
    ? never
    : Name
  : S extends `*${infer Name}`
    ? Name extends ''
      ? never
      : Name
    : never;

type OptionalName<S extends string> = S extends `:${infer Name}?` ? Name : never;

/** Names of the params of a pattern (required and optional). */
export type ParamNames<P extends string> = RequiredName<Segments<P>> | OptionalName<Segments<P>>;

/**
 * Params of a pattern: `:name` is a `string`, `:name?` an optional `string`,
 * `*name` the rest of the path. A pattern without params gives
 * `Record<string, never>` (so unknown params are errors).
 *
 * ```ts
 * Params<'/users/:id/posts/:slug?'>   // { id: string; slug?: string }
 * Params<'/files/*path'>              // { path: string }
 * ```
 */
export type Params<P extends string> = string extends P
  ? Readonly<Record<string, string | undefined>>
  : [ParamNames<P>] extends [never]
    ? Record<string, never>
    : Simplify<{ [K in RequiredName<Segments<P>>]: string } & { [K in OptionalName<Segments<P>>]?: string }>;

/**
 * Whether `params` must be passed for a pattern (it has a required param). Distributes over
 * unions (`boolean` for a mix), so an invalid pattern is reported as such, not as missing params.
 */
export type RequiresParams<P extends string> = string extends P
  ? false
  : P extends string
    ? [RequiredName<Segments<P>>] extends [never]
      ? false
      : true
    : never;

/** Props of a route component. */
export type RouteProps<P extends string = string> = {
  params: Params<P>;
  query: URLSearchParams;
};

/**
 * Props of a layout: the route props plus the nested route as `children`. The snippet ignores
 * its arguments, so it accepts any (layouts may declare `children: Snippet`, or only use `<slot />`).
 */
export type LayoutProps<P extends string = string> = RouteProps<P> & { children: Snippet<{ [key: string]: unknown }> };

/**
 * Any component. Its props are checked per pattern by `CheckRoutes`; a call
 * signature here would make `lazy()` infer its props from it (as `never`).
 */
export type AnyComponent = Function;

/** Nested routes, rendered inside an optional layout. */
export type RouteGroup = {
  readonly layout?: AnyComponent;
  readonly children: RouteMap;
};

/** `pattern → component` or `pattern → { layout?, children }`. */
export type RouteMap = { readonly [pattern: string]: AnyComponent | RouteGroup };

/** Pattern of a nested route: `JoinPath<'/admin', '/users'>` is `'/admin/users'`. */
export type JoinPath<Base extends string, P extends string> = Base extends ''
  ? P extends ''
    ? '/'
    : P
  : Base extends '/'
    ? P extends '' | '/'
      ? '/'
      : P extends `/${string}`
        ? P
        : `/${P}`
    : P extends '' | '/'
      ? Base
      : P extends `/${string}`
        ? `${Base}${P}`
        : `${Base}/${P}`;

/** Every route pattern of a route map, nested patterns joined (`'/admin/users'`). */
export type RoutePattern<R, Base extends string = ''> = Flatten<
  {
    [K in keyof R & string]: R[K] extends { readonly children: infer C } ? RoutePattern<C, JoinPath<Base, K>> : JoinPath<Base, K>;
  }[keyof R & string]
>;

/** Evaluates nested unions (so messages list the patterns rather than `RoutePattern<...>`). */
type Flatten<T> = T extends string ? T : never;

/** Patterns that can be linked to: every pattern except catch-alls without a name (`'*'`). */
export type LinkPattern<R> = RoutePattern<R> extends infer P
  ? P extends string
    ? string extends P
      ? P
      : '*' extends Segments<P>
        ? never
        : P
    : never
  : never;

/** Patterns that have params (a raw path can't be one of them). */
type ParamPattern<R> = LinkPattern<R> extends infer P ? (P extends string ? ([ParamNames<P>] extends [never] ? never : P) : never) : never;

/** A raw path for `navigate(path)`: any string, except a pattern that has params. */
export type RawPath<S extends string, R> = S extends ParamPattern<R> ? never : S;

/**
 * Validates a route map: each component must accept the props of its pattern
 * (`RouteProps<pattern>`, `LayoutProps<pattern>` for layouts).
 */
export type CheckRoutes<R, Base extends string = ''> = {
  readonly [K in keyof R]: K extends string
    ? R[K] extends { readonly children: infer C }
      ? { readonly layout?: Component<LayoutProps<JoinPath<Base, K>>>; readonly children: CheckRoutes<C, JoinPath<Base, K>> }
      : Component<RouteProps<JoinPath<Base, K>>>
    : never;
};

/** A route location (`to` / `from` of guards, `router.route`). */
export type RouteLocation<P extends string = string> = {
  /** path without the base (and without the trailing slash) */
  readonly path: string;
  readonly pattern: P;
  readonly params: Params<P>;
  readonly query: URLSearchParams;
  /** fragment without `#` */
  readonly hash: string;
};

/** Location of a path that no route matches. */
export type NoMatch = {
  readonly path: string;
  readonly pattern: null;
  readonly params: Record<string, never>;
  readonly query: URLSearchParams;
  readonly hash: string;
};

/** A location with untyped params (what the runtime works with). */
export type AnyRoute = {
  readonly path: string;
  readonly pattern: string | null;
  readonly params: Readonly<Record<string, string | undefined>>;
  readonly query: URLSearchParams;
  readonly hash: string;
};

/** The current route: a union discriminated by `pattern` (check it to narrow `params`). */
export type Route<R> = string extends RoutePattern<R>
  ? AnyRoute
  : (RoutePattern<R> extends infer P ? (P extends string ? RouteLocation<P> : never) : never) | NoMatch;

/** A value of a query param; `null`, `undefined` and `false` leave it out. Arrays repeat the key. */
export type QueryValue = string | number | boolean | null | undefined;

/** Query: an object, a `URLSearchParams` or a string. */
export type QueryInit = URLSearchParams | string | Readonly<Record<string, QueryValue | readonly QueryValue[]>>;

export type HrefOptions = {
  query?: QueryInit | undefined;
  /** fragment, with or without `#` */
  hash?: string | undefined;
};

export type NavigateOptions = HrefOptions & {
  /** replace the current history entry instead of pushing one */
  replace?: boolean | undefined;
};

export type ActiveOptions = {
  /** the whole path must match (default: the link's path is a prefix of the current one) */
  exact?: boolean | undefined;
};

/** `[params, options?]`, params optional when the pattern has no required param. */
type ParamsArgs<P extends string, O> = RequiresParams<P> extends true ? [params: Params<NoInfer<P>>, options?: O] : [params?: Params<NoInfer<P>>, options?: O];

export type HrefArgs<P extends string> = ParamsArgs<P, HrefOptions>;
export type NavigateArgs<P extends string> = ParamsArgs<P, NavigateOptions>;

/** Result of a guard: nothing / `true` to continue, `false` to cancel, a path to redirect. */
export type GuardResult = void | undefined | boolean | string;

export type ScrollBehavior = 'top' | 'restore' | false;

export type RouterOptions<R extends RouteMap> = {
  routes: R & CheckRoutes<R>;
  /** `'history'` (default): real paths; `'hash'`: the path lives in `location.hash` (`/#/users/42`) */
  mode?: 'history' | 'hash' | undefined;
  /** base path of the app in history mode (`'/app'`) */
  base?: string | undefined;
  /** scroll after navigations: `'top'` (default), `'restore'` (back/forward restore positions) or `false` */
  scroll?: ScrollBehavior | undefined;
  /** wrap navigations in `document.startViewTransition` when the browser supports it */
  viewTransitions?: boolean | undefined;
  /** runs before every navigation (also the first one); may be async */
  beforeEach?(to: Route<R>, from: Route<R>): GuardResult | Promise<GuardResult>;
};

/** Props of `<Link>`. */
export type LinkProps<R, P extends LinkPattern<R>> = Omit<AnchorAttributes, 'href'> &
  (RequiresParams<P> extends true ? { params: Params<NoInfer<P>> } : { params?: Params<NoInfer<P>> | undefined }) & {
    /** pattern of the target route */
    to: P;
    query?: QueryInit | undefined;
    hash?: string | undefined;
    /** replace the current history entry */
    replace?: boolean | undefined;
    /** class added while the link is active */
    activeClass?: string | undefined;
    /** active only when the whole path matches (links to `/` are always exact) */
    exact?: boolean | undefined;
    /** load the target's lazy components early: on hover / focus, or once the link is visible */
    preload?: 'hover' | 'viewport' | false | undefined;
    children?: Snippet | undefined;
  };

/** `<Link>` typed against a route map: `to` must be a pattern, `params` must match it. */
export type LinkComponent<R> = <P extends LinkPattern<R>>(props: LinkProps<R, P>) => Node;

/** A component rendered for the current route, outermost layout first. */
export type MatchedRoute = {
  /** pattern of the route (of the group for a layout) */
  readonly pattern: string;
  readonly component: Component<ViewProps>;
};

/** What the router passes to route components and layouts. */
export type ViewProps = {
  readonly params: Readonly<Record<string, string | undefined>>;
  readonly query: URLSearchParams;
  readonly children?: Snippet | undefined;
};

/** What `<Router>` needs from a router. */
export type RouterView = {
  readonly route: AnyRoute;
  readonly matched: readonly MatchedRoute[];
};

/** A router created by `createRouter`, typed by its route map. */
export interface RouterInstance<R extends RouteMap = RouteMap> {
  /** the current route (reactive: read it in markup, `val`, effects...) */
  readonly route: Route<R>;
  /** components rendered for the current route, outermost layout first (reactive) */
  readonly matched: readonly MatchedRoute[];
  /** resolves once the first navigation (and its guard) is done */
  readonly ready: Promise<void>;
  /** `<router.Link to="/users/:id" params={{ id }}>`: an `<a>` that navigates without reloading */
  readonly Link: LinkComponent<R>;
  /** URL of a route: `href('/users/:id', { id: '42' })` → `'/users/42'` (with the base, or `#/users/42` in hash mode) */
  href<P extends LinkPattern<R>>(pattern: P, ...args: HrefArgs<P>): string;
  /** go to a route; resolves to `false` when a guard cancelled it or a newer navigation replaced it */
  navigate<P extends LinkPattern<R>>(pattern: P, ...args: NavigateArgs<P>): Promise<boolean>;
  /** go to a path (`'/users/42?tab=posts'`, relative paths resolve against the current one) */
  navigate<S extends string>(path: RawPath<S, R>, options?: NavigateOptions): Promise<boolean>;
  back(): void;
  forward(): void;
  go(delta: number): void;
  /** whether the current route is (inside) this route; reactive */
  isActive<P extends LinkPattern<R>>(pattern: P, params?: Partial<Params<NoInfer<P>>>, options?: ActiveOptions): boolean;
  /** start loading the lazy components of a route (`lazy()` components have `preload()`) */
  preload(pattern: LinkPattern<R>): Promise<void>;
  /** remove the history listeners */
  destroy(): void;
}
