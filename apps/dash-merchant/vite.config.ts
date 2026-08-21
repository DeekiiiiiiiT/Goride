import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import { roamSupabaseDevProxy } from '@roam/api-client/viteDevProxy';

export default defineConfig(({ mode }) => {
  const repoRoot = path.resolve(__dirname, '../..');
  const fromRoot = loadEnv(mode, repoRoot, 'VITE_');
  const fromApp = loadEnv(mode, __dirname, 'VITE_');
  const env = { ...fromRoot, ...fromApp };

  return {
    plugins: [
      roamSupabaseDevProxy(),
      react(),
      tailwindcss(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        registerType: 'prompt',
        includeAssets: [
          'favicon.svg',
          'favicon-32.png',
          'favicon.ico',
          'apple-touch-icon.png',
          'offline.html',
          'icons/icon-192.png',
          'icons/icon-512.png',
          'icons/icon-maskable-512.png',
        ],
        manifest: {
          name: 'Roam Rush Partner',
          short_name: 'Partner',
          description: 'Manage orders, menus, and grow your delivery business on Roam Rush.',
          theme_color: '#10b981',
          background_color: '#fff8f5',
          display: 'standalone',
          orientation: 'any',
          start_url: '/',
          scope: '/',
          lang: 'en',
          categories: ['business', 'productivity'],
          icons: [
            {
              src: '/icons/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/icons/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/icons/icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        injectManifest: {
          globPatterns: ['**/*.{js,css,ico,png,svg,woff2,webmanifest,html}'],
          maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
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
