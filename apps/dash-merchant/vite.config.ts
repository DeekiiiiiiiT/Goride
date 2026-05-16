import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@roam/admin-core': path.resolve(__dirname, '../../packages/admin-core/src'),
    },
  },
  server: {
    port: 5175,
    host: 'localhost',
    strictPort: true,
  },
  build: {
    outDir: 'dist',
  },
});
