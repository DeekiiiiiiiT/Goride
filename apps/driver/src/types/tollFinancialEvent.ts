/**
 * Unified Toll Financial Events — canonical READ model (IDEA 2).
 * Pure types + mappers; safe to import from client, Vitest, and Deno edge.
 */

export const TOLL_FINANCIAL_EVENT_SCHEMA_VERSION = 1 as const;

/** Hard cap for unified-events API (Phase 10). */
export const TOLL_UNIFIED_EVENTS_MAX_LIMIT = 500;

export type TollEventKind =
  | "plaza_toll"
  | "legacy_transaction_toll"
  | "unlinked_refund_signal"
  | "dispute_adjustment";

export type TollEventWorkflowState =
  | "matched"
  | "unmatched"
  | "approved"
  | "rejected"
  | "unlinked_refund"
  | "dispute_matched"
  | "dispute_unmatched";

export type TollEventSourceSystem =
  | "toll_ledger"
  | "legacy_transaction"
  | "trip"
  | "dispute_refund";

export interface TollFinancialEventRawRef {
  store: "toll_ledger" | "transaction" | "trip" | "dispute-refund";
  id: string;
}

export interface TollFinancialEvent {
  schemaVersion: typeof TOLL_FINANCIAL_EVENT_SCHEMA_VERSION;
  eventId: string;
  kind: TollEventKind;
  /** Short human-readable label for tables and CSV */
  kindLabel: string;
  sourceSystem: TollEventSourceSystem;
  amount: number;
  currency: string;
  driverId: string;
  driverName?: string;
  /** Primary sort timestamp (ISO 8601) */
  occurredAt: string;
  importedAt?: string;
  reconciledAt?: string;
  batchId?: string;
  tripId?: string;
  matchedTollId?: string;
  workflowState: TollEventWorkflowState;
  description?: string;
  rawRef: TollFinancialEventRawRef;
}

export interface TollUnifiedEventsMeta {
  schemaVersion: typeof TOLL_FINANCIAL_EVENT_SCHEMA_VERSION;
  limit: number;
  offset: number;
  total: number;
  sourcesIncluded: Partial<Record<TollEventSourceSystem, number>>;
  droppedDuplicatesCount: number;
  durationMs?: number;
}

export function tollKindLabel(kind: TollEventKind): string {
  switch (kind) {
    case "plaza_toll":
      return "Plaza toll (ledger)";
    case "legacy_transaction_toll":
      return "Toll (legacy import)";
    case "unlinked_refund_signal":
      return "Unlinked trip refund";
    case "dispute_adjustment":
      return "Uber support adjustment";
    default:
      return String(kind);
  }
}

function isoFromTxDate(tx: any): string {
  const raw = tx?.date;
  if (!raw || typeof raw !== "string") return new Date(0).toISOString();
  if (raw.includes("T")) {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();
  }
  const time = (tx?.time && String(tx.time).trim()) || "12:00:00";
  const combined = `${raw}T${time}`;
  const d = new Date(combined);
  return isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();
}

function deriveTollWorkflowState(tx: any): TollEventWorkflowState {
  if (tx?.isReconciled && tx?.tripId) return "matched";
  const s = String(tx?.status || "").toLowerCase();
  if (s === "rejected") return "rejected";
  if (s === "approved") return "approved";
  return "unmatched";
}

/**
 * Map a merged toll row (ledger-shaped) to a canonical event.
 * @param ledgerIds - ids present in toll_ledger (not legacy-only tx)
 */
export function mapMergedTollTxToEvent(tx: any, ledgerIds: Set<string>): TollFinancialEvent | null {
  if (!tx || typeof tx !== "object") return null;
  const id = tx.id != null ? String(tx.id) : "";
  if (!id) return null;

  const fromLedger = ledgerIds.has(id);
  const kind: TollEventKind = fromLedger ? "plaza_toll" : "legacy_transaction_toll";
  const sourceSystem: TollEventSourceSystem = fromLedger ? "toll_ledger" : "legacy_transaction";

  const md = tx.metadata && typeof tx.metadata === "object" ? tx.metadata : {};
  const batchId =
    (typeof md.batchId === "string" && md.batchId) ||
    (typeof tx.batchId === "string" && tx.batchId) ||
    undefined;

  return {
    schemaVersion: TOLL_FINANCIAL_EVENT_SCHEMA_VERSION,
    eventId: `toll:${id}`,
    kind,
    kindLabel: tollKindLabel(kind),
    sourceSystem,
    amount: typeof tx.amount === "number" ? tx.amount : Number(tx.amount) || 0,
    currency: "USD",
    driverId: String(tx.driverId || ""),
    driverName: tx.driverName ? String(tx.driverName) : undefined,
    occurredAt: isoFromTxDate(tx),
    importedAt: typeof md.importedAt === "string" ? md.importedAt : undefined,
    reconciledAt:
      typeof md.reconciledAt === "string"
        ? md.reconciledAt
        : typeof md.matchedAt === "string"
          ? md.matchedAt
          : undefined,
    batchId,
    tripId: tx.tripId ? String(tx.tripId) : undefined,
    matchedTollId: undefined,
    workflowState: deriveTollWorkflowState(tx),
    description: [tx.tollPlaza, tx.vendor, tx.description].filter(Boolean).join(" · ") || undefined,
    rawRef: { store: fromLedger ? "toll_ledger" : "transaction", id },
  };
}

