import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { roamSupabaseDevProxy } from '@roam/api-client/viteDevProxy';

const pkg = JSON.parse(
  readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'package.json'), 'utf8'),
) as { version?: string };

export default defineConfig(({ mode }) => {
  const repoRoot = path.resolve(__dirname, '../..');
  const fromRoot = loadEnv(mode, repoRoot, 'VITE_');
  const fromApp = loadEnv(mode, __dirname, 'VITE_');
  const env = {
    ...fromRoot,
    ...fromApp,
    VITE_APP_VERSION: fromApp.VITE_APP_VERSION || fromRoot.VITE_APP_VERSION || pkg.version || '0.1.0',
  };

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
      port: 5176,
      host: 'localhost',
      strictPort: true,
    },
    build: {
      outDir: 'dist',
    },
  };
});
