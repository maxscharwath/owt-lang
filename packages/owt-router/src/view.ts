/**
 * `<Router {router} />`: renders the components of the current route, each
 * layout rendering the next level through its `children` snippet. A level is
 * re-mounted only when its component changes; when only the params or the
 * query change, the mounted component stays and its props update.
 */
import { signal, untrack } from 'owt';
import { dynamic } from 'owt/internal';
import { sameParams, type Params } from './path';
import type { RouterView, ViewProps } from './types';

export type RouterProps = {
  /** the router created by `createRouter` */
  router: RouterView;
};

function fragment(): { frag: DocumentFragment; anchor: Comment } {
  const frag = document.createDocumentFragment();
  frag.appendChild(document.createTextNode(''));
  const anchor = frag.appendChild(document.createComment(''));
  return { frag, anchor };
}

/** Render level `depth` of the matched routes before `anchor`. */
function level(router: RouterView, depth: number, anchor: Node): void {
  // the props of the mounted component: only updated by this level, after it decided whether to
  // keep the component, so a component about to be replaced never sees the params of the next route
  const params = signal<Params>({}, { equals: sameParams });
  const query = signal(new URLSearchParams(), { equals: (a, b) => a.toString() === b.toString() });
  const children = () => {
    const { frag, anchor: end } = fragment();
    level(router, depth + 1, end);
    return frag;
  };
  const props: ViewProps = {
    get params() {
      return params.value;
    },
    get query() {
      return query.value;
    },
    get children() {
      return router.matched.length > depth + 1 ? children : undefined;
    },
  };
  dynamic(
    anchor,
    () => {
      const component = router.matched[depth]?.component;
      const route = router.route;
      const nextParams = route.params;
      const nextQuery = route.query;
      untrack(() => {
        params.value = nextParams;
        query.value = nextQuery;
      });
      return component;
    },
    props,
  );
}

export function Router(props: RouterProps): Node {
  const router = untrack(() => props.router);
  const { frag, anchor } = fragment();
  level(router, 0, anchor);
  return frag;
}
