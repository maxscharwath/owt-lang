/**
 * `@owt/router`: a small, typed client-side router for OWT.
 *
 * ```ts
 * import { createRouter } from '@owt/router'
 *
 * export const router = createRouter({
 *   routes: { '/': Home, '/users/:id': User, '*': NotFound },
 * })
 * export const { Link } = router
 * ```
 *
 * ```owt
 * <Link to="/users/:id" params={{ id: '42' }}>Ada</Link>
 * <Router {router} />
 * ```
 */
export { createRouter } from './router';
export { Router, type RouterProps } from './view';
export type {
  ActiveOptions,
  AnyRoute,
  CheckRoutes,
  GuardResult,
  HrefArgs,
  HrefOptions,
  JoinPath,
  LayoutProps,
  LinkComponent,
  LinkPattern,
  LinkProps,
  MatchedRoute,
  NavigateArgs,
  NavigateOptions,
  NoMatch,
  ParamNames,
  Params,
  QueryInit,
  QueryValue,
  RawPath,
  RequiresParams,
  Route,
  RouteGroup,
  RouteLocation,
  RouteMap,
  RoutePattern,
  RouteProps,
  RouterInstance,
  RouterOptions,
  RouterView,
  ScrollBehavior,
  ViewProps,
} from './types';
