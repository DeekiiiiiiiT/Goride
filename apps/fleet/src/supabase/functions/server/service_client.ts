/**
 * Shared service-role Supabase client factory.
 * Wave 5: Platform DRY — single cached client for money controllers.
 *
 * Usage:
 *   import { getServiceClient } from "./service_client.ts";
 *   const client = getServiceClient();
 */
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.49.8";

let _cachedClient: SupabaseClient | null = null;

/**
 * Returns a cached service-role Supabase client.
 * Creates one on first call; reuses it thereafter.
 */
export function getServiceClient(): SupabaseClient {
  if (!_cachedClient) {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) {
      throw new Error(
        "[ServiceClient] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — cannot create service client"
      );
    }
    _cachedClient = createClient(url, key);
  }
  return _cachedClient;
}

/**
 * Returns a service-role client scoped to a specific schema.
 * NOT cached — use sparingly for schema-specific queries (e.g., rides schema).
 */
export function getServiceClientWithSchema(schema: string): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error(
      `[ServiceClient] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — cannot create ${schema} client`
    );
  }
  return createClient(url, key, { db: { schema } });
}
