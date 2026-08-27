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
      '@roam/dash-admin': path.resolve(__dirname, '../../packages/dash-admin/src'),
      '@roam/dash-admin-client': path.resolve(__dirname, '../../packages/dash-admin-client/src'),
      '@roam/location': path.resolve(__dirname, '../../packages/location/src'),
      '@roam/spatial': path.resolve(__dirname, '../../packages/spatial/src/index.ts'),
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
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('packages/dash-admin/') || id.includes('packages\\dash-admin\\')) {
            return 'admin';
          }
          if (id.includes('node_modules/leaflet') || id.includes('node_modules\\leaflet')) {
            return 'admin-maps';
          }
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/react-router')
          ) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/@tanstack/react-query')) {
            return 'vendor-query';
          }
        },
      },
    },
  },
});
