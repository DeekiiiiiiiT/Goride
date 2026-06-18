import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@roam/admin-core': path.resolve(__dirname, '../../packages/admin-core/src'),
      '@roam/hauler-dispatch': path.resolve(__dirname, '../../packages/hauler-dispatch/src'),
    },
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
  },
  server: {
    port: 3002,
    host: 'localhost',
    strictPort: true,
    open: true,
  },
});
