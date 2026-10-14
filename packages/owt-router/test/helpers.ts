import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { onTestFinished } from 'vitest';
import { mount, type App, type Snippet } from 'owt';
import { comment, render, slot } from 'owt/internal';
import { compile } from '@owt/compiler';
import { generate } from '@owt/language-core';
import { parse } from '@owt/parser';
import { Router, createRouter, type RouteMap, type RouterInstance, type RouterOptions, type RouterView } from '../src/index';

/** A router destroyed when the test ends (the URL is reset first). */
export function setup<const R extends RouteMap>(options: RouterOptions<R>, url = '/'): RouterInstance<R> {
  history.replaceState(null, '', url);
  const router = createRouter(options);
  onTestFinished(() => router.destroy());
  return router;
}

/** Mount `<Router {router} />` into a fresh element. */
export function view(router: RouterView): HTMLElement {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const app: App = mount(Router, { target: root, props: { router } });
  onTestFinished(() => {
    app.destroy();
    root.remove();
  });
  return root;
}

/** A route component showing its label and params: `<p>label id=42</p>`. */
export function page(label: string, onMount?: () => void) {
  return (props: { params: Readonly<Record<string, string | undefined>>; query?: URLSearchParams }): Node => {
    onMount?.();
    const p = document.createElement('p');
    render(() => {
      const params = Object.entries(props.params).map(([k, v]) => ` ${k}=${v ?? ''}`);
      p.textContent = `${label}${params.join('')}`;
    });
    return p;
  };
}

/** A layout rendering `<section class="label">children</section>`. */
export function layout(label: string) {
  return (props: { children: Snippet }): Node => {
    const section = document.createElement('section');
    section.className = label;
    slot(section.appendChild(comment()), () => props.children, {}, null);
    return section;
  };
}

/** `innerHTML` without the comment anchors of blocks. */
export function html(root: Element): string {
  return root.innerHTML.replaceAll('<!---->', '');
}

/**
 * Click an element; returns whether the page prevented the default action. The browser's own
 * navigation is always prevented afterwards (happy-dom would load the URL).
 */
export function click(el: Element, init: MouseEventInit = {}): boolean {
  let prevented = false;
  const after = (event: Event) => {
    prevented = event.defaultPrevented;
    event.preventDefault();
  };
  window.addEventListener('click', after);
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init }));
  window.removeEventListener('click', after);
  return prevented;
}

export const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const tmp = join(import.meta.dirname, '.tmp');
let counter = 0;

/** Compile `.owt` source, write it next to the tests and import it. */
export async function load(source: string): Promise<Record<string, unknown>> {
  mkdirSync(tmp, { recursive: true });
  const out = compile(source, { filename: 'Test.owt', css: 'injected' });
  const file = join(tmp, `m${process.pid}_${counter++}.js`);
  writeFileSync(file, out.js.code);
  const mod: Record<string, unknown> = await import(/* @vite-ignore */ file);
  return mod;
}

let previous: ts.Program | undefined;

/** Type-check files with the package's compiler options; `virtual` files exist only in memory. */
function check(rootNames: string[], virtual: ReadonlyMap<string, string>): string[] {
  const root = join(import.meta.dirname, '..');
  const config = ts.readConfigFile(join(root, 'tsconfig.json'), ts.sys.readFile);
  const { options } = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, version, onError, create) => {
    const code = virtual.get(name);
    return code === undefined ? getSourceFile(name, version, onError, create) : ts.createSourceFile(name, code, version);
  };
  const fileExists = host.fileExists.bind(host);
  host.fileExists = (name) => virtual.has(name) || fileExists(name);
  const program = ts.createProgram({ rootNames, options: { ...options, noEmit: true }, host, ...(previous === undefined ? {} : { oldProgram: previous }) });
  previous = program;
  return rootNames.flatMap((name) =>
    ts.getPreEmitDiagnostics(program, program.getSourceFile(name)).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')),
  );
}

/** Type-check `.owt` source the way the editor and `owt-tsc` do (its virtual TypeScript); returns the error messages. */
export function typecheck(source: string): string[] {
  const file = join(tmp, `Check${counter++}.owt.ts`);
  return check([file], new Map([[file, generate(parse(source)).code]]));
}

/** Type-check TypeScript files; returns the error messages. */
export function typecheckFiles(files: string[]): string[] {
  return check(files, new Map());
}
