/**
 * OWT reactive core.
 *
 * A push-pull signal graph:
 * - writes push a cheap "maybe stale" mark (CHECK/DIRTY) through the graph and schedule effects;
 * - reads pull: a computed validates its sources by version before recomputing.
 *
 * Dependency edges are doubly linked `Link` records shared by both ends, so
 * subscribing / unsubscribing is O(1) and re-tracking reuses links in place.
 * Computeds without subscribers are "unwatched": they keep their dependency
 * list but are not referenced by their sources (no leaks) and validate by
 * version polling when read.
 *
 * Effects form an ownership tree (scopes): disposing a scope disposes every
 * effect, computed cleanup and child scope created under it.
 */

export const CLEAN = 0;
export const CHECK = 1;
export const DIRTY = 2;
type State = typeof CLEAN | typeof CHECK | typeof DIRTY;

/** Increments on every signal write; lets unwatched computeds skip validation. */
let globalVersion = 0;
/** Unique stamp per reaction run, used to dedupe repeated reads. */
let runCounter = 0;

/** Reaction currently tracking reads (null = untracked). */
let activeSub: Reaction | null = null;
/** Owner receiving newly created effects, scopes and cleanups. */
let currentOwner: Owner | null = null;

export class Link {
  version = 0;
  prevSub: Link | null = null;
  nextSub: Link | null = null;
  constructor(
    public dep: Source,
    public sub: Reaction,
    public nextDep: Link | null,
  ) {}
}

/** Bivariant so `Source<number>` is usable where `Source<unknown>` is expected. */
export type Equals<T> = { bivariant(a: T, b: T): boolean }['bivariant'];

export const defaultEquals = <T>(a: T, b: T): boolean => a === b || (a !== a && b !== b);

/** Anything that can be depended upon. */
export class Source<T = unknown> {
  subs: Link | null = null;
  subsTail: Link | null = null;
  version = 0;
  /** stamp of the last reaction run that tracked this source */
  stamp = 0;
  equals: Equals<T> | false;
  constructor(public v: T, equals?: Equals<T> | false) {
    this.equals = equals ?? defaultEquals;
  }
  get value(): T {
    return get(this);
  }
  set value(v: T) {
    set(this, v);
  }
  peek(): T {
    return this.v;
  }
}

/** Anything that tracks dependencies. */
export interface Reaction {
  deps: Link | null;
  depsTail: Link | null;
  state: State;
  run: number;
}

export class Computed<T = unknown> extends Source<T> implements Reaction {
  deps: Link | null = null;
  depsTail: Link | null = null;
  state: State = DIRTY;
  run = 0;
  watched = false;
  /** globalVersion observed at the last validation */
  gv = -1;
  err: unknown = undefined;
  hasErr = false;
  constructor(public fn: (prev: T | undefined) => T, equals?: Equals<T> | false) {
    super(undefined as T, equals);
  }
  override get value(): T {
    return get(this);
  }
  override set value(_v: T) {
    throw new Error('[owt] cannot assign to a computed value');
  }
  override peek(): T {
    return untrack(() => get(this));
  }
}

/** Ownership node: holds child owners and cleanups, disposed as a tree. */
export class Owner {
  owner: Owner | null;
  first: Owner | null = null;
  last: Owner | null = null;
  prev: Owner | null = null;
  next: Owner | null = null;
  cleanups: (() => void)[] | null = null;
  ctx: Map<unknown, unknown> | null = null;
  onError: ((err: unknown) => void) | null = null;
  disposed = false;
  constructor(owner: Owner | null) {
    this.owner = owner;
    if (owner !== null) appendChild(owner, this);
  }
}

export const EFFECT_RENDER = 0;
export const EFFECT_USER = 1;

export class Effect extends Owner implements Reaction {
  deps: Link | null = null;
  depsTail: Link | null = null;
  state: State = DIRTY;
  run = 0;
  constructor(
    public fn: () => unknown,
    public kind: number,
    owner: Owner | null,
  ) {
    super(owner);
  }
}

