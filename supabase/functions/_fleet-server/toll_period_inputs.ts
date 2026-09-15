/**
 * Toll / dispute loaders used by driver financial period rebuild.
 * Kept out of toll_controller.tsx so Deno-checking fuel_period_routes does not
 * pull the entire toll HTTP megafile (N-9b / fuel Deno CI).
 */
import { filterByOrg } from "./org_scope.ts";
import {
  getTollContext,
  resolveTollOrgId,
  tollOrgSqlFilters,
} from "./toll_org_context.ts";
import { fromKvStore } from "./fleet_sql_bridge.ts";
import { isTollCategory } from "./toll_category_flags.ts";

/** Structural ledger row for merge / tx-shape (full shape lives in toll_controller). */
export type TollPeriodLedgerRow = {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  vehicleId?: string | null;
  vehiclePlate?: string | null;
  driverId?: string | null;
  driverName?: string | null;
  tollTagId?: string | null;
  tagNumber?: string | null;
  plaza?: string | null;
  plazaId?: string | null;
  highway?: string | null;
  location?: string | null;
  date?: string;
  time?: string | null;
  type?: string;
  amount?: number;
  paymentMethod?: string;
  status?: string;
  resolution?: string | null;
  isReconciled?: boolean;
  tripId?: string | null;
  matchConfidence?: number | null;
  matchedAt?: string | null;
  matchedBy?: string | null;
  batchId?: string | null;
  batchName?: string | null;
  importedAt?: string | null;
  sourceFile?: string | null;
  receiptUrl?: string | null;
  referenceNumber?: string | null;
  description?: string | null;
  notes?: string | null;
  auditTrail?: unknown[];
  metadata?: Record<string, unknown>;
  matchStatus?: string;
  matchedTripId?: string | null;
  matchTypeCode?: string | null;
  claimId?: string | null;
  workflowStage?: string;
  unlinkedSourceTripId?: string | null;
  unlinkedSourcePlatform?: string | null;
  unlinkedAppliedAt?: string | null;
  unlinkedAppliedBy?: string | null;
  preUnlinkedTripId?: string | null;
  rateScheduleVersionId?: string | null;
  officialAmount?: number | null;
  officialEffectiveFrom?: string | null;
  [key: string]: unknown;
};

/**
 * Paginated loader that fetches ALL rows matching a key prefix.
 * Prefer native fleet SQL with organization_id when Context is bound.
 */
