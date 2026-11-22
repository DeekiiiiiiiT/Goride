/**
 * F-14: stamp fleet.fuel_entries.source on new writes (via KV → fleet SQL bridge).
 */

export type FuelEntrySource = "scan" | "card_statement" | "platform" | "manual" | "telematics";

const ALLOWED = new Set<FuelEntrySource>([
  "scan",
  "card_statement",
  "platform",
  "manual",
  "telematics",
]);

export function isFuelEntrySource(v: unknown): v is FuelEntrySource {
  return typeof v === "string" && ALLOWED.has(v as FuelEntrySource);
}

export type FuelEntrySourceContext = {
  isNew: boolean;
  isDriverSubmitter?: boolean;
  /** Split-fill card anchor from driver scan. */
  splitFillScan?: boolean;
  /** JAA / statement match or import. */
  statementLine?: boolean;
  /** Fleet admin correction path (non-driver create). */
  adminManual?: boolean;
};

export function resolveFuelEntrySource(
  entry: Record<string, unknown>,
  ctx: FuelEntrySourceContext,
): FuelEntrySource | undefined {
  if (!ctx.isNew) {
    const existing = entry.source;
    return isFuelEntrySource(existing) ? existing : undefined;
  }
  if (ctx.statementLine) return "card_statement";
  const meta = (entry.metadata && typeof entry.metadata === "object"
    ? entry.metadata
    : {}) as Record<string, unknown>;
  if (meta.locationStatus === "statement_vendor" || entry.type === "Card_Transaction") {
    if (ctx.statementLine || entry.entryMode === "Statement" || meta.importSource) {
      return "card_statement";
    }
  }
  if (ctx.splitFillScan) return "scan";
  if (ctx.isDriverSubmitter) return "scan";
  if (meta.importSource || meta.entrySource === "statement") return "card_statement";
  if (ctx.adminManual) return "manual";
  if (entry.receiptUrl || entry.odometerProofUrl || meta.plausibilityAccepted != null) return "scan";
  return "manual";
}

export function stampFuelEntrySource(
  entry: Record<string, unknown>,
  ctx: FuelEntrySourceContext,
): FuelEntrySource | undefined {
  const src = resolveFuelEntrySource(entry, ctx);
  if (src) entry.source = src;
  return src;
}