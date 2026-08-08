import { projectId } from './supabaseInfo';

/**
 * Same-origin Vite proxy prefix for Edge Functions in local DEV.
 * Cursor / Electron browsers are blocked by Cloudflare on direct
 * `*.supabase.co/functions/v1` fetches; Auth + REST still work.
 */
export const SUPABASE_FUNCTIONS_DEV_PREFIX = '/__sb/functions/v1';

export function getSupabaseFunctionsBaseUrl(): string {
  if (import.meta.env.DEV) return SUPABASE_FUNCTIONS_DEV_PREFIX;
  return `https://${projectId}.supabase.co/functions/v1`;
}
