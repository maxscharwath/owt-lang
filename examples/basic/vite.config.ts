import { defineConfig } from 'vite';
import owt from '@owt/vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  build: {
    minify: false,
  },

  plugins: [owt(), tailwindcss()],

  optimizeDeps: {
    // local workspace package; optimizing it would require dev server restarts with --force
    exclude: ['owt'],
  },

  test: {
    include: ['**/*.owt'],
  },
});
