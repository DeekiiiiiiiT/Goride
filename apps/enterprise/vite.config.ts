import { defineConfig, normalizePath, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fleetSrc = path.resolve(__dirname, '../fleet/src');

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
  plugins: [resolveFleetVersionedPackages(fleetSrc), react(), tailwindcss()],
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
    alias: [
      { find: '@fleet', replacement: fleetSrc },
      { find: '@', replacement: fleetSrc },
      { find: 'sonner@2.0.3', replacement: 'sonner' },
    ],
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
  },
  server: {
    port: 3003,
    host: 'localhost',
    strictPort: true,
    open: true,
  },
});
