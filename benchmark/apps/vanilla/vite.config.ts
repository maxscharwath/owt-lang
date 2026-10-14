import { defineConfig } from 'vite';
import { inlineSharedCss, sharedConfig } from '../../shared/vite';

export default defineConfig({
  ...sharedConfig('vanilla'),
  plugins: [inlineSharedCss()],
});
