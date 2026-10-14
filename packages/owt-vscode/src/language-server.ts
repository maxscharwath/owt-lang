import * as vscode from 'vscode';
import {
  activateAutoInsertion,
  activateDocumentDropEdit,
  activateFindFileReferences,
  activateReloadProjects,
  createLabsInfo,
  middleware,
} from '@volar/vscode';
import {
  LanguageClient,
  State,
  TransportKind,
  type LanguageClientOptions,
  type ServerOptions,
} from 'vscode-languageclient/node';
import { VirtualCodeRequest } from './protocol';
import { SetupError, resolveServerModule, resolveTsdk, type ServerModule, type Tsdk } from './server-paths';

export const OWT_SELECTOR: vscode.DocumentSelector = [{ language: 'owt' }];

export type ServerStatus =
  | { state: 'stopped' }
  | { state: 'starting' }
  | { state: 'running'; server: ServerModule; tsdk: Tsdk | undefined }
  | { state: 'failed'; message: string };

type LabsInfo = ReturnType<typeof createLabsInfo>;

/**
 * Owns the `@owt/language-server` client: start / stop / restart, server
 * resolution, TypeScript SDK selection and the Volar editor features that are
 * bound to a client instance.
 */
export class OwtLanguageServer implements vscode.Disposable {
  private client: LanguageClient | undefined;
  private clientFeatures: vscode.Disposable[] = [];
  private status: ServerStatus = { state: 'stopped' };
  private queue: Promise<void> = Promise.resolve();
  private readonly statusEmitter = new vscode.EventEmitter<ServerStatus>();
  private readonly traceChannel: vscode.OutputChannel;

  readonly onDidChangeStatus = this.statusEmitter.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    readonly outputChannel: vscode.LogOutputChannel,
    private readonly labs: LabsInfo,
  ) {
    this.traceChannel = vscode.window.createOutputChannel('OWT Language Server Trace');
    context.subscriptions.push(this.traceChannel, this.statusEmitter);
  }

  get currentStatus(): ServerStatus {
    return this.status;
  }

  start(): Promise<void> {
    return this.enqueue(() => this.doStart());
  }

  stop(): Promise<void> {
    return this.enqueue(() => this.doStop());
  }

  restart(): Promise<void> {
    return this.enqueue(async () => {
      this.outputChannel.info('Restarting the OWT language server');
      await this.doStop();
      await this.doStart();
    });
  }

  /** Sends `owt/virtualCode` for `uri`: undefined when the server is not running, null without virtual code. */
  async virtualCode(uri: vscode.Uri): Promise<string | null | undefined> {
    const client = this.client;
    if (client === undefined || client.state !== State.Running) return undefined;
    const result = await client.sendRequest(VirtualCodeRequest, { uri: client.code2ProtocolConverter.asUri(uri) });
    return result === null || result.code === '' ? null : result.code;
  }

  /** Serializes lifecycle operations so overlapping commands cannot race. */
  private enqueue(op: () => Promise<void>): Promise<void> {
    const next = this.queue.then(op, op);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private setStatus(status: ServerStatus): void {
    this.status = status;
    this.statusEmitter.fire(status);
  }

  private async doStart(): Promise<void> {
    if (this.client !== undefined) return;
    this.setStatus({ state: 'starting' });

    let server: ServerModule;
    let tsdk: Tsdk | undefined;
    try {
      server = resolveServerModule(this.context);
      tsdk = await resolveTsdk(this.context);
    } catch (err) {
      this.fail(err);
      return;
    }

    this.outputChannel.info(`Server: ${server.path} (${server.source})`);
    if (tsdk === undefined) this.outputChannel.warn('No TypeScript found for typescript.tsdk: the server uses the TypeScript it bundles');
    else this.outputChannel.info(`TypeScript: ${tsdk.tsdk}${tsdk.version ? ` (${tsdk.version})` : ''}`);

    const serverOptions: ServerOptions = {
      run: { module: server.path, transport: TransportKind.ipc },
      debug: {
        module: server.path,
        transport: TransportKind.ipc,
        options: { execArgv: ['--nolazy', '--inspect=6009'] },
      },
    };
    const clientOptions: LanguageClientOptions = {
      documentSelector: [{ language: 'owt' }],
      initializationOptions: {
        typescript: tsdk === undefined ? {} : { tsdk: tsdk.tsdk },
      },
      outputChannel: this.outputChannel,
      traceOutputChannel: this.traceChannel,
      middleware,
      markdown: { isTrusted: true, supportHtml: true },
    };

    // The id `owt` makes vscode-languageclient read the `owt.trace.server` setting.
    const client = new LanguageClient('owt', 'OWT Language Server', serverOptions, clientOptions);
    this.client = client;
    // Also tracks the automatic restarts vscode-languageclient performs after a crash.
    client.onDidChangeState((e) => {
      if (this.client !== client) return;
      if (e.newState === State.Running) this.setStatus({ state: 'running', server, tsdk });
      else if (e.newState === State.Starting) this.setStatus({ state: 'starting' });
      else if (this.status.state !== 'failed') {
        this.setStatus({ state: 'failed', message: 'The language server stopped unexpectedly. See the output for details.' });
      }
    });

    try {
      await client.start();
    } catch (err) {
      this.client = undefined;
      await client.dispose().catch(() => undefined);
      this.fail(err);
      return;
    }

    this.clientFeatures = [
      activateAutoInsertion(OWT_SELECTOR, client),
      activateDocumentDropEdit(OWT_SELECTOR, client),
      activateFindFileReferences('owt.findFileReferences', client),
      activateReloadProjects('owt.reloadProjects', client),
    ];
    this.labs.addLanguageClient(client);
    this.setStatus({ state: 'running', server, tsdk });
  }

  private async doStop(): Promise<void> {
    const client = this.client;
    this.client = undefined;
    for (const d of this.clientFeatures) d.dispose();
    this.clientFeatures = [];
    if (client !== undefined) {
      const clients = this.labs.extensionExports.volarLabs.languageClients;
      const index = clients.indexOf(client);
      if (index >= 0) clients.splice(index, 1);
      try {
        if (client.needsStop()) await client.stop(2000);
      } catch (err) {
        this.outputChannel.warn(`Stopping the language server failed: ${String(err)}`);
      }
      await client.dispose().catch(() => undefined);
    }
    this.setStatus({ state: 'stopped' });
  }

  private fail(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    this.outputChannel.error(message);
    this.setStatus({ state: 'failed', message });
    const action = err instanceof SetupError ? err.action : undefined;
    const items = action === undefined ? ['Show Output'] : [action.title, 'Show Output'];
    void vscode.window.showErrorMessage(`OWT: ${message}`, ...items).then((choice) => {
      if (choice === 'Show Output') this.outputChannel.show(true);
      else if (choice !== undefined && action !== undefined) {
        void vscode.commands.executeCommand(action.command, ...(action.args ?? []));
      }
    });
  }

  async dispose(): Promise<void> {
    await this.stop();
  }
}
