/**
 * Rush journals live in public. A delivery-schema client cannot see rush_post_journal.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type JournalRpc = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  schema: (name: string) => {
    from: (table: string) => {
      upsert: (row: Record<string, unknown>, opts: { onConflict: string }) => Promise<{ error: { message: string } | null }>;
    };
  };
};

export function publicJournalClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export async function postRushJournal(
  db: JournalRpc,
  args: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await db.rpc("rush_post_journal", args);
  if (!error) return { ok: true };
  const key = String(args.p_idempotency_key || "journal");
  await db.schema("rush_money").from("recon_exceptions").upsert({
    source: "cancel_journal",
    reference: key,
    detail: error.message,
  }, { onConflict: "source,reference" });
  console.error("[rush-money] journal", key, error.message);
  return { ok: false, error: error.message };
}
