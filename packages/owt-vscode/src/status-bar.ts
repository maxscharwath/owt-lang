import * as vscode from 'vscode';
import type { OwtLanguageServer, ServerStatus } from './language-server';

export const STATUS_MENU_COMMAND = 'owt.statusMenu';

/** Status bar item reflecting the language server state; visible while an `.owt` editor is active. */
export class ServerStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly server: OwtLanguageServer) {
    this.item = vscode.window.createStatusBarItem('owt.serverStatus', vscode.StatusBarAlignment.Right, 100);
    this.item.name = 'OWT Language Server';
    this.item.command = STATUS_MENU_COMMAND;
    this.disposables.push(
      this.item,
      server.onDidChangeStatus((status) => this.render(status)),
      vscode.window.onDidChangeActiveTextEditor(() => this.updateVisibility()),
      vscode.commands.registerCommand(STATUS_MENU_COMMAND, () => this.showMenu()),
    );
    this.render(server.currentStatus);
    this.updateVisibility();
  }

  private render(status: ServerStatus): void {
    const item = this.item;
    item.backgroundColor = undefined;
    const tooltip = new vscode.MarkdownString(undefined, true);
    tooltip.isTrusted = { enabledCommands: ['owt.restartServer', 'owt.startServer', 'owt.stopServer', 'owt.showOutput'] };
    switch (status.state) {
      case 'starting':
        item.text = '$(loading~spin) OWT';
        tooltip.appendMarkdown('**OWT language server** is starting…');
        break;
      case 'running':
        item.text = '$(check) OWT';
        tooltip.appendMarkdown('**OWT language server** is running\n\n');
        tooltip.appendMarkdown(`- Server: \`${status.server.path}\` (${status.server.source})\n`);
        tooltip.appendMarkdown(`- TypeScript: ${describeTypeScript(status)}\n\n`);
        tooltip.appendMarkdown('[Restart](command:owt.restartServer) · [Stop](command:owt.stopServer) · [Output](command:owt.showOutput)');
        break;
      case 'stopped':
        item.text = '$(circle-slash) OWT';
        tooltip.appendMarkdown('**OWT language server** is stopped\n\n[Start](command:owt.startServer) · [Output](command:owt.showOutput)');
        break;
      case 'failed':
        item.text = '$(error) OWT';
        item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        tooltip.appendMarkdown('**OWT language server** is not running\n\n');
        tooltip.appendText(status.message);
        tooltip.appendMarkdown('\n\n[Restart](command:owt.restartServer) · [Output](command:owt.showOutput)');
        break;
    }
    item.tooltip = tooltip;
  }

  private updateVisibility(): void {
    const editor = vscode.window.activeTextEditor;
    if (editor !== undefined && editor.document.languageId === 'owt') this.item.show();
    else this.item.hide();
  }

  private async showMenu(): Promise<void> {
    type Entry = vscode.QuickPickItem & { command: string };
    const state = this.server.currentStatus.state;
    const entries: Entry[] = [];
    if (state === 'running' || state === 'failed') entries.push({ label: '$(debug-restart) Restart Language Server', command: 'owt.restartServer' });
    if (state === 'running') entries.push({ label: '$(debug-stop) Stop Language Server', command: 'owt.stopServer' });
    if (state === 'stopped') entries.push({ label: '$(play) Start Language Server', command: 'owt.startServer' });
    entries.push(
      { label: '$(output) Show Language Server Output', command: 'owt.showOutput' },
      { label: '$(file-code) Show Compiled Output', command: 'owt.showCompiledOutput' },
      { label: '$(symbol-namespace) Show Virtual TypeScript Code', command: 'owt.showVirtualCode' },
      { label: '$(versions) Select TypeScript Version', command: 'owt.selectTypeScriptVersion' },
      { label: '$(gear) Open OWT Settings', command: 'owt.openSettings' },
    );
    const picked = await vscode.window.showQuickPick(entries, { placeHolder: 'OWT' });
    if (picked !== undefined) await vscode.commands.executeCommand(picked.command);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}

function describeTypeScript(status: Extract<ServerStatus, { state: 'running' }>): string {
  if (status.tsdk === undefined) return 'bundled with the language server';
  return `${status.tsdk.version ?? 'unknown version'} (${status.tsdk.isWorkspacePath ? 'workspace' : 'VS Code'})`;
}
