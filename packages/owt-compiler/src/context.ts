/** State shared while compiling one `.owt` file. */
import type * as t from '@babel/types';
import type { Chunk, Mapped } from './chunks';
import { BindingScope } from './bindings';
import type { Reporter } from './errors';
import { transformExpression, type JsContext } from './js';

export type CompileTarget = {
  /** runtime namespace alias */
  rt: string;
  dev: boolean;
};

export class FileContext {
  /** hoisted template declarations */
  readonly templates: Chunk[] = [];
  /** delegated event types used by this file */
  readonly delegated = new Set<string>();
  private readonly taken: Set<string>;
  private counter = 0;

  constructor(
    readonly source: string,
    readonly filename: string,
    readonly reporter: Reporter,
    readonly rt: string,
    readonly dev: boolean,
    takenNames: Iterable<string>,
  ) {
    this.taken = new Set(takenNames);
  }

  /** A fresh identifier that does not clash with user code. */
  name(hint: string): string {
    const base = hint.startsWith('$') ? hint : `$${hint}`;
    for (;;) {
      const candidate = `${base}${++this.counter}`;
      if (!this.taken.has(candidate)) {
        this.taken.add(candidate);
        return candidate;
      }
    }
  }

  /** Reserve a name exactly (used for props/runtime aliases). */
  reserve(name: string): string {
    if (!this.taken.has(name)) {
      this.taken.add(name);
      return name;
    }
    return this.name(name);
  }
}

/** Per-component compilation state. */
export class ComponentContext {
  constructor(
    readonly file: FileContext,
    readonly name: string,
    /** props object variable */
    readonly props: string,
    /** scope class for scoped CSS (null when the component has no scoped styles) */
    readonly cssScope: string | null,
  ) {}

  get rt(): string {
    return this.file.rt;
  }

  js(scope: BindingScope): JsContext {
    return {
      source: this.file.source,
      rt: this.file.rt,
      props: this.props,
      scope,
      reporter: this.file.reporter,
      name: (hint) => this.file.name(hint),
      inComponent: true,
    };
  }

  expr(node: t.Node, scope: BindingScope, locals: readonly string[] = []): Mapped {
    return transformExpression(node, this.js(scope), locals);
  }

  error(code: string, message: string, start: number, end?: number): never {
    return this.file.reporter.error(code, message, start, end);
  }

  warn(code: string, message: string, start: number, end?: number): void {
    this.file.reporter.warn(code, message, start, end);
  }
}

export { BindingScope };
