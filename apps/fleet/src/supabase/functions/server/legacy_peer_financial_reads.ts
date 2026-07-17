/**
 * Peer KV financial sources are retired as money SSOT.
 * Tabs must use driver_financial_periods / financial_events.
 * These helpers exist only for temporary operational/debug reads.
 */
export const LEGACY_PEER_FINANCIAL_READS_ENABLED = false;

export type LegacyPeerSource =
  | "transaction"
  | "ledger_event"
  | "finalized_report"
  | "toll_ledger_kv_mirror";

/** Guard for accidental peer-money reads in new code paths. */
export function assertLegacyPeerReadAllowed(source: LegacyPeerSource, reason: string): void {
  if (LEGACY_PEER_FINANCIAL_READS_ENABLED) return;
  console.warn(
    `[LegacyPeerFinancial] blocked peer money read source=${source} reason=${reason} — use driver_financial_periods`,
  );
}
