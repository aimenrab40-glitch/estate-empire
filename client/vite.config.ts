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
    // Bind all interfaces so phones/tablets on the same Wi-Fi can reach the
    // dev server via the PC's LAN IP (e.g. http://192.168.1.20:5173).
    // NOTE: voice needs HTTPS (secure context) — use the public URL for mic tests.
    host: true,
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
