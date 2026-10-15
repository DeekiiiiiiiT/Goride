import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { roamSupabaseDevProxy } from '@roam/api-client/viteDevProxy';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Shared public Supabase keys live on fleet for local monorepo; app .env.local wins. */
const SUPABASE_ENV_KEYS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PROJECT_ID',
  'VITE_SUPABASE_ANON_KEY',
] as const;

function androidVersionName(): string {
  try {
    const raw = readFileSync(path.join(__dirname, 'android/version.properties'), 'utf8');
    const m = raw.match(/^VERSION_NAME=(.+)$/m);
    return m?.[1]?.trim() || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export default defineConfig(({ mode }) => {
  const fromFleet = loadEnv(mode, path.resolve(__dirname, '../fleet'), 'VITE_');
  const fromApp = loadEnv(mode, __dirname, 'VITE_');
  const env = { ...fromFleet, ...fromApp };

  const supabaseDefine = Object.fromEntries(
    SUPABASE_ENV_KEYS.filter((key) => env[key]).map((key) => [
      `import.meta.env.${key}`,
      JSON.stringify(env[key]),
    ]),
  );

  const appVersion = env.VITE_APP_VERSION || androidVersionName();

  return {
    base: './',
    plugins: [roamSupabaseDevProxy(), react(), tailwindcss()],
    define: {
      ...supabaseDefine,
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
    },
    resolve: {
      extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@fleet': path.resolve(__dirname, '../fleet/src'),
        '@roam/admin-core': path.resolve(__dirname, '../../packages/admin-core/src'),
        '@roam/hauler-dispatch': path.resolve(__dirname, '../../packages/hauler-dispatch/src'),
        '@roam/finance-core': path.resolve(__dirname, '../../packages/finance-core/src/index.ts'),
      },
    },
    build: {
      target: 'esnext',
      outDir: 'dist',
    },
    server: {
      port: 3002,
      host: 'localhost',
      strictPort: true,
      open: true,
    },
  };
});
