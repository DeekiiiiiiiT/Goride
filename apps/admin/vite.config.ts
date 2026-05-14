import { defineConfig, normalizePath, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminSrc = path.resolve(__dirname, 'src');
const fleetSrc = path.resolve(__dirname, '../fleet/src');

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
  plugins: [resolveFleetVersionedPackages(fleetSrc), react(), tailwindcss()],
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
    alias: [
      { find: '@', replacement: adminSrc },
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
});
