import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Served at /viewer/ on the site; the web app has the root (see .github/workflows/viewer.yml).
export default defineConfig({
  base: '/viewer/',
  plugins: [react()],
  server: { port: 1440 },
});
