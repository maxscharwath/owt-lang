import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compile } from '@owt/compiler';
// @ts-expect-error plain JavaScript CLI without type declarations
import { create } from '../index.mjs';

const quiet = { input: { isTTY: false }, output: { write: () => true } };
const dirs: string[] = [];

function scaffold(template: string) {
  const root = mkdtempSync(join(tmpdir(), 'create-owt-'));
  dirs.push(root);
  const dir = join(root, 'My Cool App');
  return create([dir, '--template', template, '--yes'], quiet).then(() => dir);
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('create-owt', () => {
  it('writes a project with a valid package name and title', async () => {
    const dir = await scaffold('minimal');

    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));

    expect(pkg.name).toBe('my-cool-app');
    expect(readFileSync(join(dir, 'src/main.ts'), 'utf8')).toContain("name: 'My Cool App'");
  });

  it('restores dotfiles', async () => {
    const dir = await scaffold('minimal');

    expect(existsSync(join(dir, '.gitignore'))).toBe(true);
    expect(existsSync(join(dir, '.vscode/extensions.json'))).toBe(true);
  });

  it.each(['minimal', 'todo'])('generates a %s app that compiles without warnings', async (template) => {
    const dir = await scaffold(template);

    const out = compile(readFileSync(join(dir, 'src/App.owt'), 'utf8'), { filename: 'App.owt' });

    expect(out.warnings).toEqual([]);
  });

  it('rejects unknown templates', async () => {
    await expect(scaffold('nope')).rejects.toThrow(/Unknown template "nope"/);
  });
});
