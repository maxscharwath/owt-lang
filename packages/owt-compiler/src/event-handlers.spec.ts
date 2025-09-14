import { describe, it, expect } from 'vitest';
import { generateEventHandler } from './codegen-utils';
import type { CompilerContext } from './context';

interface TestState {
  todos: string[];
  newTodoText: string;
  __subs?: Record<string, Array<() => void>>;
  __notify?: (changed: string[]) => void;
  props?: Record<string, unknown>;
}

interface InputEventLike { target: { value: string } }

function makeRtStub() {
  return {
    capPrev: (ctx: any, arr: string[]) => {
      const prev: Record<string, any> = Object.create(null);
      for (const k of arr) prev[k] = (ctx as any)[k];
      return prev;
    },
    writebackNotify: (ctx: any, prev: Record<string, any>, arr: string[]) => {
      const changed: string[] = [];
      for (const k of arr) if ((ctx as any)[k] !== prev[k]) changed.push(k);
      if (changed.length) (ctx as any).__notify?.(changed);
    },
  };
}

function runHandler(code: string, state: TestState, event: InputEventLike) {
  // Attach runtime fields directly on the same object so writebacks hit it
  (state as any).__subs = Object.create(null);
  (state as any).__notify = () => {};
  (state as any).props = {};
  // eslint-disable-next-line no-new-func
  const fn = new Function('_ctx','__rt','return ' + code)(state, makeRtStub());
  fn(event);
  return state;
}

describe('event handler writeback', () => {
  const context: CompilerContext = {
    idCounter: 0,
    varNames: ['todos', 'newTodoText'],
    valInits: Object.create(null),
    valDeps: Object.create(null),
    propsBindings: Object.create(null),
    slots: Object.create(null),
  };

  it('lambda updates state via writeback', () => {
    const handler = generateEventHandler({
      context,
      ctxVar: '_ctx',
      expression: '(e)=>{ newTodoText = e.target.value }',
      isLambdaExpression: true,
    });
    const state: TestState = { todos: [], newTodoText: '' };
    runHandler(handler, state, { target: { value: 'abc' } });
    expect(state.newTodoText).toBe('abc');
  });

  it('function name handler invoked and can mutate', () => {
    const handler = generateEventHandler({
      context,
      ctxVar: '_ctx',
      expression: 'onInput',
    });
    const state: TestState = { todos: [], newTodoText: '' };
    const onInput = (e: InputEventLike) => { state.newTodoText = e.target.value; };
    // Attach runtime fields and capture onInput in scope of created function
    state.__subs = Object.create(null);
    state.__notify = () => {};
    state.props = {};
    // eslint-disable-next-line no-new-func
    const fn = new Function('_ctx', '__rt', 'onInput', 'return ' + handler)(state, makeRtStub(), onInput);
    fn({ target: { value: 'xyz' } });
    expect(state.newTodoText).toBe('xyz');
  });
});

import type { Attribute, Expr, ShorthandAttribute } from '@owt/ast';
import {
  generateRegularEventHandler,
  generateShorthandEventHandler,
  generateEventListenerRegistration,
  isEventAttribute,
} from './event-handlers';

const ctxVar = '__ctx';
const context = { varNames: ['count'], valInits: {}, valDeps: {}, idCounter: 0 };

function makeExpr(code: string): Expr {
  return { type: 'Expr', code, loc: { start: { offset: 0, line: 1, column: 1 }, end: { offset: 0, line: 1, column: 1 } } } as Expr;
}

describe('event-handlers', () => {
  it('detects event attributes', () => {
    const info = isEventAttribute('onClick');

    expect(info.is).toBe(true);
    expect(info.event).toBe('click');
  });

  it('generates handler for assignment expression', () => {
    const attr: Attribute = { type: 'Attribute', name: 'onClick', value: makeExpr('count = count + 1'), loc: { start: { offset: 0, line: 1, column: 1 }, end: { offset: 0, line: 1, column: 1 } } };

    const handler = generateRegularEventHandler(attr, context, ctxVar);

    expect(handler).toContain('($event) =>');
    // Now routed via writebackNotify helper
    expect(handler).toContain('writebackNotify');
  });

  it('generates handler for lambda expression', () => {
    const attr: Attribute = { type: 'Attribute', name: 'onKeydown', value: makeExpr('(e) => e.key === "Enter" && addTodo()'), loc: { start: { offset: 0, line: 1, column: 1 }, end: { offset: 0, line: 1, column: 1 } } };

    const handler = generateRegularEventHandler(attr, context, ctxVar);

    expect(handler).toContain('($event) =>');
  });

  it('generates handler for function reference shorthand', () => {
    const sh: ShorthandAttribute = { type: 'ShorthandAttribute', name: 'onClick', loc: { start: { offset: 0, line: 1, column: 1 }, end: { offset: 0, line: 1, column: 1 } } };

    const handler = generateShorthandEventHandler(sh, context, ctxVar);
    // Unified generator should resolve function via __h indirection
    expect(handler).toContain('const __h = (onClick)');
    expect(handler).toContain("if (typeof __h === 'function') __h($event)");
  });

  it('wraps handler in event listener registration', () => {
    const listener = generateEventListenerRegistration('el', 'click', '($event)=>{}');

    expect(listener).toContain('.addEventListener(');
  });
});
