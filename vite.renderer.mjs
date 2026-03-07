import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  resolve: {
    alias: {
      '@': __dirname,
    },
  },
  root: 'src/renderer',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true, // Fail if port is already in use instead of auto-switching
  },
  build: {
    outDir: resolve(__dirname, '.vite/renderer/main_window'),
    rollupOptions: {
      input: resolve(__dirname, 'src/renderer/index.html'),
    },
  },
});
