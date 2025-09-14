import { defineConfig } from 'vite';
import owt from '@owt/vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  build: {
    minify: 'esbuild',
    sourcemap: false,
  },
  plugins: [
    owt({ 
      typeCheck: true,
      emitTypeScript: true
    }), 
    tailwindcss()
  ]
});