export function mapTripUnclaimedToEvent(trip: any): TollFinancialEvent | null {
  if (!trip || typeof trip !== "object") return null;
  const id = trip.id != null ? String(trip.id) : "";
  if (!id) return null;
  const tc = Number(trip.tollCharges) || 0;
  if (tc <= 0) return null;

  const occurred =
    trip.requestTime && typeof trip.requestTime === "string"
      ? new Date(trip.requestTime)
      : trip.date
        ? new Date(String(trip.date).includes("T") ? trip.date : `${trip.date}T12:00:00`)
        : new Date(0);
  const occurredAt = isNaN(occurred.getTime()) ? new Date(0).toISOString() : occurred.toISOString();

  return {
    schemaVersion: TOLL_FINANCIAL_EVENT_SCHEMA_VERSION,
    eventId: `trip_refund:${id}`,
    kind: "unlinked_refund_signal",
    kindLabel: tollKindLabel("unlinked_refund_signal"),
    sourceSystem: "trip",
    amount: tc,
    currency: "USD",
    driverId: String(trip.driverId || ""),
    driverName: trip.driverName ? String(trip.driverName) : undefined,
    occurredAt,
    batchId: typeof trip.batchId === "string" ? trip.batchId : undefined,
    tripId: id,
    workflowState: "unlinked_refund",
    description: [trip.pickupLocation, trip.dropoffLocation].filter(Boolean).join(" → ") || undefined,
    rawRef: { store: "trip", id },
  };
}

export function mapDisputeRefundToEvent(r: any): TollFinancialEvent | null {
  if (!r || typeof r !== "object") return null;
  const id = r.id != null ? String(r.id) : "";
  if (!id) return null;

  const st = String(r.status || "");
  const workflowState: TollEventWorkflowState =
    st === "matched" || st === "auto_resolved" ? "dispute_matched" : "dispute_unmatched";

  const d = r.date ? new Date(r.date) : new Date(0);
  const occurredAt = isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();

  return {
    schemaVersion: TOLL_FINANCIAL_EVENT_SCHEMA_VERSION,
    eventId: `dispute_refund:${id}`,
    kind: "dispute_adjustment",
    kindLabel: tollKindLabel("dispute_adjustment"),
    sourceSystem: "dispute_refund",
    amount: typeof r.amount === "number" ? r.amount : Number(r.amount) || 0,
    currency: "USD",
    driverId: String(r.driverId || ""),
    driverName: r.driverName ? String(r.driverName) : undefined,
    occurredAt,
    importedAt: typeof r.importedAt === "string" ? r.importedAt : undefined,
    reconciledAt: typeof r.resolvedAt === "string" ? r.resolvedAt : undefined,
    batchId: typeof r.batchId === "string" ? r.batchId : undefined,
    matchedTollId: r.matchedTollId ? String(r.matchedTollId) : undefined,
    workflowState,
    description: r.rawDescription ? String(r.rawDescription).slice(0, 200) : undefined,
    rawRef: { store: "dispute-refund", id },
  };
}

export function parseKindFilter(raw: string | undefined): Set<TollEventKind> | null {
  if (!raw || !raw.trim()) return null;
  const allowed: TollEventKind[] = [
    "plaza_toll",
    "legacy_transaction_toll",
    "unlinked_refund_signal",
    "dispute_adjustment",
  ];
  const set = new Set<TollEventKind>();
  for (const part of raw.split(",")) {
    const k = part.trim() as TollEventKind;
    if (allowed.includes(k)) set.add(k);
  }
  return set.size ? set : null;
}

/** YYYY-MM-DD bounds in local interpretation: compare by date part of occurredAt */
export function eventInDateRange(occurredAt: string, from?: string, to?: string): boolean {
  const day = occurredAt.slice(0, 10);
  if (from && day < from.slice(0, 10)) return false;
  if (to && day > to.slice(0, 10)) return false;
  return true;
}

export function sortTollFinancialEventsDesc(events: TollFinancialEvent[]): TollFinancialEvent[] {
  return [...events].sort((a, b) => {
    const ta = new Date(a.occurredAt).getTime();
    const tb = new Date(b.occurredAt).getTime();
    if (tb !== ta) return tb - ta;
    return a.eventId.localeCompare(b.eventId);
  });
}

/**
 * Defensive dedupe by eventId (should not occur if merge rules are correct).
 */
export function dedupeTollFinancialEvents(events: TollFinancialEvent[]): {
  events: TollFinancialEvent[];
  droppedDuplicatesCount: number;
} {
  const seen = new Set<string>();
  const out: TollFinancialEvent[] = [];
  let dropped = 0;
  for (const e of events) {
    if (seen.has(e.eventId)) {
      dropped++;
      continue;
    }
    seen.add(e.eventId);
    out.push(e);
  }
  return { events: out, droppedDuplicatesCount: dropped };
}

export function filterTollFinancialEvents(
  events: TollFinancialEvent[],
  opts: {
    driverId?: string;
    from?: string;
    to?: string;
    kinds?: Set<TollEventKind> | null;
    batchId?: string;
  },
): TollFinancialEvent[] {
  let list = events;
  if (opts.driverId) {
    list = list.filter((e) => e.driverId === opts.driverId);
  }
  if (opts.from || opts.to) {
    list = list.filter((e) => eventInDateRange(e.occurredAt, opts.from, opts.to));
  }
  if (opts.kinds && opts.kinds.size > 0) {
    list = list.filter((e) => opts.kinds!.has(e.kind));
  }
  if (opts.batchId) {
    list = list.filter((e) => e.batchId === opts.batchId);
  }
  return list;
}

export function countBySource(events: TollFinancialEvent[]): Partial<Record<TollEventSourceSystem, number>> {
  const out: Partial<Record<TollEventSourceSystem, number>> = {};
  for (const e of events) {
    out[e.sourceSystem] = (out[e.sourceSystem] || 0) + 1;
  }
  return out;
}
