import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '@roam/api-client';

const supabaseUrl = `https://${projectId}.supabase.co`;

const roamFetch: typeof fetch = (url, options) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 15000);

  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(id),
  );
};

function createRoamAuthClient(storageKey: string): SupabaseClient {
  return createClient(supabaseUrl, publicAnonKey, {
    auth: {
      storageKey,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
    global: { fetch: roamFetch },
  });
}

/**
 * Driver consumer app (`/`). Isolated from admin so signing in as a driver
 * does not replace the admin session on the same host (e.g. localhost:3002).
 */
export const supabaseDriverApp = createRoamAuthClient(`sb-${projectId}-auth-driver`);

/**
 * Driver admin portal (`/admin`). Isolated from the driver app session.
 */
export const supabaseDriverAdmin = createRoamAuthClient(`sb-${projectId}-auth-admin`);

/**
 * Roam Haul consumer app (`/`). Isolated from haul admin and other Roam apps.
 */
export const supabaseHaulApp = createRoamAuthClient(`sb-${projectId}-auth-haul`);

/**
 * Roam Haul admin portal (`/admin`).
 */
export const supabaseHaulAdmin = createRoamAuthClient(`sb-${projectId}-auth-haul-admin`);

/**
 * Roam Dash Courier app. Isolated from other Roam consumer sessions.
 */
export const supabaseCourierApp = createRoamAuthClient(`sb-${projectId}-auth-courier`);

/**
 * Roam Dash Courier admin portal (`/admin`). Isolated from the courier app session.
 */
export const supabaseCourierAdmin = createRoamAuthClient(`sb-${projectId}-auth-courier-admin`);

/** Default export for packages that expect a single client (driver app surface). */
export const supabase = supabaseDriverApp;
