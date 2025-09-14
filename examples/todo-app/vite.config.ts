import { defineConfig } from 'vite';
import owt from '@owt/vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [owt(), tailwindcss()]
});
