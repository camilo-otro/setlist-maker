import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Fixed port and no screen clearing, as Tauri's dev server integration expects.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    // Tauri watches its own Rust sources; Vite watching the build output hits locked files.
    watch: { ignored: ['**/src-tauri/**'] },
  },
});
