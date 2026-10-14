import * as vscode from 'vscode';
import { activateTsVersionStatusItem, createLabsInfo, type LabsInfo } from '@volar/vscode';
import { createCompiledOutputPreview } from './compiled-output';
import { OWT_SELECTOR, OwtLanguageServer } from './language-server';
import { LivePreview, resolveOwtSource } from './preview';
import { ServerStatusBar } from './status-bar';

let server: OwtLanguageServer | undefined;

export function activate(context: vscode.ExtensionContext): LabsInfo {
  const output = vscode.window.createOutputChannel('OWT Language Server', { log: true });
  const labs = createLabsInfo();
  const owtServer = new OwtLanguageServer(context, output, labs);
  server = owtServer;

  const compiled = createCompiledOutputPreview();
  const virtual = new LivePreview({
    scheme: 'owt-virtual',
    extension: '.ts',
    languageId: 'typescript',
    debounceMs: 400,
    render: async (document) => {
      const code = await owtServer.virtualCode(document.uri);
      if (code === undefined) return '// The OWT language server is not running.\n';
      if (code === null) return '// The OWT language server has no virtual code for this document.\n';
      return code;
    },
  });
  const previews = [compiled, virtual];

  const withSource = (preview: LivePreview, what: string) => async (arg?: unknown) => {
    const source = resolveOwtSource(arg, previews);
    if (source === undefined) {
      void vscode.window.showInformationMessage(`OWT: open an .owt file to show its ${what}.`);
      return;
    }
    await preview.show(source);
  };

  context.subscriptions.push(
    output,
    owtServer,
    compiled,
    virtual,
    new ServerStatusBar(owtServer),
    activateTsVersionStatusItem(
      OWT_SELECTOR,
      'owt.selectTypeScriptVersion',
      context,
      (version) => `TypeScript ${version}`,
      () => void owtServer.restart(),
    ),
    vscode.commands.registerCommand('owt.restartServer', () => owtServer.restart()),
    vscode.commands.registerCommand('owt.startServer', () => owtServer.start()),
    vscode.commands.registerCommand('owt.stopServer', () => owtServer.stop()),
    vscode.commands.registerCommand('owt.showOutput', () => output.show(true)),
    vscode.commands.registerCommand('owt.openSettings', () =>
      vscode.commands.executeCommand('workbench.action.openSettings', '@ext:owt.owt-vscode'),
    ),
    vscode.commands.registerCommand('owt.showCompiledOutput', withSource(compiled, 'compiled output')),
    vscode.commands.registerCommand('owt.showVirtualCode', withSource(virtual, 'virtual TypeScript code')),
    owtServer.onDidChangeStatus((status) => {
      void vscode.commands.executeCommand('setContext', 'owt.serverRunning', status.state === 'running');
      if (status.state === 'running') virtual.refresh();
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('owt.server.path')) {
        output.info('owt.server.path changed');
        void owtServer.restart();
      }
      if (e.affectsConfiguration('owt.compiledOutput.dev')) compiled.refresh();
    }),
    vscode.workspace.onDidGrantWorkspaceTrust(() => void owtServer.restart()),
  );

  void owtServer.start();

  // Exposes the clients to the Volar Labs extension (virtual code explorer, performance tools).
  return labs.extensionExports;
}

export async function deactivate(): Promise<void> {
  await server?.stop();
  server = undefined;
}
