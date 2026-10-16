import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Fixed port and no screen clearing, as Tauri's dev server integration expects.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
});
