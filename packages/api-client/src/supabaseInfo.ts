function trimUrl(url: string): string {
  return url.trim().replace(/\/$/, '');
}

function projectRefFromSupabaseUrl(url: string): string | undefined {
  const trimmed = trimUrl(url);
  const m = trimmed.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co$/i);
  return m?.[1];
}

/** True when the configured API host is local Supabase (test copy). */
export function isLocalSupabaseHost(url: string): boolean {
  try {
    const host = new URL(trimUrl(url)).hostname.toLowerCase();
    return host === '127.0.0.1' || host === 'localhost';
  } catch {
    return false;
  }
}

function resolveSupabaseUrl(): string {
  const rawUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
  if (rawUrl) return trimUrl(rawUrl);
  const fromId = (import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined)?.trim();
  if (fromId) return `https://${fromId}.supabase.co`;
  throw new Error(
    'Missing Supabase config: set VITE_SUPABASE_URL (or VITE_SUPABASE_PROJECT_ID) and VITE_SUPABASE_ANON_KEY',
  );
}

function resolveProjectId(supabaseApiUrl: string): string {
  const fromHostedUrl = projectRefFromSupabaseUrl(supabaseApiUrl);
  if (fromHostedUrl) return fromHostedUrl;
  if (isLocalSupabaseHost(supabaseApiUrl)) return 'local';
  const fromId = (import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined)?.trim();
  if (fromId) return fromId;
  throw new Error(
    'Missing Supabase config: set VITE_SUPABASE_URL (or VITE_SUPABASE_PROJECT_ID) and VITE_SUPABASE_ANON_KEY',
  );
}

function requireAnonKey(): string {
  const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();
  if (!key) {
    throw new Error(
      'Missing Supabase config: set VITE_SUPABASE_URL (or VITE_SUPABASE_PROJECT_ID) and VITE_SUPABASE_ANON_KEY',
    );
  }
  return key;
}

/**
 * Supabase API origin (Auth, REST, Storage, Realtime, Functions root).
 * From `VITE_SUPABASE_URL`, or `https://${VITE_SUPABASE_PROJECT_ID}.supabase.co` when URL is unset.
 */
export const supabaseUrl: string = resolveSupabaseUrl();

/** Edge Functions base: `{supabaseUrl}/functions/v1` */
export const functionsUrl: string = `${supabaseUrl}/functions/v1`;

/**
 * Supabase project ref (subdomain), e.g. `abcd` for https://abcd.supabase.co.
 * Local stack uses the fixed id `local`.
 */
export const projectId: string = resolveProjectId(supabaseUrl);

/**
 * Supabase anon (public) key — safe to expose in the browser; still prefer env in production.
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
