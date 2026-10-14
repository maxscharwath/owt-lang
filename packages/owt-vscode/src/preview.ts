import * as vscode from 'vscode';

export type PreviewRenderer = (source: vscode.TextDocument, token: vscode.CancellationToken) => Promise<string> | string;

export type PreviewOptions = {
  /** URI scheme of the read-only preview documents, e.g. `owt-compiled`. */
  scheme: string;
  /** Extension appended to the source path so VS Code picks the right language, e.g. `.js`. */
  extension: string;
  /** Language mode of the preview documents. */
  languageId: string;
  /** Produces the preview text for a source document. */
  render: PreviewRenderer;
  /** Delay before re-rendering after the source changed. */
  debounceMs?: number;
};

/**
 * Read-only virtual documents derived from an `.owt` source document that
 * refresh while the source is edited (unsaved changes included).
 *
 * Preview URIs look like `<scheme>:/path/to/App.owt.js?<encoded source URI>`.
 */
export class LivePreview implements vscode.TextDocumentContentProvider, vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<vscode.Uri>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly disposables: vscode.Disposable[] = [];

  readonly onDidChange = this.changeEmitter.event;

  constructor(private readonly options: PreviewOptions) {
    this.disposables.push(
      this.changeEmitter,
      vscode.workspace.registerTextDocumentContentProvider(options.scheme, this),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.contentChanges.length > 0) this.scheduleRefresh(e.document.uri);
      }),
      vscode.workspace.onDidSaveTextDocument((doc) => this.scheduleRefresh(doc.uri)),
    );
  }

  get scheme(): string {
    return this.options.scheme;
  }

  /** Is `uri` one of this provider's preview documents? */
  isPreview(uri: vscode.Uri): boolean {
    return uri.scheme === this.options.scheme;
  }

  previewUri(source: vscode.Uri): vscode.Uri {
    return vscode.Uri.from({
      scheme: this.options.scheme,
      path: source.path + this.options.extension,
      query: source.toString(),
    });
  }

  sourceUri(preview: vscode.Uri): vscode.Uri {
    return vscode.Uri.parse(preview.query, true);
  }

  /** Opens (or reveals) the preview of `source` beside the current editor. */
  async show(source: vscode.Uri): Promise<void> {
    const uri = this.previewUri(source);
    let doc = await vscode.workspace.openTextDocument(uri);
    if (doc.languageId !== this.options.languageId) {
      doc = await vscode.languages.setTextDocumentLanguage(doc, this.options.languageId);
    }
    await vscode.window.showTextDocument(doc, {
      viewColumn: vscode.ViewColumn.Beside,
      preserveFocus: true,
      preview: true,
    });
  }

  /** Re-renders every open preview (optionally only those of `source`). */
  refresh(source?: vscode.Uri): void {
    const key = source?.toString();
    for (const doc of vscode.workspace.textDocuments) {
      if (!this.isPreview(doc.uri)) continue;
      if (key === undefined || doc.uri.query === key) this.changeEmitter.fire(doc.uri);
    }
  }

  async provideTextDocumentContent(uri: vscode.Uri, token: vscode.CancellationToken): Promise<string> {
    const source = this.sourceUri(uri);
    let document: vscode.TextDocument;
    try {
      document = await vscode.workspace.openTextDocument(source);
    } catch (err) {
      return `// Could not open ${source.toString(true)}\n// ${errorMessage(err)}\n`;
    }
    try {
      return await this.options.render(document, token);
    } catch (err) {
      return `// ${errorMessage(err).split('\n').join('\n// ')}\n`;
    }
  }

  private scheduleRefresh(source: vscode.Uri): void {
    if (this.isPreview(source)) return;
    const key = source.toString();
    const hasPreview = vscode.workspace.textDocuments.some((doc) => this.isPreview(doc.uri) && doc.uri.query === key);
    if (!hasPreview) return;
    const pending = this.timers.get(key);
    if (pending !== undefined) clearTimeout(pending);
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        this.refresh(source);
      }, this.options.debounceMs ?? 250),
    );
  }

  dispose(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    for (const d of this.disposables) d.dispose();
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * The `.owt` document a command applies to: the explicit argument (editor
 * title / context menus pass the resource URI), the source of an active
 * preview, or the active `.owt` editor.
 */
export function resolveOwtSource(arg: unknown, previews: readonly LivePreview[]): vscode.Uri | undefined {
  if (arg instanceof vscode.Uri) return unwrap(arg, previews);
  const editor = vscode.window.activeTextEditor;
  if (editor === undefined) return undefined;
  const uri = unwrap(editor.document.uri, previews);
  if (uri !== editor.document.uri) return uri;
  return editor.document.languageId === 'owt' ? uri : undefined;
}

function unwrap(uri: vscode.Uri, previews: readonly LivePreview[]): vscode.Uri {
  const preview = previews.find((p) => p.isPreview(uri));
  return preview === undefined ? uri : preview.sourceUri(uri);
}
