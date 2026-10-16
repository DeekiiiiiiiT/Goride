import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { roamSupabaseDevProxy } from '@roam/api-client/viteDevProxy';

const pkg = JSON.parse(
  readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'package.json'), 'utf8'),
) as { version?: string };

export default defineConfig({
  plugins: [roamSupabaseDevProxy(), react(), tailwindcss()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version ?? '0.1.0'),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
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
});
