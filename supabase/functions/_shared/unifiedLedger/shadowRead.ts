/**
 * Phase B shadow read — compare legacy vs unified without changing the HTTP response.
 * Grep logs: event":"unified_shadow_read"
 * L-13: when on, uses count(*) in SQL — no 5k row fetch.
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
    return {
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
  }

  const client = unifiedLedgerClient();
  // Count only — never fetch receipt rows (L-13).
  const { count, error } = await client
    .from("ledger_source_receipts")
    .select("id", { count: "exact", head: true })
    .eq("source_system", input.island);

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

  const unifiedCount = count ?? 0;
  const deltaCount = unifiedCount - input.legacyCount;
  const status: ShadowReadResult["status"] =
    deltaCount === 0 ? "ok" : "drift";

  const result: ShadowReadResult = {
    status,
    island: input.island,
    legacy_count: input.legacyCount,
    unified_count: unifiedCount,
    delta_count: deltaCount,
    legacy_amount_minor: input.legacyAmountMinor ?? null,
    unified_amount_minor: null,
    delta_amount_minor: null,
    sample_mismatches: [],
  };
  logShadow(result as unknown as Record<string, unknown>);
  return result;
}
