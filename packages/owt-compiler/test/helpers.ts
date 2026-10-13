import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile, type CompileOptions } from '../src/index';
import { mount, flushSync, type App } from 'owt';

const dir = join(import.meta.dirname, '.tmp');
let counter = 0;

type Module = Record<string, unknown>;

/** Compile `.owt` source, write it next to the tests and import it through Vite. */
export async function load(source: string, options: CompileOptions = {}): Promise<Module> {
  mkdirSync(dir, { recursive: true });
  const out = compile(source, { filename: 'Test.owt', css: 'injected', ...options });
  const file = join(dir, `m${process.pid}_${counter++}.js`);
  writeFileSync(file, out.js.code);
  const mod: Module = await import(/* @vite-ignore */ file);
  return mod;
}

export type Mounted = { root: HTMLElement; app: App; html(): string; click(selector: string): void; input(selector: string, value: string): void };

/** Compile and mount the component named `name` (default: App). */
export async function render(source: string, props: Record<string, unknown> = {}, name = 'App'): Promise<Mounted> {
  const mod = await load(source);
  const component = mod[name];
  if (typeof component !== 'function') throw new Error(`component ${name} not exported`);
  const root = document.createElement('div');
  document.body.appendChild(root);
  const app = mount(component as (p: Record<string, unknown>) => Node, { target: root, props });
  const el = (selector: string): HTMLElement => {
    const found = root.querySelector<HTMLElement>(selector);
    if (found === null) throw new Error(`no element ${selector} in ${root.innerHTML}`);
    return found;
  };
  return {
    root,
    app,
    html: () => root.innerHTML,
    click(selector) {
      el(selector).click();
      flushSync();
    },
    input(selector, value) {
      const input = el(selector) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      flushSync();
    },
  };
}

export const text = (m: Mounted, selector = '*') => m.root.querySelector(selector)?.textContent ?? '';
