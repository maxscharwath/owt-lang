export type ComponentInstance = {
  mount(target: HTMLElement): void;
  update(): void;
  destroy(): void;
};

export type ComponentFn<P = any> = (props: P) => ComponentInstance;

export function mount<P>(Component: ComponentFn<P>, options: { props: P; target: HTMLElement }) {
  const instance = Component(options.props);
  instance.mount(options.target);
  return instance;
}

// Global helpers used by generated code
export function* range(a: number, b: number): Iterable<number> {
  const start = (a as any) | 0;
  const end = (b as any) | 0;
  if (start > end) return; // empty
  for (let i = start; i <= end; i++) yield i;
}

export function toArray<T>(x: Iterable<T> | ArrayLike<T> | null | undefined): T[] {
  if (!x) return [] as T[];
  return Array.isArray(x) ? (x as T[]).slice() : Array.from(x as Iterable<T>);
}

export function rev<T>(x: Iterable<T> | ArrayLike<T> | null | undefined): Iterable<T> {
  const a = toArray(x);
  a.reverse();
  return a;
}

export function iter<T>(x: Iterable<T> | ArrayLike<T> | null | undefined): Iterable<T> {
  return (x as any) ?? [];
}

// Development logging hooks
export type DevLogger = (event: string, payload?: any) => void;

let __devLogger: DevLogger | null = null;

export function setDevLogger(logger: DevLogger | null) {
  __devLogger = logger;
}

export function devLog(event: string, payload?: any) {
  if (!__devLogger) return;
  try {
    __devLogger(event, payload);
  } catch {
    // ignore logger errors in production/dev
  }
}
