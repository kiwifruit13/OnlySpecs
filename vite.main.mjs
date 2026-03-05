import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  resolve: {
    alias: {
      '@': __dirname,
    },
  },
  build: {
    rollupOptions: {
      external: ['electron', 'node-pty'],
    },
  },
  // optimizeDeps: {
  //   exclude: ['node-pty'],
  // },
});
