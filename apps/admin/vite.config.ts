import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'url';
import { roamSupabaseDevProxy } from '@roam/api-client/viteDevProxy';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminSrc = path.resolve(__dirname, 'src');
const repoRoot = path.resolve(__dirname, '../..');
// Force one React — shared packages must not pull a second copy.
const require = createRequire(import.meta.url);
const reactRoot = path.dirname(require.resolve('react/package.json'));
const reactDomRoot = path.dirname(require.resolve('react-dom/package.json'));

export default defineConfig({
  define: {
    'import.meta.env.VITE_PRODUCT_LINE': JSON.stringify('enterprise'),
  },
  plugins: [roamSupabaseDevProxy(), react(), tailwindcss()],
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
    dedupe: ['react', 'react-dom'],
    alias: [
      { find: 'react', replacement: reactRoot },
      { find: 'react-dom', replacement: reactDomRoot },
      { find: '@', replacement: adminSrc },
      { find: '@roam/toll-ui', replacement: path.resolve(repoRoot, 'packages/toll-ui/src/index.ts') },
      { find: '@roam/roam-shared', replacement: path.resolve(repoRoot, 'packages/roam-shared/src/index.ts') },
      { find: '@roam/finance-core', replacement: path.resolve(repoRoot, 'packages/finance-core/src/index.ts') },
      { find: '@roam/fuel-core', replacement: path.resolve(repoRoot, 'packages/fuel-core/src') },
      {
        find: '@roam/roam-shared/fuel',
        replacement: path.resolve(repoRoot, 'packages/roam-shared/src/fuel/jaaFuelStatementMatcher.ts'),
      },
      { find: '@roam/types/tollCrossings', replacement: path.resolve(repoRoot, 'packages/types/src/tollCrossings.ts') },
      { find: '@roam/types/rides', replacement: path.resolve(repoRoot, 'packages/types/src/rides.ts') },
      { find: 'sonner@2.0.3', replacement: 'sonner' },
    ],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react/jsx-runtime'],
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
  },
  server: {
    port: 3001,
    host: 'localhost',
    strictPort: true,
    open: true,
    fs: {
      // Packages + admin only — no apps/fleet source (shared UI lives in platform-ops-ui).
      allow: [
        path.resolve(__dirname),
        path.resolve(repoRoot, 'packages'),
        path.resolve(repoRoot, 'node_modules'),
      ],
    },
    watch: {
      ignored: [
        '**/node_modules/**',
        '**/dist/**',
        // Fleet-only edits must not refresh Dominion.
        '**/apps/fleet/**',
      ],
    },
  },
  test: {
    environment: 'node',
    // Same as fleet: api-client throws at import without Supabase placeholders.
    env: {
      VITE_SUPABASE_URL: 'https://ci-placeholder.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'ci-placeholder-anon-key',
    },
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: [
      /** Deno edge-function tests (Deno.test + https: imports) run via `deno test`, not Vitest. */
      '**/supabase/functions/**',
    ],
  },
});
