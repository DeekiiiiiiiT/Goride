import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { roamSupabaseDevProxy } from '@roam/api-client/viteDevProxy';

export default defineConfig(({ mode }) => {
  const repoRoot = path.resolve(__dirname, '../..');
  const fromRoot = loadEnv(mode, repoRoot, 'VITE_');
  const fromApp = loadEnv(mode, __dirname, 'VITE_');
  const env = { ...fromRoot, ...fromApp };

  return {
    plugins: [roamSupabaseDevProxy(), react(), tailwindcss()],
    define: Object.fromEntries(
      Object.entries(env).map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)]),
    ),
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
  };
});
