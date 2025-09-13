import { describe, it, expect } from 'vitest';
import owt from './index';

describe('vite-plugin-owt', () => {
  it('transforms .owt files', async () => {
    const plugin = owt();
    if (plugin.configResolved && typeof plugin.configResolved === 'function') {
      await (plugin.configResolved as any)({ root: '' } as any);
    }
    const src = `export component App() { <div>Hello</div> }`;
    const result: any = await (plugin as any).transform?.(src, '/project/App.owt');
    expect(result?.code).toContain('export function App');
  });
});