// ---------------------------------------------------------------------------
// Owner tree
// ---------------------------------------------------------------------------

function appendChild(parent: Owner, child: Owner): void {
  child.prev = parent.last;
  if (parent.last !== null) parent.last.next = child;
  else parent.first = child;
  parent.last = child;
}

function detachChild(parent: Owner, child: Owner): void {
  if (child.prev !== null) child.prev.next = child.next;
  else parent.first = child.next;
  if (child.next !== null) child.next.prev = child.prev;
  else parent.last = child.prev;
  child.prev = child.next = null;
}

export function getOwner(): Owner | null {
  return currentOwner;
}

export function createScope(owner: Owner | null = currentOwner): Owner {
  return new Owner(owner);
}

export function runWithOwner<T>(owner: Owner | null, fn: () => T): T {
  const prevOwner = currentOwner;
  const prevSub = activeSub;
  currentOwner = owner;
  activeSub = null;
  try {
    return fn();
  } finally {
    currentOwner = prevOwner;
    activeSub = prevSub;
  }
}

/** Dispose an owner and everything it owns. */
export function dispose(owner: Owner): void {
  if (owner.disposed) return;
  if (owner.owner !== null && !owner.owner.disposed) detachChild(owner.owner, owner);
  disposeTree(owner);
}

function disposeTree(owner: Owner): void {
  owner.disposed = true;
  disposeChildren(owner);
  runCleanups(owner);
  if (owner instanceof Effect) {
    unlinkAllDeps(owner);
    owner.state = CLEAN;
  }
  owner.ctx = null;
}

function disposeChildren(owner: Owner): void {
  let child = owner.last;
  owner.first = owner.last = null;
  while (child !== null) {
    const prev = child.prev;
    child.prev = child.next = null;
    disposeTree(child);
    child = prev;
  }
}

function runCleanups(owner: Owner): void {
  const cleanups = owner.cleanups;
  if (cleanups === null) return;
  owner.cleanups = null;
  for (let i = cleanups.length - 1; i >= 0; i--) {
    try {
      cleanups[i]!();
    } catch (err) {
      reportError(owner, err);
    }
  }
}

