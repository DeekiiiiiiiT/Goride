import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { roamSupabaseDevProxy } from '@roam/api-client/viteDevProxy';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KEYS = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PROJECT_ID', 'VITE_SUPABASE_ANON_KEY'] as const;

export default defineConfig(({ mode }) => {
  const fromFleet = loadEnv(mode, path.resolve(__dirname, '../fleet'), 'VITE_');
  const fromApp = loadEnv(mode, __dirname, 'VITE_');
  const env = { ...fromFleet, ...fromApp };
  const define = Object.fromEntries(
    KEYS.filter((key) => env[key]).map((key) => [`import.meta.env.${key}`, JSON.stringify(env[key])]),
  );
  return {
    base: './',
    plugins: [react(), tailwindcss(), roamSupabaseDevProxy()],
    define: {
      ...define,
      'import.meta.env.VITE_PLUG_PUBLIC_ORIGIN': JSON.stringify(env.VITE_PLUG_PUBLIC_ORIGIN || 'https://roam-plug.vercel.app'),
      'import.meta.env.VITE_PLUG_FLAGS_OPEN': JSON.stringify(env.VITE_PLUG_FLAGS_OPEN || process.env.VITE_PLUG_FLAGS_OPEN || ''),
    },
    resolve: { alias: { '@': path.resolve(__dirname, './src') } },
    build: { target: 'esnext', outDir: 'dist' },
    server: {
      port: 3016,
      host: 'localhost',
      strictPort: true,
      fs: { allow: [path.resolve(__dirname, '../..')] },
    },
  };
});
