import type { SupabaseClient } from '@supabase/supabase-js';

let dispatchAuthClient: SupabaseClient | null = null;

export function setDispatchAuthClient(client: SupabaseClient): void {
  dispatchAuthClient = client;
}

export function getDispatchAuthClient(): SupabaseClient {
  if (!dispatchAuthClient) {
    throw new Error('Dispatch auth client not configured. Call setDispatchAuthClient() at app startup.');
  }
  return dispatchAuthClient;
}
