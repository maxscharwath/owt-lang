import { defineConfig } from 'vite';
import owt from '@owt/vite';
import { inlineSharedCss, sharedConfig } from '../../shared/vite';

export default defineConfig({
  ...sharedConfig('owt'),
  plugins: [owt(), inlineSharedCss()],
});
