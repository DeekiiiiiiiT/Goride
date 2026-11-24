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

/**
 * The browser key. `VITE_SUPABASE_PUBLISHABLE_KEY` (sb_publishable_…) is the rotated key;
 * `VITE_SUPABASE_ANON_KEY` stays as the fallback so an app keeps working before its Vercel
 * environment is switched. Both are public by design — they ship in the bundle.
 */
function resolvePublicKey(): string {
  const publishable = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim();
  const legacy = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();
  const key = publishable || legacy;
  if (!key) {
    throw new Error(
      'Missing Supabase config: set VITE_SUPABASE_URL (or VITE_SUPABASE_PROJECT_ID) and VITE_SUPABASE_PUBLISHABLE_KEY (or the legacy VITE_SUPABASE_ANON_KEY)',
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
 * Supabase public (browser) key — safe to expose in the browser; still prefer env in production.
 * Holds either the rotated `sb_publishable_…` key or the legacy anon JWT, whichever is configured.
 */
export const publicAnonKey: string = resolvePublicKey();

/**
 * A rotated publishable/secret key is opaque (`sb_publishable_…` / `sb_secret_…`), not a JWT.
 * Only a legacy key (`eyJ…`) may be sent as `Authorization: Bearer`.
 */
export function isLegacyJwtKey(key: string): boolean {
  return key.startsWith('eyJ');
}

/**
 * Supabase Edge Functions need `apikey` on every call; `Authorization` belongs to the caller's
 * session, not to the project key. The legacy anon JWT is still sent as Bearer because some
 * functions read it, but a publishable key is kept to `apikey` only — sending it as a Bearer
 * would present an opaque string where the gateway and PostgREST expect a token.
 * Merge `extra` for Content-Type, etc.
 */
export function supabaseAnonFunctionHeaders(
  extra?: Record<string, string>,
): Record<string, string> {
  return {
    apikey: publicAnonKey,
    ...(isLegacyJwtKey(publicAnonKey) ? { Authorization: `Bearer ${publicAnonKey}` } : {}),
    ...extra,
  };
}