/** Register a cleanup on the current owner (runs on dispose / before effect re-run). */
export function onCleanup(fn: () => void): void {
  const owner = currentOwner;
  if (owner === null) return;
  if (owner.cleanups === null) owner.cleanups = [fn];
  else owner.cleanups.push(fn);
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

let pendingError: { err: unknown } | null = null;

/** Route an error to the closest owner with an error boundary, or rethrow. */
export function reportError(owner: Owner | null, err: unknown): void {
  for (let o = owner; o !== null; o = o.owner) {
    if (o.onError !== null && !o.disposed) {
      o.onError(err);
      return;
    }
  }
  throw err;
}

function captureError(owner: Owner, err: unknown): void {
  try {
    reportError(owner, err);
  } catch (unhandled) {
    if (flushing) {
      if (pendingError === null) pendingError = { err: unhandled };
    } else {
      throw unhandled;
    }
  }
}

// ---------------------------------------------------------------------------
// Tracking
// ---------------------------------------------------------------------------

function isWatching(sub: Reaction): boolean {
  return !(sub instanceof Computed) || sub.watched;
}

function track(dep: Source): void {
  const sub = activeSub;
  if (sub === null || dep.stamp === sub.run) return;
  dep.stamp = sub.run;
  const prev = sub.depsTail;
  const next = prev === null ? sub.deps : prev.nextDep;
  if (next !== null && next.dep === dep) {
    next.version = dep.version;
    sub.depsTail = next;
    return;
  }
  const link = new Link(dep, sub, next);
  link.version = dep.version;
  if (prev === null) sub.deps = link;
  else prev.nextDep = link;
  sub.depsTail = link;
  if (isWatching(sub)) subscribe(link);
}

function subscribe(link: Link): void {
  const dep = link.dep;
  link.prevSub = dep.subsTail;
  link.nextSub = null;
  if (dep.subsTail !== null) dep.subsTail.nextSub = link;
  else dep.subs = link;
  dep.subsTail = link;
  if (dep instanceof Computed && !dep.watched) watch(dep);
}

function unsubscribe(link: Link): void {
  const dep = link.dep;
  if (link.prevSub !== null) link.prevSub.nextSub = link.nextSub;
  else dep.subs = link.nextSub;
  if (link.nextSub !== null) link.nextSub.prevSub = link.prevSub;
  else dep.subsTail = link.prevSub;
  link.prevSub = link.nextSub = null;
  if (dep.subs === null && dep instanceof Computed && dep.watched) unwatch(dep);
}

function watch(c: Computed): void {
  // An unwatched computed may be stale: bring it up to date (through its
  // version check) before it relies on notifications. A watched computed must
  // be CLEAN unless a notification marked it, because `mark` stops at nodes
  // that are already CHECK / DIRTY, assuming their subscribers were marked too.
  if (c.state !== DIRTY) updateComputed(c);
  c.watched = true;
  for (let l = c.deps; l !== null; l = l.nextDep) subscribe(l);
}

function unwatch(c: Computed): void {
  c.watched = false;
  for (let l = c.deps; l !== null; l = l.nextDep) unsubscribe(l);
  c.state = CHECK;
}

/** Drop the links that were not re-confirmed during the last run. */
function trimDeps(sub: Reaction): void {
  const tail = sub.depsTail;
  let l = tail === null ? sub.deps : tail.nextDep;
  if (l === null) return;
  if (tail === null) sub.deps = null;
  else tail.nextDep = null;
  const watching = isWatching(sub);
  while (l !== null) {
    const next: Link | null = l.nextDep;
    if (watching) unsubscribe(l);
    l = next;
  }
}

function unlinkAllDeps(sub: Reaction): void {
  sub.depsTail = null;
  trimDeps(sub);
}

// ---------------------------------------------------------------------------
// Reads / writes
// ---------------------------------------------------------------------------

export function get<T>(source: Source<T>): T {
  if (source instanceof Computed) {
    updateComputed(source);
    track(source);
    if (source.hasErr) throw source.err;
    return source.v;
  }
  track(source);
  return source.v;
}

export function set<T>(source: Source<T>, value: T): T {
  if (source.equals !== false && source.equals(source.v, value)) return value;
  source.v = value;
  notify(source);
  return value;
}

/** Signal a change without assigning (for in-place mutation of the held value). */
export function notify(source: Source): void {
  source.version++;
  globalVersion++;
  for (let l = source.subs; l !== null; l = l.nextSub) mark(l.sub, DIRTY);
}

function mark(node: Reaction, flag: State): void {
  const prev = node.state;
  if (prev >= flag) return;
  node.state = flag;
  if (node instanceof Computed) {
    for (let l = node.subs; l !== null; l = l.nextSub) mark(l.sub, CHECK);
  } else if (prev === CLEAN && node instanceof Effect) {
    enqueue(node);
  }
}

function depsChanged(sub: Reaction): boolean {
  for (let l = sub.deps; l !== null; l = l.nextDep) {
    const dep = l.dep;
    if (dep instanceof Computed) updateComputed(dep);
    if (l.version !== dep.version) return true;
  }
  return false;
}

function updateComputed(c: Computed): void {
  if (c.watched) {
    if (c.state === CLEAN) return;
  } else if (c.state !== DIRTY && c.gv === globalVersion) {
    return;
  }
  if (c.state === DIRTY || c.deps === null || depsChanged(c)) {
    recompute(c);
  } else {
    c.state = CLEAN;
  }
  c.gv = globalVersion;
}

function recompute<T>(c: Computed<T>): void {
  const prevSub = activeSub;
  const prevOwner = currentOwner;
  activeSub = c;
  currentOwner = null;
  c.run = ++runCounter;
  c.depsTail = null;
  c.state = CLEAN;
  let value: T | undefined;
  let threw = false;
  let err: unknown;
  try {
    value = c.fn(c.v);
  } catch (e) {
    threw = true;
    err = e;
  } finally {
    activeSub = prevSub;
    currentOwner = prevOwner;
    trimDeps(c);
  }
  if (threw) {
    c.hasErr = true;
    c.err = err;
    c.version++;
    return;
  }
  const hadErr = c.hasErr;
  c.hasErr = false;
  c.err = undefined;
  if (hadErr || c.version === 0 || c.equals === false || !c.equals(c.v, value as T)) {
    c.v = value as T;
    c.version++;
  }
}

export function untrack<T>(fn: () => T): T {
  if (activeSub === null) return fn();
  const prev = activeSub;
  activeSub = null;
  try {
    return fn();
  } finally {
    activeSub = prev;
  }
}

export function isTracking(): boolean {
  return activeSub !== null;
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

function runReaction(e: Effect): void {
  if (e.first !== null) disposeChildren(e);
  if (e.cleanups !== null) runCleanups(e);
  const prevSub = activeSub;
  const prevOwner = currentOwner;
  activeSub = e;
  currentOwner = e;
  e.run = ++runCounter;
  e.depsTail = null;
  e.state = CLEAN;
  try {
    const r = e.fn();
    if (typeof r === 'function') {
      if (e.cleanups === null) e.cleanups = [r as () => void];
      else e.cleanups.push(r as () => void);
    }
  } catch (err) {
    captureError(e, err);
  } finally {
    activeSub = prevSub;
    currentOwner = prevOwner;
    trimDeps(e);
  }
}

function updateEffect(e: Effect): void {
  if (e.disposed) return;
  if (e.state === CHECK && !depsChanged(e)) {
    e.state = CLEAN;
    return;
  }
  if (e.state !== CLEAN) runReaction(e);
}

/**
 * Render effect: runs synchronously now, re-runs (in the render phase of a
 * flush) when its dependencies change. Effects that read nothing reactive are
 * dropped right away.
 */
export function renderEffect(fn: () => unknown): Effect | null {
  const e = new Effect(fn, EFFECT_RENDER, currentOwner);
  runReaction(e);
  if (e.deps === null && e.first === null && e.cleanups === null) {
    if (e.owner !== null) detachChild(e.owner, e);
    e.owner = null;
    e.disposed = true;
    return null;
  }
  return e;
}

/** User effect: first runs after the current render work is committed. */
export function effect(fn: () => unknown): () => void {
  const e = new Effect(fn, EFFECT_USER, currentOwner);
  enqueue(e);
  return () => dispose(e);
}

/** Effect that runs immediately (synchronously) and on every change. */
export function effectSync(fn: () => unknown): () => void {
  const e = new Effect(fn, EFFECT_USER, currentOwner);
  runReaction(e);
  return () => dispose(e);
}

export function computed<T>(fn: (prev: T | undefined) => T, equals?: Equals<T> | false): Computed<T> {
  return new Computed(fn, equals);
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

let renderQueue: Effect[] = [];
let userQueue: Effect[] = [];
let scheduled = false;
let flushing = false;
let batchDepth = 0;
let tickPromise: Promise<void> | null = null;
let tickResolve: (() => void) | null = null;

function enqueue(e: Effect): void {
  if (e.kind === EFFECT_USER) userQueue.push(e);
  else renderQueue.push(e);
  if (!scheduled && !flushing && batchDepth === 0) scheduleFlush();
}

function scheduleFlush(): void {
  scheduled = true;
  queueMicrotask(flushSync);
}

/** Run an effect after making sure stale ancestor effects ran first (parents may dispose it). */
function runTop(e: Effect): void {
  if (e.state === CLEAN || e.disposed) return;
  let ancestors: Effect[] | null = null;
  for (let o = e.owner; o !== null; o = o.owner) {
    if (o instanceof Effect && o.state !== CLEAN) (ancestors ??= []).push(o);
  }
  if (ancestors !== null) {
    for (let i = ancestors.length - 1; i >= 0; i--) updateEffect(ancestors[i]!);
  }
  updateEffect(e);
}

/** Synchronously run every pending effect (render effects first, then user effects). */
export function flushSync(): void {
  if (flushing) return;
  flushing = true;
  let guard = 0;
  try {
    while (renderQueue.length > 0 || userQueue.length > 0) {
      if (++guard > 10000) {
        renderQueue = [];
        userQueue = [];
        throw new Error('[owt] maximum update depth exceeded: an effect keeps invalidating itself');
      }
      if (renderQueue.length > 0) {
        const q = renderQueue;
        renderQueue = [];
        for (let i = 0; i < q.length; i++) runTop(q[i]!);
      } else {
        const q = userQueue;
        userQueue = [];
        for (let i = 0; i < q.length; i++) runTop(q[i]!);
      }
    }
  } finally {
    flushing = false;
    scheduled = false;
  }
  if (tickResolve !== null) {
    const resolve = tickResolve;
    tickResolve = null;
    tickPromise = null;
    resolve();
  }
  if (pendingError !== null) {
    const { err } = pendingError;
    pendingError = null;
    throw err;
  }
}

/** Resolves after pending updates have been applied to the DOM. */
export function tick(): Promise<void> {
  if (!scheduled && !flushing && renderQueue.length === 0 && userQueue.length === 0) {
    return Promise.resolve();
  }
  if (tickPromise === null) {
    tickPromise = new Promise<void>((resolve) => {
      tickResolve = resolve;
    });
  }
  return tickPromise;
}

/** Group writes; effects run once, synchronously, when the outermost batch ends. */
export function batch<T>(fn: () => T): T {
  batchDepth++;
  try {
    return fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0 && !flushing && (renderQueue.length > 0 || userQueue.length > 0)) flushSync();
  }
}

// ---------------------------------------------------------------------------
// Roots, context
// ---------------------------------------------------------------------------

/** Create a detached reactive root. `fn` receives a dispose function. */
export function createRoot<T>(fn: (dispose: () => void) => T, owner: Owner | null = null): T {
  const root = new Owner(owner);
  return runWithOwner(root, () => fn(() => dispose(root)));
}

export type Context<T> = symbol & { readonly __type?: T };

export function createContext<T>(description = 'owt.context'): Context<T> {
  return Symbol(description) as Context<T>;
}

export function setContext<T>(key: Context<T> | string | symbol | object, value: T): T {
  const owner = currentOwner;
  if (owner === null) throw new Error('[owt] setContext must be called during component setup');
  (owner.ctx ??= new Map()).set(key, value);
  return value;
}

export function getContext<T>(key: Context<T> | string | symbol | object): T | undefined {
  for (let o = currentOwner; o !== null; o = o.owner) {
    if (o.ctx !== null && o.ctx.has(key)) return o.ctx.get(key) as T;
  }
  return undefined;
}

export function hasContext(key: unknown): boolean {
  for (let o = currentOwner; o !== null; o = o.owner) {
    if (o.ctx !== null && o.ctx.has(key)) return true;
  }
  return false;
}

/** Internal: swap the current owner without touching tracking (used by components). */
export function setCurrentOwner(owner: Owner | null): Owner | null {
  const prev = currentOwner;
  currentOwner = owner;
  return prev;
}

export function setActiveSub(sub: Reaction | null): Reaction | null {
  const prev = activeSub;
  activeSub = sub;
  return prev;
}
