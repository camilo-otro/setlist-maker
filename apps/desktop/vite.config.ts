import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { serviceWorkerPlugin } from './build/serviceWorker';

// Fixed port and no screen clearing, as Tauri's dev server integration expects.
// The web build (`--mode web`) also gets a service worker, for installing and offline use.
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'web' ? [serviceWorkerPlugin()] : [])],
  clearScreen: false,
  // The web build (`--mode web`) runs SQLite as WebAssembly in a worker. Vite mustn't pre-bundle
  // sqlite-wasm, or it loses track of its .wasm file; workers are ES modules like the app.
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  worker: { format: 'es' },
  server: {
    port: 1420,
    strictPort: true,
    // Tauri watches its own Rust sources; Vite watching the build output hits locked files.
    watch: { ignored: ['**/src-tauri/**'] },
  },
}));
