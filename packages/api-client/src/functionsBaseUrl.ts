import { projectId } from './supabaseInfo';

/**
 * Same-origin Vite proxy prefix for Edge Functions in local DEV.
 * Cursor / Electron browsers are blocked by Cloudflare on direct
 * `*.supabase.co/functions/v1` fetches; Auth + REST still work.
 */
export const SUPABASE_FUNCTIONS_DEV_PREFIX = '/__sb/functions/v1';

function isLocalSupabaseApiUrl(url: string): boolean {
  try {
    const host = new URL(url.trim().replace(/\/$/, '')).hostname;
    return host === '127.0.0.1' || host === 'localhost';
  } catch {
    return false;
  }
}

export function getSupabaseFunctionsBaseUrl(): string {
  if (import.meta.env.DEV) return SUPABASE_FUNCTIONS_DEV_PREFIX;
  const rawUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (rawUrl?.trim() && isLocalSupabaseApiUrl(rawUrl)) {
    return `${rawUrl.trim().replace(/\/$/, '')}/functions/v1`;
  }
  return `https://${projectId}.supabase.co/functions/v1`;
}
