import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pkg = JSON.parse(
  readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'package.json'), 'utf8'),
) as { version?: string };

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const buildYear = String(new Date().getFullYear());

  return {
    base: './',
    plugins: [react(), tailwindcss()],
    resolve: {
      extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@roam/types/rides': path.resolve(__dirname, '../../packages/types/src/rides.ts'),
        '@roam/admin-core': path.resolve(__dirname, '../../packages/admin-core/src'),
      },
    },
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version ?? '0.0.0'),
      'import.meta.env.VITE_APP_BUILD_YEAR': JSON.stringify(env.VITE_APP_BUILD_YEAR ?? buildYear),
    },
    build: {
      target: 'esnext',
      outDir: 'dist',
    },
    server: {
      /** Dedicated slot so dash-customer/merchant can use 5174–5175 without bumping into rides. */
      port: 5180,
      host: 'localhost',
      strictPort: true,
    },
  };
});
