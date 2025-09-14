import { describe, it, expect } from 'vitest';
import owt from './index';

const isTransformResult = (r: unknown): r is { code: string } =>
  typeof r === 'object' && r !== null && 'code' in r;

describe('vite-plugin-owt', () => {
  it('transforms .owt files', async () => {
    const plugin = owt();
    const src = `export component App() { <div>Hello</div> }`;
    const id = '/project/App.owt';

    const result = await plugin.transform?.(src, id);

    expect(isTransformResult(result) ? result.code : '').toContain('export function App');
  });
});
