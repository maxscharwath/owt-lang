import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { URI } from 'vscode-uri';
import { startLanguageServer, type LanguageServerHandle } from '@volar/test-utils';

const fixture = resolve(import.meta.dirname, 'fixture');
const serverModule = resolve(import.meta.dirname, '../dist/index.js');
const uri = (file: string) => URI.file(resolve(fixture, file)).toString();

let server: LanguageServerHandle;

beforeAll(async () => {
  server = startLanguageServer(serverModule, fixture);
  await server.initialize(URI.file(fixture).toString(), {});
  await server.openTextDocument(resolve(fixture, 'src/App.owt'), 'owt');
  await server.openTextDocument(resolve(fixture, 'src/Errors.owt'), 'owt');
  await server.openTextDocument(resolve(fixture, 'src/Patterns.owt'), 'owt');
  await server.openTextDocument(resolve(fixture, 'src/Modifiers.owt'), 'owt');
  await server.openTextDocument(resolve(fixture, 'src/Bindings.owt'), 'owt');
}, 60000);

afterAll(async () => {
  await server.shutdown();
});

async function messages(file: string): Promise<string[]> {
  const report = await server.sendDocumentDiagnosticRequest(uri(file));
  return 'items' in report ? report.items.map((d) => d.message) : [];
}

describe('language server', () => {
  it('reports no errors for a valid component', async () => {
    expect(await messages('src/App.owt')).toEqual([]);
  }, 30000);

  it('reports type errors in component props', async () => {
    const errors = await messages('src/Errors.owt');

    expect(errors.some((m) => m.includes("Type 'number' is not assignable to type 'string'"))).toBe(true);
  }, 30000);

  it('reports assignments to val', async () => {
    const errors = await messages('src/Errors.owt');

    expect(errors.some((m) => m.includes("Cannot assign to 'fixed'"))).toBe(true);
  }, 30000);

  it('reports markup errors from the OWT parser', async () => {
    const errors = await messages('src/Errors.owt');

    expect(errors).toContain('Missing closing tag </span>');
  }, 30000);

  it('reports match blocks that miss a case', async () => {
    const errors = await messages('src/Patterns.owt');

    expect(errors.some((m) => m.includes(`'{ kind: "square"; size: number; }' is not assignable to parameter of type 'never'`))).toBe(true);
  }, 30000);

  it('reports state that starts undefined but whose type does not allow it', async () => {
    const errors = await messages('src/Patterns.owt');

    expect(errors).toContain("Type 'undefined' is not assignable to type 'HTMLElement'.");
  }, 30000);

  it('narrows pattern bindings and if (val ...) bindings', async () => {
    const errors = await messages('src/Patterns.owt');

    expect(errors).toHaveLength(2);
  }, 30000);

  it('types two-way bindings with the value the element writes', async () => {
    const errors = await messages('src/Bindings.owt');

    expect(errors).toEqual(["Type 'number | null' is not assignable to type 'number'.\n  Type 'null' is not assignable to type 'number'."]);
  }, 30000);

  it('completes event modifiers after |', async () => {
    const list = await server.sendCompletionRequest(uri('src/Modifiers.owt'), { line: 1, character: 24 });
    const labels = list?.items.map((i) => i.label) ?? [];

    expect(labels).toContain('enter');
    expect(labels).toContain('preventDefault');
    expect(labels).not.toContain('ctrl');
  }, 30000);

  it('completes object members inside expressions', async () => {
    const list = await server.sendCompletionRequest(uri('src/App.owt'), { line: 8, character: 23 });

    expect(list?.items.map((i) => i.label)).toContain('age');
  }, 30000);

  it('shows the inferred type of a val on hover', async () => {
    const hover = await server.sendHoverRequest(uri('src/App.owt'), { line: 4, character: 7 });

    expect(JSON.stringify(hover?.contents)).toContain('doubled: number');
  }, 30000);

  it('goes to the definition of a component', async () => {
    const defs = await server.sendDefinitionRequest(uri('src/App.owt'), { line: 7, character: 6 });

    expect(JSON.stringify(defs)).toContain('Button.owt');
  }, 30000);

  it('lists components and state as document symbols', async () => {
    const symbols = await server.sendDocumentSymbolRequest(uri('src/App.owt'));

    expect(JSON.stringify(symbols)).toContain('"name":"doubled"');
  }, 30000);
});
