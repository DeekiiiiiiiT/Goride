/**
 * Keep island recon honest when legacy KV money rows are intentionally deleted.
 * Unified entries can remain as historical book; source_receipts must not outlive
 * the island row they were dual-written for (otherwise unified_count drifts +N).
 */
import { unifiedLedgerClient } from "./postEntry.ts";

export async function deleteUnifiedSourceReceipts(opts: {
  sourceSystem: string;
  sourceIds?: string[];
  sourceIdempotencyKeys?: string[];
}): Promise<number> {
  const ids = [...new Set((opts.sourceIds ?? []).map((s) => String(s).trim()).filter(Boolean))];
  const idems = [
    ...new Set((opts.sourceIdempotencyKeys ?? []).map((s) => String(s).trim()).filter(Boolean)),
  ];
  if (!ids.length && !idems.length) return 0;

  const client = unifiedLedgerClient();
  const { data, error } = await client.rpc("ledger_delete_source_receipts", {
    p_source_system: opts.sourceSystem,
    p_source_ids: ids.length ? ids : null,
    p_source_idempotency_keys: idems.length ? idems : null,
  });
  if (error) {
    console.error("[unifiedLedger] ledger_delete_source_receipts failed:", error.message);
    return 0;
  }
  const deleted = Number((data as { deleted?: number } | null)?.deleted ?? 0);
  if (deleted > 0) {
    console.log(
      JSON.stringify({
        event: "unified_source_receipts_deleted",
        source_system: opts.sourceSystem,
        deleted,
        source_ids: ids.length,
        idem_keys: idems.length,
      }),
    );
  }
  return deleted;
}

export async function hasUnifiedSourceReceipt(
  sourceSystem: string,
  sourceId: string,
): Promise<boolean> {
  const client = unifiedLedgerClient();
  const { count, error } = await client
    .from("ledger_source_receipts")
    .select("id", { count: "exact", head: true })
    .eq("source_system", sourceSystem)
    .eq("source_id", sourceId);
  if (error) {
    console.error("[unifiedLedger] receipt exists check failed:", error.message);
    return false;
  }
  return (count ?? 0) > 0;
}
