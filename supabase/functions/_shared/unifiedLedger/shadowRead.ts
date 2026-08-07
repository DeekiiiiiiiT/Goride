/**
 * Phase B shadow read — compare legacy vs unified without changing the HTTP response.
 * Grep logs: event":"unified_shadow_read"
 */
import { isLedgerShadowIslandEnabled } from "./flags.ts";
import { unifiedLedgerClient } from "./postEntry.ts";

export type ShadowReadInput = {
  island: string;
  legacyCount: number;
  legacyAmountMinor?: number;
  /** Sample source ids / idempotency keys from legacy for mismatch sampling */
  sampleKeys?: string[];
  window?: { from?: string; to?: string };
};

export type ShadowReadResult = {
  status: "ok" | "skipped" | "fail" | "drift";
  island: string;
  legacy_count: number;
  unified_count: number;
  delta_count: number;
  legacy_amount_minor: number | null;
  unified_amount_minor: number | null;
  delta_amount_minor: number | null;
  sample_mismatches: string[];
};

function logShadow(payload: Record<string, unknown>): void {
  console.log(JSON.stringify({
    event: "unified_shadow_read",
    ts: new Date().toISOString(),
    ...payload,
  }));
}

/** Fire-and-forget safe wrapper for call sites. */
export function shadowCompareAsync(input: ShadowReadInput): void {
  if (!isLedgerShadowIslandEnabled(input.island)) return;
  void shadowCompare(input).catch((e) => {
    logShadow({
      island: input.island,
      status: "fail",
      reason: e instanceof Error ? e.message : String(e),
    });
  });
}

export async function shadowCompare(input: ShadowReadInput): Promise<ShadowReadResult> {
  if (!isLedgerShadowIslandEnabled(input.island)) {
    const skipped: ShadowReadResult = {
      status: "skipped",
      island: input.island,
      legacy_count: input.legacyCount,
      unified_count: 0,
      delta_count: 0,
      legacy_amount_minor: input.legacyAmountMinor ?? null,
      unified_amount_minor: null,
      delta_amount_minor: null,
      sample_mismatches: [],
    };
    return skipped;
  }

  const client = unifiedLedgerClient();
  let rq = client
    .from("ledger_source_receipts")
    .select("source_id, ledger_entry_id", { count: "exact" })
    .eq("source_system", input.island);

  const { data: receipts, error, count } = await rq.limit(5000);
  if (error) {
    logShadow({ island: input.island, status: "fail", reason: error.message });
    return {
      status: "fail",
      island: input.island,
      legacy_count: input.legacyCount,
      unified_count: 0,
      delta_count: -input.legacyCount,
      legacy_amount_minor: input.legacyAmountMinor ?? null,
      unified_amount_minor: null,
      delta_amount_minor: null,
      sample_mismatches: [],
    };
  }

  const unifiedCount = count ?? (receipts?.length ?? 0);
  const deltaCount = unifiedCount - input.legacyCount;

  let unifiedAmount: number | null = null;
  if (input.legacyAmountMinor !== undefined && receipts && receipts.length > 0) {
    const entryIds = receipts
      .map((r: { ledger_entry_id: string }) => r.ledger_entry_id)
      .slice(0, 1000);
    const { data: entries } = await client
      .from("ledger_entries")
      .select("amount_minor")
      .in("id", entryIds);
    unifiedAmount = (entries ?? []).reduce(
      (s: number, e: { amount_minor: number }) => s + Math.abs(e.amount_minor ?? 0),
      0,
    );
  }

  const receiptIds = new Set(
    (receipts ?? []).map((r: { source_id: string }) => String(r.source_id)),
  );
  const sampleMismatches = (input.sampleKeys ?? [])
    .filter((k) => !receiptIds.has(k))
    .slice(0, 10);

  const deltaAmount =
    input.legacyAmountMinor !== undefined && unifiedAmount !== null
      ? unifiedAmount - Math.abs(input.legacyAmountMinor)
      : null;

  const status: ShadowReadResult["status"] =
    deltaCount === 0 && (deltaAmount === null || deltaAmount === 0) ? "ok" : "drift";

  const result: ShadowReadResult = {
    status,
    island: input.island,
    legacy_count: input.legacyCount,
    unified_count: unifiedCount,
    delta_count: deltaCount,
    legacy_amount_minor: input.legacyAmountMinor ?? null,
    unified_amount_minor: unifiedAmount,
    delta_amount_minor: deltaAmount,
    sample_mismatches: sampleMismatches,
  };

  logShadow(result);
  return result;
}
