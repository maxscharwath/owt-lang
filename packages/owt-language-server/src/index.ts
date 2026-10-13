/**
 * OWT language server. Speaks LSP over stdio / IPC, so it works with VS Code,
 * JetBrains IDEs (LSP API), Neovim, Zed, Helix, Sublime...
 *
 *   owt-language-server --stdio
 */
import { createConnection, createServer, createTypeScriptProject, loadTsdkByPath } from '@volar/language-server/node';
import { create as createTypeScriptServices } from 'volar-service-typescript';
import { create as createCssService } from 'volar-service-css';
import { createOwtLanguagePlugin, OwtVirtualCode } from '@owt/language-core';
import * as bundledTypeScript from 'typescript';
import { URI } from 'vscode-uri';
import { createOwtService } from './owt-service';

type InitOptions = { typescript?: { tsdk?: string } };

const connection = createConnection();
const server = createServer(connection);

connection.onInitialize((params) => {
  const options = (params.initializationOptions ?? {}) as InitOptions;
  let ts: typeof import('typescript') = bundledTypeScript;
  let messages: import('typescript').MapLike<string> | undefined;
  const tsdk = options.typescript?.tsdk;
  if (tsdk) {
    try {
      const loaded = loadTsdkByPath(tsdk, params.locale);
      // TypeScript 7 (native) has no JavaScript API: keep the bundled version then
      if (typeof loaded.typescript.createLanguageService === 'function') {
        ts = loaded.typescript;
        messages = loaded.diagnosticMessages;
      }
    } catch {
      connection.console.warn(`[owt] could not load TypeScript from ${tsdk}, using bundled ${bundledTypeScript.version}`);
    }
  }
  return server.initialize(
    params,
    createTypeScriptProject(ts, messages, () => ({ languagePlugins: [createOwtLanguagePlugin(ts)] })),
    [...createTypeScriptServices(ts), createCssService(), createOwtService()],
  );
});

connection.onInitialized(() => server.initialized());
connection.onShutdown(() => server.shutdown());

/** Debug helper used by editors ("OWT: Show Virtual TypeScript"). */
connection.onRequest('owt/virtualCode', async (params: { uri: string }) => {
  const uri = URI.parse(params.uri);
  const service = await server.project.getLanguageService(uri);
  const script = service.context.language.scripts.get(uri);
  const root = script?.generated?.root;
  if (!(root instanceof OwtVirtualCode)) return { code: '' };
  return { code: root.typescript.snapshot.getText(0, root.typescript.snapshot.getLength()) };
});

connection.listen();
