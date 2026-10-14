import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { inlineSharedCss, sharedConfig } from '../../shared/vite';

export default defineConfig({
  ...sharedConfig('react'),
  plugins: [react(), inlineSharedCss()],
});
