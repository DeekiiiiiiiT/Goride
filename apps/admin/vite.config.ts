import { defineConfig } from 'vitest/config';
import { normalizePath, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'url';
import { roamSupabaseDevProxy } from '@roam/api-client/viteDevProxy';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminSrc = path.resolve(__dirname, 'src');
const fleetSrc = path.resolve(__dirname, '../fleet/src');
const repoRoot = path.resolve(__dirname, '../..');
// Force one React — admin pulls fleet UI source; nested copies break hooks (useState of null).
const require = createRequire(import.meta.url);
const reactRoot = path.dirname(require.resolve('react/package.json'));
const reactDomRoot = path.dirname(require.resolve('react-dom/package.json'));

/** Fleet UI was generated with `pkg@semver` import specifiers; resolve to real packages in admin. */
function resolveFleetVersionedPackages(fleetSrcRoot: string): Plugin {
  const semverSuffix = /^(.+)@(\d+\.\d+[\d.\w-]*)$/;
  const fleetRootNorm = normalizePath(fleetSrcRoot);
  return {
    name: 'resolve-fleet-versioned-packages',
    async resolveId(id, importer) {
      if (!importer || !semverSuffix.test(id)) return null;
      const normImporter = normalizePath(importer);
      if (!normImporter.startsWith(fleetRootNorm)) return null;
      const m = id.match(semverSuffix);
      if (!m) return null;
      const resolved = await this.resolve(m[1], importer, { skipSelf: true });
      return resolved?.id ?? null;
    },
  };
}

export default defineConfig({
  define: {
    'import.meta.env.VITE_PRODUCT_LINE': JSON.stringify('enterprise'),
  },
  plugins: [roamSupabaseDevProxy(), resolveFleetVersionedPackages(fleetSrc), react(), tailwindcss()],
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
      { find: '@roam/fuel-core', replacement: path.resolve(repoRoot, 'packages/fuel-core/src/index.ts') },
      {
        find: '@roam/roam-shared/fuel',
        replacement: path.resolve(repoRoot, 'packages/roam-shared/src/fuel/jaaFuelStatementMatcher.ts'),
      },
      { find: '@roam/types/tollCrossings', replacement: path.resolve(repoRoot, 'packages/types/src/tollCrossings.ts') },
      { find: '@roam/types/rides', replacement: path.resolve(repoRoot, 'packages/types/src/rides.ts') },
      /** Reuse fleet Super-Admin–equivalent screens without duplicating code */
      { find: '@fleet', replacement: fleetSrc },
      /** Fleet sources still reference this legacy import string */
      { find: 'sonner@2.0.3', replacement: 'sonner' },
      /**
       * Fleet database views import `../auth/AuthContext` (fleet). When bundled into admin,
       * use admin AuthProvider so `session` / platform login match the host app.
       */
      {
        find: normalizePath(path.resolve(fleetSrc, 'components/auth/AuthContext.tsx')),
        replacement: normalizePath(path.resolve(adminSrc, 'components/auth/AuthContext.tsx')),
      },
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