export async function loadAllByPrefix(prefix: string): Promise<any[]> {
  const ctx = getTollContext();
  const orgId = resolveTollOrgId(ctx);
  const orgFilters = tollOrgSqlFilters(orgId);

  try {
    const { domainForPrefix, iterateFleet } = await import("./repos/baseRepo.ts");
    const def = domainForPrefix(prefix);
    if (def) {
      const legacyPrefix = prefix.endsWith(":") ? prefix : `${prefix}:`;
      const out: any[] = [];
      for await (const row of iterateFleet(def.domain, {
        legacyPrefix,
        order: { col: "legacy_kv_id", ascending: true },
        filters: orgFilters.length ? orgFilters : undefined,
      })) {
        out.push(row);
      }
      return ctx
        ? (filterByOrg(out as Record<string, unknown>[], ctx, {
            endpoint: `loadAllByPrefix:${prefix}`,
          }) as any[])
        : out;
    }
  } catch (e: any) {
    console.warn(
      `[TollOrg] loadAllByPrefix SQL path failed for ${prefix}, falling back: ${e?.message || e}`,
    );
  }

  const PAGE_SIZE = 1000;
  const allValues: any[] = [];
  const seenKeys = new Set<string>();
  const seenIds = new Set<string>();
  let offset = 0;

  while (true) {
    const { data, error } = await fromKvStore()
      .select("key, value")
      .like("key", `${prefix}%`)
      .order("key", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw error;
    const rows = (Array.isArray(data) ? data : []) as Array<{ key?: string; value?: any }>;
    for (const row of rows) {
      const key = String(row.key || "");
      if (key && seenKeys.has(key)) continue;
      if (key) seenKeys.add(key);
      const value = row.value;
      if (!value) continue;
      const id = value?.id != null ? String(value.id) : "";
      if (id && seenIds.has(id)) continue;
      if (id) seenIds.add(id);
      allValues.push(value);
    }

    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return ctx
    ? (filterByOrg(allValues as Record<string, unknown>[], ctx, {
        endpoint: `loadAllByPrefix:${prefix}`,
      }) as any[])
    : allValues;
}

/**
 * Reconciliation processes toll USAGE only. Tag-ledger credits stay out of the wizard.
 */
export function isReconcilableTollExpense(tx: any): boolean {
  const type = String(tx?.type || "").toLowerCase().replace("-", "_");
  if (
    type === "top_up" ||
    type === "refund" ||
    type === "adjustment" ||
    type === "balance_transfer"
  ) {
    return false;
  }
  const category = String(tx?.category || "").toLowerCase().trim();
  return category !== "toll top-up" && category !== "toll refund" && category !== "toll adjustment";
}

/** Convert a ledger row to the legacy transaction shape. */
export function tollLedgerToTxShape(entry: TollPeriodLedgerRow): any {
  let status = "Pending";
  if (entry.status === "voided" || entry.metadata?.voided === true) status = "Voided";
  else if (entry.status === "approved" || entry.status === "resolved") status = "Approved";
  else if (entry.status === "rejected") status = "Rejected";
  else if (entry.status === "reconciled") status = "Approved";
  else if (entry.status === "pending") status = "Pending";

  let category = "Toll Usage";
  if (entry.type === "top_up") category = "Toll Top-up";
  else if (entry.type === "refund") category = "Toll Refund";
  else if (entry.type === "adjustment" || entry.type === "balance_transfer") {
    category = "Toll Adjustment";
  }

  return {
    id: entry.id,
    date: entry.date,
    time: entry.time,
    amount: entry.amount,
    type: entry.type === "usage" ? "Usage" : entry.type === "top_up" ? "Top-up" : "Refund",
    category,
    description: entry.description || entry.location || entry.plaza || "",
    vendor: entry.plaza || entry.location || "",
    vehicleId: entry.vehicleId,
    vehiclePlate: entry.vehiclePlate,
    driverId: entry.driverId,
    driverName: entry.driverName,
    referenceNumber: entry.referenceNumber || entry.metadata?.referenceNumber || null,
    paymentMethod: entry.paymentMethod === "cash" ? "Cash" :
                   entry.paymentMethod === "card" ? "Card" :
                   entry.paymentMethod === "fleet_account" ? "Fleet Account" : "Tag Balance",
    status,
    isReconciled: !!(
      entry.status === "voided" ||
      entry.metadata?.voided === true ||
      entry.isReconciled ||
      entry.status === "reconciled" ||
      entry.status === "resolved" ||
      entry.resolution ||
      entry.tripId
    ),
    resolution: entry.resolution ?? null,
    tripId: entry.tripId,
    receiptUrl: entry.receiptUrl,
    notes: entry.notes,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    workflowStage: entry.workflowStage,
    claimId: entry.claimId,
    matchStatus: entry.matchStatus,
    matchedTripId: entry.matchedTripId ?? null,
    matchTypeCode: entry.matchTypeCode ?? null,
    isAmbiguous: entry.metadata?.isAmbiguous === true || entry.matchStatus === "ambiguous",
    unlinkedSourceTripId: entry.unlinkedSourceTripId ?? null,
    unlinkedSourcePlatform: entry.unlinkedSourcePlatform ?? null,
    unlinkedAppliedAt: entry.unlinkedAppliedAt ?? null,
    unlinkedAppliedBy: entry.unlinkedAppliedBy ?? null,
    preUnlinkedTripId: entry.preUnlinkedTripId ?? null,
    plaza: entry.plaza,
    plazaId: entry.plazaId ?? null,
    rateScheduleVersionId: entry.rateScheduleVersionId ?? null,
    officialAmount: entry.officialAmount ?? null,
    officialEffectiveFrom: entry.officialEffectiveFrom ?? null,
    batchId: entry.batchId,
    metadata: {
      tollTagId: entry.tollTagId,
      tagNumber: entry.tagNumber,
      highway: entry.highway,
      plaza: entry.plaza,
      batchName: entry.batchName,
      importedAt: entry.importedAt,
      sourceFile: entry.sourceFile,
      matchConfidence: entry.matchConfidence,
      matchedAt: entry.matchedAt,
      matchedBy: entry.matchedBy,
      resolution: entry.resolution,
      autoMatchOverridden: entry.metadata?.autoMatchOverridden,
      unlinkedSourceTripId: entry.unlinkedSourceTripId,
      unlinkedSourcePlatform: entry.unlinkedSourcePlatform,
      unlinkedAppliedAt: entry.unlinkedAppliedAt,
      unlinkedAppliedBy: entry.unlinkedAppliedBy,
      preUnlinkedTripId: entry.preUnlinkedTripId,
      ...entry.metadata,
      ledgerPlaza: entry.plaza,
      batchId: entry.batchId ?? entry.metadata?.batchId ?? null,
      auditTrail: entry.auditTrail ?? entry.metadata?.auditTrail,
      merchantHighway:
        entry.highway ||
        entry.metadata?.merchantHighway ||
        (entry.plaza && /trans\s*jam|jamaican\s*highways/i.test(String(entry.plaza))
          ? entry.plaza
          : entry.metadata?.merchantHighway),
    },
  };
}

/** Merge ledger + legacy toll transactions (ledger wins by id). */
export function mergeTollLedgerAndLegacyTx(
  ledgerEntries: TollPeriodLedgerRow[],
  legacyTollTx: any[],
): any[] {
  const byId = new Map<string, any>();
  for (const e of ledgerEntries) {
    const tx = tollLedgerToTxShape(e);
    if (tx?.id != null && String(tx.id) !== "") byId.set(String(tx.id), tx);
  }
  for (const tx of legacyTollTx || []) {
    if (!tx || typeof tx !== "object") continue;
    if (!isTollCategory(tx.category)) continue;
    const id = tx.id;
    if (id == null || id === "") continue;
    const sid = String(id);
    const existing = byId.get(sid);
    if (!existing) {
      byId.set(sid, tx);
      continue;
    }
    const legacyTripId = tx.tripId ?? tx.metadata?.tripId ?? null;
    if (legacyTripId && !existing.tripId && !existing.metadata?.tripId) {
      existing.tripId = String(legacyTripId);
      existing.metadata = { ...(existing.metadata || {}), tripId: String(legacyTripId) };
    }
    const legacyPre = tx.preUnlinkedTripId ?? tx.metadata?.preUnlinkedTripId ?? null;
    if (legacyPre && !existing.preUnlinkedTripId && !existing.metadata?.preUnlinkedTripId) {
      existing.preUnlinkedTripId = String(legacyPre);
      existing.metadata = {
        ...(existing.metadata || {}),
        preUnlinkedTripId: String(legacyPre),
      };
    }
  }
  return Array.from(byId.values());
}

/**
 * Driver-scoped rebuild loader — never dumps the whole fleet into Expenses rebuild.
 */
export async function loadTollLedgerWithTripsForDrivers(
  driverIds: string[],
): Promise<{ tollTx: any[]; trips: any[] }> {
  const ids = [...new Set(driverIds.map(String).filter(Boolean))];
  if (!ids.length) return { tollTx: [], trips: [] };

  const { iterateFleet } = await import("./repos/baseRepo.ts");
  const tollRows: TollPeriodLedgerRow[] = [];
  const tripRows: any[] = [];
  const legacyTollTx: any[] = [];

  await Promise.all([
    (async () => {
      for await (const row of iterateFleet("toll_ledger", {
        filters: [{ op: "in", col: "driver_id", value: ids }],
        order: { col: "date", ascending: true },
      })) {
        tollRows.push(row as TollPeriodLedgerRow);
      }
    })(),
    (async () => {
      for await (const row of iterateFleet("trips", {
        filters: [{ op: "in", col: "driver_id", value: ids }],
        order: { col: "date", ascending: true },
      })) {
        tripRows.push(row);
      }
    })(),
    (async () => {
      for await (const row of iterateFleet("transactions", {
        filters: [{ op: "in", col: "driver_id", value: ids }],
        order: { col: "date", ascending: true },
      })) {
        if (isTollCategory((row as { category?: string }).category)) legacyTollTx.push(row);
      }
    })(),
  ]);

  return {
    tollTx: mergeTollLedgerAndLegacyTx(tollRows, legacyTollTx),
    trips: tripRows.filter(Boolean),
  };
}

/** Support adjustments (`dispute-refund:*`), excluding dedup index keys. */
export async function loadDisputeRefundRecords(): Promise<any[]> {
  const raw = await loadAllByPrefix("dispute-refund:");
  return (raw || []).filter(
    (item: any) => item && typeof item === "object" && item.id && item.supportCaseId,
  );
}

export function filterByDriver(
  items: any[],
  driverId?: string,
  driverAliasMap?: Map<string, string>,
): any[] {
  if (!driverId) return items;
  if (!driverAliasMap) return items.filter((item: any) => item.driverId === driverId);
  const canonical = driverAliasMap.get(driverId) ?? driverId;
  return items.filter((item: any) => {
    const id = item.driverId;
    if (!id) return false;
    return (driverAliasMap.get(id) ?? id) === canonical;
  });
}

/** Trips already consuming a platform refund via a confirmed toll link (tripId). */
export function collectLinkedTripIds(tollTx: any[]): Set<string> {
  const ids = new Set<string>();
  for (const tx of tollTx || []) {
    if (!tx) continue;
    const tripId = tx.tripId ?? tx.metadata?.tripId ?? null;
    if (tripId) ids.add(String(tripId));
    const preUnlinkedTripId = tx.preUnlinkedTripId ?? tx.metadata?.preUnlinkedTripId ?? null;
    if (preUnlinkedTripId) ids.add(String(preUnlinkedTripId));
  }
  return ids;
}

/** Matcher windows are request−45 → dropoff+15; ±2 calendar days covers TZ edges. */
const RECON_TRIP_MATCH_PAD_DAYS = 2;

function shiftYmdUtc(ymd: string, days: number): string {
  const d = new Date(`${String(ymd).slice(0, 10)}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return String(ymd).slice(0, 10);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function findTollsLinkedToTripIds(tripIds: string[]): Promise<TollPeriodLedgerRow[]> {
  const ids = [...new Set(tripIds.map(String).filter(Boolean))];
  if (!ids.length) return [];
  const { iterateFleet } = await import("./repos/baseRepo.ts");
  const out: TollPeriodLedgerRow[] = [];
  const CHUNK = 100;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    for await (const row of iterateFleet("toll_ledger", {
      filters: [{ op: "in", col: "trip_id", value: chunk }],
      order: { col: "legacy_kv_id", ascending: true },
    })) {
      out.push(row as TollPeriodLedgerRow);
    }
  }
  return out;
}

async function loadLegacyTollTxInDateRange(fromYmd: string, toYmd: string): Promise<any[]> {
  const { iterateFleet } = await import("./repos/baseRepo.ts");
  const out: any[] = [];
  for await (const row of iterateFleet("transactions", {
    dateFrom: fromYmd,
    dateTo: toYmd,
    order: { col: "date", ascending: true },
  })) {
    if (isTollCategory((row as { category?: string }).category)) out.push(row);
  }
  return out;
}

/**
 * Week-scoped load for seal / wizard — date-ranged tolls + trips (no full fleet dump).
 */
export async function loadTollLedgerWithTripsInRange(
  from?: string,
  to?: string,
): Promise<{ tollTx: any[]; trips: any[] }> {
  const fromDay = from ? String(from).slice(0, 10) : undefined;
  const toDay = to ? String(to).slice(0, 10) : undefined;
  if (!fromDay && !toDay) {
    return { tollTx: [], trips: [] };
  }

  const { findTollsInDateRange, findTripsInDateRange } = await import("./toll_match_index.ts");

  const tollFrom = fromDay ?? toDay!;
  const tollTo = toDay ?? fromDay!;
  const tripFrom = shiftYmdUtc(tollFrom, -RECON_TRIP_MATCH_PAD_DAYS);
  const tripTo = shiftYmdUtc(tollTo, RECON_TRIP_MATCH_PAD_DAYS);

  const [tollsInRange, trips, legacyInRange] = await Promise.all([
    findTollsInDateRange(tollFrom, tollTo),
    findTripsInDateRange(tripFrom, tripTo),
    loadLegacyTollTxInDateRange(tollFrom, tollTo),
  ]);
  const tripList = (trips || []).filter(Boolean);
  const linkedExtra = await findTollsLinkedToTripIds(
    tripList.map((t: any) => String(t?.id || "")).filter(Boolean),
  );

  const ledgerById = new Map<string, TollPeriodLedgerRow>();
  for (const e of [...(tollsInRange || []), ...linkedExtra] as TollPeriodLedgerRow[]) {
    if (e?.id != null && String(e.id) !== "") ledgerById.set(String(e.id), e);
  }

  return {
    tollTx: mergeTollLedgerAndLegacyTx([...ledgerById.values()], legacyInRange),
    trips: tripList,
  };
}

/** Prefer week-scoped SQL when from/to are passed (Close Week / seal). */
export async function loadTollLedgerWithTrips(
  from?: string,
  to?: string,
): Promise<{ tollTx: any[]; trips: any[] }> {
  if (from || to) return loadTollLedgerWithTripsInRange(from, to);
  return { tollTx: [], trips: [] };
}
