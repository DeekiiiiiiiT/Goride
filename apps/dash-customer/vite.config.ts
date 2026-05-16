import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@dash-admin': path.resolve(__dirname, '../dash-merchant/src/admin'),
      '@roam/admin-core': path.resolve(__dirname, '../../packages/admin-core/src'),
    },
  },
  server: {
    port: 5174,
    host: 'localhost',
    /** Fail fast instead of stealing 5175/5176 (merchant & rides-passenger) when 5174 is busy. */
    strictPort: true,
  },
  build: {
    outDir: 'dist',
  },
});
