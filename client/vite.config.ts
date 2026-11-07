import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@shared': path.resolve(here, '../shared/src'),
      '@': path.resolve(here, 'src'),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    // allow importing the shared/ folder that lives outside client/
    fs: { allow: [path.resolve(here, '..')] },
    proxy: {
      '/socket.io': { target: 'http://localhost:4000', ws: true, changeOrigin: true },
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
