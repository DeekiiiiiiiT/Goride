import { loadEnv, type Plugin, type ProxyOptions } from 'vite';

/** Must match `SUPABASE_FUNCTIONS_DEV_PREFIX` path root (`/__sb`). */
const PROXY_MOUNT = '/__sb';

export function supabaseUrlFromEnv(env: Record<string, string>): string {
  const url = env.VITE_SUPABASE_URL?.trim();
  if (url) return url.replace(/\/$/, '');
  const id = env.VITE_SUPABASE_PROJECT_ID?.trim();
  if (id) return `https://${id}.supabase.co`;
  // Shared Roam prod project — last-resort so local smoke tests still proxy.
  return 'https://csfllzzastacofsvcdsc.supabase.co';
}

export function supabaseEdgeFunctionsProxy(supabaseUrl: string): Record<string, ProxyOptions> {
  return {
    [PROXY_MOUNT]: {
      target: supabaseUrl.replace(/\/$/, ''),
      changeOrigin: true,
      secure: true,
      rewrite: (p) => p.replace(new RegExp(`^${PROXY_MOUNT}`), ''),
    },
  };
}

/**
 * Vite plugin: proxy `/__sb/functions/v1/*` → Supabase Edge Functions in DEV.
 * Drop into each app's `plugins` array — no per-app server.proxy boilerplate.
 */
export function roamSupabaseDevProxy(): Plugin {
  return {
    name: 'roam-supabase-dev-proxy',
    config(_config, { mode }) {
      const root = process.cwd();
      const env = loadEnv(mode, root, '');
      return {
        server: {
          proxy: supabaseEdgeFunctionsProxy(supabaseUrlFromEnv(env)),
        },
      };
    },
  };
}
