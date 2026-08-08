import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import { createRequire } from 'node:module';
import { roamSupabaseDevProxy } from '@roam/api-client/viteDevProxy';

// Force one React instance — nested app/node_modules copies break hooks (useState of null).
const require = createRequire(import.meta.url);
const reactRoot = path.dirname(require.resolve('react/package.json'));
const reactDomRoot = path.dirname(require.resolve('react-dom/package.json'));

const productLine = process.env.VITE_PRODUCT_LINE || 'fleet';
const isEnterprise = productLine === 'enterprise';
const appName = isEnterprise ? 'Roam Enterprise' : 'Roam Fleet';
const shortName = isEnterprise ? 'Enterprise' : 'Roam Fleet';
const appDescription = isEnterprise
  ? 'Roam Enterprise - multi-industry fleet operations dashboard.'
  : 'Roam Fleet - enterprise rideshare fleet management dashboard.';

export default defineConfig({
  define: {
    'import.meta.env.VITE_PRODUCT_LINE': JSON.stringify(productLine),
  },
  plugins: [
    roamSupabaseDevProxy(),
    react(),
    tailwindcss(),
    VitePWA({
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
        id: isEnterprise ? '/?product=enterprise' : '/?product=fleet',
        name: appName,
        short_name: shortName,
        description: appDescription,
        theme_color: '#030213',
        background_color: '#030213',
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
      workbox: {
        // SPA deep links hit the network (Vercel → index.html). On failure, show branded offline.
        // Do NOT use navigateFallback: offline.html — that would replace online routes too.
        // Monolithic fleet bundle exceeds Workbox's 2 MiB default — raise so the shell can precache.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,ico,png,svg,woff2,webmanifest,html}'],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkOnly',
            options: {
              plugins: [
                {
                  handlerDidError: async () =>
                    (await caches.match('/offline.html', { ignoreSearch: true })) ||
                    Response.error(),
                },
              ],
            },
          },
          {
            // Live backend only — never cache auth or business payloads.
            urlPattern: ({ url }) =>
              url.hostname.endsWith('supabase.co') ||
              url.hostname.includes('stripe.com') ||
              url.hostname.includes('paypal.com') ||
              url.hostname.includes('wipayfinancial.com') ||
              url.hostname.includes('mapbox.com'),
            handler: 'NetworkOnly',
          },
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'roam-fleet-images',
              expiration: {
                maxEntries: 64,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
    dedupe: ['react', 'react-dom'],
    alias: {
      react: reactRoot,
      'react-dom': reactDomRoot,
      'vaul@1.1.2': 'vaul',
      'sonner@2.0.3': 'sonner',
      'react-resizable-panels@2.1.7': 'react-resizable-panels',
      'react-hook-form@7.55.0': 'react-hook-form',
      'react-day-picker@8.10.1': 'react-day-picker',
      'next-themes@0.4.6': 'next-themes',
      'lucide-react@0.487.0': 'lucide-react',
      'input-otp@1.4.2': 'input-otp',
      'figma:asset/d634a1f92df5341866fd1b5612457b3002467263.png': path.resolve(__dirname, './src/assets/d634a1f92df5341866fd1b5612457b3002467263.png'),
      'embla-carousel-react@8.6.0': 'embla-carousel-react',
      'cmdk@1.1.1': 'cmdk',
      'class-variance-authority@0.7.1': 'class-variance-authority',
      '@supabase/supabase-js@2': '@supabase/supabase-js',
      '@radix-ui/react-visually-hidden@1.1.1': '@radix-ui/react-visually-hidden',
      '@radix-ui/react-tooltip@1.1.8': '@radix-ui/react-tooltip',
      '@radix-ui/react-toggle@1.1.2': '@radix-ui/react-toggle',
      '@radix-ui/react-toggle-group@1.1.2': '@radix-ui/react-toggle-group',
      '@radix-ui/react-tabs@1.1.3': '@radix-ui/react-tabs',
      '@radix-ui/react-switch@1.1.3': '@radix-ui/react-switch',
      '@radix-ui/react-slot@1.1.2': '@radix-ui/react-slot',
      '@radix-ui/react-slider@1.2.3': '@radix-ui/react-slider',
      '@radix-ui/react-separator@1.1.2': '@radix-ui/react-separator',
      '@radix-ui/react-select@2.1.6': '@radix-ui/react-select',
      '@radix-ui/react-scroll-area@1.2.3': '@radix-ui/react-scroll-area',
      '@radix-ui/react-radio-group@1.2.3': '@radix-ui/react-radio-group',
      '@radix-ui/react-progress@1.1.2': '@radix-ui/react-progress',
      '@radix-ui/react-popover@1.1.6': '@radix-ui/react-popover',
      '@radix-ui/react-navigation-menu@1.2.5': '@radix-ui/react-navigation-menu',
      '@radix-ui/react-menubar@1.1.6': '@radix-ui/react-menubar',
      '@radix-ui/react-label@2.1.2': '@radix-ui/react-label',
      '@radix-ui/react-hover-card@1.1.6': '@radix-ui/react-hover-card',
      '@radix-ui/react-dropdown-menu@2.1.6': '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-dialog@1.1.6': '@radix-ui/react-dialog',
      '@radix-ui/react-context-menu@2.2.6': '@radix-ui/react-context-menu',
      '@radix-ui/react-collapsible@1.1.3': '@radix-ui/react-collapsible',
      '@radix-ui/react-checkbox@1.1.4': '@radix-ui/react-checkbox',
      '@radix-ui/react-avatar@1.1.3': '@radix-ui/react-avatar',
      '@radix-ui/react-aspect-ratio@1.1.2': '@radix-ui/react-aspect-ratio',
      '@radix-ui/react-alert-dialog@1.1.6': '@radix-ui/react-alert-dialog',
      '@radix-ui/react-accordion@1.2.3': '@radix-ui/react-accordion',
      '@jsr/supabase__supabase-js@2.49.8': '@jsr/supabase__supabase-js',
      '@roam/roam-shared': path.resolve(__dirname, '../../packages/roam-shared/src/index.ts'),
      '@roam/roam-shared/fuel': path.resolve(
        __dirname,
        '../../packages/roam-shared/src/fuel/jaaFuelStatementMatcher.ts',
      ),
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react/jsx-runtime'],
    exclude: ['@roam/roam-shared'],
  },
  build: {
    target: 'esnext',
    outDir: 'build',
  },
  server: {
    port: 3000,
    /** Bind only to this machine. Avoids listening on all interfaces (no extra “Network:” URLs). */
    host: 'localhost',
    strictPort: true,
    open: true,
    fs: {
      allow: [path.resolve(__dirname, '../..')],
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: [
      /** Legacy file uses a manual runner (`node` / copy-paste), not Vitest `test()`. */
      '**/tollReconciliation.test.ts',
      /** Deno edge-function tests (Deno.test + https: imports) run via `deno test`, not Vitest. */
      '**/supabase/functions/**',
    ],
  },
});
