/** Default project (fallback when VITE_* env vars are unset — e.g. local dev). */
const DEFAULT_PROJECT_REF = "csfllzzastacofsvcdsc";
const DEFAULT_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzZmxsenphc3RhY29mc3ZjZHNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4NDUyMzQsImV4cCI6MjA4MTQyMTIzNH0.1L3uqNj1qctfFM1bXrm1sK97PQtyKldGDTrojbQOD00";

function viteEnv(): Record<string, string | undefined> | undefined {
  try {
    return (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  } catch {
    return undefined;
  }
}

function projectRefFromSupabaseUrl(url: string): string | undefined {
  const trimmed = url.trim().replace(/\/$/, "");
  const m = trimmed.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co$/i);
  return m?.[1];
}

const env = viteEnv();

/**
 * Supabase project ref (subdomain), e.g. `abcd` for https://abcd.supabase.co
 *
 * Set in Vercel (Production + Preview if needed):
 * - `VITE_SUPABASE_URL` = https://YOUR_REF.supabase.co  (recommended), or
 * - `VITE_SUPABASE_PROJECT_ID` = YOUR_REF
 */
export const projectId: string =
  (env?.VITE_SUPABASE_URL ? projectRefFromSupabaseUrl(env.VITE_SUPABASE_URL) : undefined) ??
  env?.VITE_SUPABASE_PROJECT_ID?.trim() ??
  DEFAULT_PROJECT_REF;

/**
 * Supabase anon (public) key — safe to expose in the browser; still prefer env in production.
 *
 * Vercel: `VITE_SUPABASE_ANON_KEY` = (anon public key from Supabase → Project Settings → API)
 */
export const publicAnonKey: string = env?.VITE_SUPABASE_ANON_KEY?.trim() ?? DEFAULT_ANON_KEY;

/**
 * Supabase Edge Functions reject browser requests without `apikey` + `Authorization`
 * (use the anon JWT for public routes). Merge `extra` for Content-Type, etc.
 */
export function supabaseAnonFunctionHeaders(
  extra?: Record<string, string>,
): Record<string, string> {
  return {
    apikey: publicAnonKey,
    Authorization: `Bearer ${publicAnonKey}`,
    ...extra,
  };
}
