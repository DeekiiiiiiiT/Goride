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

function requireProjectId(): string {
  const fromUrl = env?.VITE_SUPABASE_URL
    ? projectRefFromSupabaseUrl(env.VITE_SUPABASE_URL)
    : undefined;
  const fromId = env?.VITE_SUPABASE_PROJECT_ID?.trim();
  const projectId = fromUrl ?? fromId;
  if (!projectId) {
    throw new Error(
      "Missing Supabase config: set VITE_SUPABASE_URL (or VITE_SUPABASE_PROJECT_ID) and VITE_SUPABASE_ANON_KEY",
    );
  }
  return projectId;
}

function requireAnonKey(): string {
  const key = env?.VITE_SUPABASE_ANON_KEY?.trim();
  if (!key) {
    throw new Error(
      "Missing Supabase config: set VITE_SUPABASE_URL (or VITE_SUPABASE_PROJECT_ID) and VITE_SUPABASE_ANON_KEY",
    );
  }
  return key;
}

/**
 * Supabase project ref (subdomain), e.g. `abcd` for https://abcd.supabase.co
 *
 * Set in Vercel (Production + Preview if needed):
 * - `VITE_SUPABASE_URL` = https://YOUR_REF.supabase.co  (recommended), or
 * - `VITE_SUPABASE_PROJECT_ID` = YOUR_REF
 */
export const projectId: string = requireProjectId();

/**
 * Supabase anon (public) key — safe to expose in the browser; still prefer env in production.
 *
 * Vercel: `VITE_SUPABASE_ANON_KEY` = (anon public key from Supabase → Project Settings → API)
 */
export const publicAnonKey: string = requireAnonKey();

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
