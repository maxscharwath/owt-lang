import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { inlineSharedCss, sharedConfig } from '../../shared/vite';

export default defineConfig({
  ...sharedConfig('vue'),
  plugins: [vue(), inlineSharedCss()],
});
