import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { roamSupabaseDevProxy } from '@roam/api-client/viteDevProxy';

export default defineConfig({
  plugins: [roamSupabaseDevProxy(), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@roam/admin-core': path.resolve(__dirname, '../../packages/admin-core/src'),
      '@courier-admin': path.resolve(__dirname, '../dash-courier/src/admin'),
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
