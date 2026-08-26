/**
 * Per-plaza toll aggregates, read from the `fleet.v_toll_plaza_stats` SQL view.
 *
 * Plazas used to ship a zero-initialised `stats` object that nothing ever
 * updated, so every plaza on the Toll Database page showed 0 transactions and
 * J$0 spend regardless of its actual traffic. The numbers now come from the
 * ledger itself.
 */
import { getServiceClientWithSchema } from "./service_client.ts";

export interface TollPlazaStats {
  totalTransactions: number;
  totalSpend: number;
  avgAmount: number;
  lastTransactionDate: string;
  lastUpdated: string;
}

export const EMPTY_PLAZA_STATS: TollPlazaStats = {
  totalTransactions: 0,
  totalSpend: 0,
  avgAmount: 0,
  lastTransactionDate: '',
  lastUpdated: '',
};

interface StatsRow {
  organization_id: string | null;
  plaza_id: string | null;
  total_transactions: number | string | null;
  total_spend: number | string | null;
  avg_amount: number | string | null;
  last_transaction_date: string | null;
  last_updated: string | null;
}

function toNumber(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Shape a raw view row into the client-facing stats object. */
export function statsRowToPlazaStats(row: StatsRow): TollPlazaStats {
  return {
    totalTransactions: toNumber(row.total_transactions),
    totalSpend: toNumber(row.total_spend),
    avgAmount: Number(toNumber(row.avg_amount).toFixed(2)),
    lastTransactionDate: row.last_transaction_date || '',
    lastUpdated: row.last_updated || '',
  };
}

/**
 * Attach live stats to each plaza. Plazas with no ledger activity get an
 * explicit zero record so the UI can say "no traffic yet" rather than blank.
 */
export function attachPlazaStats<T extends { id?: string }>(
  plazas: T[],
  statsByPlazaId: Map<string, TollPlazaStats>,
): T[] {
  return plazas.map((p) => ({
    ...p,
    stats: (p.id && statsByPlazaId.get(p.id)) || EMPTY_PLAZA_STATS,
  }));
}

/** Load per-plaza stats for one organisation, keyed by plaza id. */
export async function loadTollPlazaStats(
  organizationId?: string | null,
): Promise<Map<string, TollPlazaStats>> {
  const map = new Map<string, TollPlazaStats>();
  try {
    const db = getServiceClientWithSchema("fleet");
    let query = db.from("v_toll_plaza_stats").select("*");
    if (organizationId) query = query.eq("organization_id", organizationId);

    const { data, error } = await query;
    if (error) throw error;

    for (const row of (data || []) as StatsRow[]) {
      if (!row.plaza_id) continue;
      map.set(row.plaza_id, statsRowToPlazaStats(row));
    }
  } catch (e: any) {
    // Stats are decorative next to the plaza record itself — never fail the list.
    console.log(`[TollPlazaStats] Failed to load stats: ${e?.message || e}`);
  }
  return map;
}
