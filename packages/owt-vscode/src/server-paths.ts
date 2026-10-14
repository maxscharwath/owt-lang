import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { getTsdk } from '@volar/vscode';

export type ServerModule = {
  path: string;
  source: 'setting' | 'bundled' | 'workspace';
};

/** Thrown when the language server cannot be located; `action` is offered to the user. */
export class SetupError extends Error {
  constructor(
    message: string,
    readonly action?: { title: string; command: string; args?: unknown[] },
  ) {
    super(message);
  }
}

/**
 * Where to load `@owt/language-server` from:
 * 1. the `owt.server.path` setting,
 * 2. the copy bundled in the extension (`server/index.js`, written by `scripts/build.mjs`),
 * 3. the sibling workspace package when running the extension from the monorepo.
 */
export function resolveServerModule(context: vscode.ExtensionContext): ServerModule {
  const configured = vscode.workspace.getConfiguration('owt').get<string>('server.path', '').trim();
  if (configured !== '') {
    const resolved = resolveUserPath(configured);
    const file = resolveModuleFile(resolved);
    if (file === undefined) {
      throw new SetupError(`owt.server.path points to "${resolved}", which is not a language server module.`, {
        title: 'Open Settings',
        command: 'workbench.action.openSettings',
        args: ['owt.server.path'],
      });
    }
    return { path: file, source: 'setting' };
  }

  const bundled = context.asAbsolutePath(path.join('server', 'index.js'));
  if (isFile(bundled)) return { path: bundled, source: 'bundled' };

  const sibling = path.resolve(context.extensionPath, '..', 'owt-language-server', 'dist', 'index.js');
  if (isFile(sibling)) return { path: sibling, source: 'workspace' };

  throw new SetupError(
    'The OWT language server is missing from this installation. Build it (pnpm --filter @owt/language-server build, then pnpm --filter owt-vscode build) or set owt.server.path.',
    { title: 'Open Settings', command: 'workbench.action.openSettings', args: ['owt.server.path'] },
  );
}

export type Tsdk = {
  /** Absolute path of TypeScript's `lib` folder. */
  tsdk: string;
  version: string | undefined;
  isWorkspacePath: boolean;
};

/**
 * The TypeScript the language server should use: VS Code's bundled version, or
 * the workspace version (`typescript.tsdk`) once the user picked "Use Workspace
 * Version" from the OWT TypeScript version status item. Workspace TypeScript
 * is never loaded in untrusted workspaces. `undefined` lets the server fall
 * back to the TypeScript it bundles.
 */
export async function resolveTsdk(context: vscode.ExtensionContext): Promise<Tsdk | undefined> {
  const fromVolar = await getTsdk(context);
  if (fromVolar !== undefined && (!fromVolar.isWorkspacePath || vscode.workspace.isTrusted)) {
    return { tsdk: fromVolar.tsdk, version: fromVolar.version, isWorkspacePath: fromVolar.isWorkspacePath };
  }
  const bundled = path.join(vscode.env.appRoot, 'extensions', 'node_modules', 'typescript', 'lib');
  if (isFile(path.join(bundled, 'typescript.js'))) {
    return { tsdk: bundled, version: readTsVersion(bundled), isWorkspacePath: false };
  }
  return undefined;
}

function readTsVersion(lib: string): string | undefined {
  try {
    const pkg: unknown = JSON.parse(fs.readFileSync(path.join(lib, '..', 'package.json'), 'utf8'));
    if (typeof pkg === 'object' && pkg !== null) {
      const version: unknown = Reflect.get(pkg, 'version');
      if (typeof version === 'string') return version;
    }
  } catch {
    // unreadable package.json: unknown version
  }
  return undefined;
}

/** Expands `~` and resolves relative paths against the first workspace folder. */
function resolveUserPath(p: string): string {
  if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) p = path.join(os.homedir(), p.slice(1));
  if (path.isAbsolute(p)) return path.normalize(p);
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder === undefined ? path.resolve(p) : path.resolve(folder.uri.fsPath, p);
}

/** A file, or a package directory / `dist` directory containing the server entry point. */
function resolveModuleFile(p: string): string | undefined {
  if (isFile(p)) return p;
  for (const candidate of [path.join(p, 'dist', 'index.js'), path.join(p, 'index.js')]) {
    if (isFile(candidate)) return candidate;
  }
  return undefined;
}

function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}
