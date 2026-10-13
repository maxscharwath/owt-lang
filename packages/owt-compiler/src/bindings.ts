/** Bindings visible to code inside a component, and how reads / writes compile. */

export type BindingKind =
  /** `var` that is re-assigned: a Source. read `$.get(x)`, write `$.set(x, v)` */
  | 'state'
  /** `val` with reactive dependencies, prop with a default: a Computed. read `$.get(x)` */
  | 'derived'
  /** destructured prop: read through the props object (getter) */
  | 'prop'
  /** loop item / await value / caught error held in a Source */
  | 'signal'
  /** a member path on a reactive object (meta fields, slot args, destructured items) */
  | 'path'
  /** everything else: plain JavaScript */
  | 'plain';

export type Binding = {
  name: string;
  kind: BindingKind;
  /** generated expression for reads */
  read: string;
  /** variable holding the Source/Computed (state, derived, signal) */
  source?: string;
  /** props key for writes to props (`bind:` from the parent) */
  propKey?: string;
  /** how writes compile; false = read-only (compile error) */
  write: 'state' | 'prop' | 'plain' | false;
  /** reading it can create a reactive dependency */
  reactive: boolean;
  /** a function declaration / import / const function: safe to use directly as an event handler */
  stable: boolean;
  /** human description used in errors ("val", "loop item"...) */
  description: string;
  /** declaration offset */
  start: number;
};

export class BindingScope {
  private readonly map = new Map<string, Binding>();

  constructor(readonly parent: BindingScope | null = null) {}

  add(binding: Binding): Binding {
    this.map.set(binding.name, binding);
    return binding;
  }

  lookup(name: string): Binding | undefined {
    for (let s: BindingScope | null = this; s !== null; s = s.parent) {
      const b = s.map.get(name);
      if (b !== undefined) return b;
    }
    return undefined;
  }

  ownNames(): string[] {
    return [...this.map.keys()];
  }

  child(): BindingScope {
    return new BindingScope(this);
  }
}

export function plain(name: string, start: number, options: Partial<Pick<Binding, 'write' | 'stable' | 'description' | 'read'>> = {}): Binding {
  return {
    name,
    kind: 'plain',
    read: options.read ?? name,
    write: options.write ?? 'plain',
    reactive: false,
    stable: options.stable ?? false,
    description: options.description ?? 'variable',
    start,
  };
}
