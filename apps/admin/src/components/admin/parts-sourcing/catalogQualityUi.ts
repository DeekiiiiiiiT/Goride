/** AM-S6 / AM-25 presentation helpers (pure — unit tested). */

export function tierRangeHint(tierBreakdown: Record<string, number> | undefined | null): string {
  const keys = Object.keys(tierBreakdown ?? {}).filter((k) => Number(tierBreakdown?.[k]) > 0);
  if (!keys.length) return "";
  const sorted = keys.map((k) => Number(k)).sort((a, b) => a - b);
  const lo = sorted[0];
  const hi = sorted[sorted.length - 1];
  if (lo === hi) return `T${lo}`;
  return `T${lo}–T${hi}`;
}

/** Toolbar chip: never double-prefix "Interval ·". */
export function scheduleIntervalChip(intervalLabel?: string | null, cron?: string | null): string {
  const raw = String(intervalLabel ?? "").trim();
  if (raw) {
    if (/^interval\s*[·:]/i.test(raw)) return raw.replace(/^interval\s*[·:]\s*/i, "Interval · ");
    return `Interval · ${raw}`;
  }
  const c = String(cron ?? "").trim();
  if (c === "0 3 * * *") return "Interval · Daily at 03:00 UTC";
  if (c) return `Interval · ${c}`;
  return "Interval · nightly";
}

export function formatPositionReportRowId(rowId: unknown): string {
  const id = String(rowId ?? "").trim();
  if (!id) return "—";
  const compact = id.replace(/-/g, "").slice(-5).toUpperCase();
  return `ROW-${compact}`;
}

export function positionReasonNarrative(row: Record<string, unknown>): { icon: string; text: string } {
  const reason = String(row.reason ?? "").trim();
  const original = String(row.original_position ?? row.original_side ?? "").trim() || "—";
  if (reason === "duplicate_after_normalization") {
    const survivor = formatPositionReportRowId(row.survivor_id);
    return {
      icon: "merge",
      text: `Duplicate after clean-up → mapped into master entity ${survivor}`,
    };
  }
  if (reason === "unmapped" || reason === "position_unmapped") {
    return {
      icon: "report_problem",
      text: `Unrecognized code "${original}" → fallback to Any position`,
    };
  }
  if (reason) {
    return { icon: "report_problem", text: reason.replace(/_/g, " ") };
  }
  return { icon: "report_problem", text: "Could not read position or side — remap or mark fixed." };
}

export function historyNormalizedTarget(row: Record<string, unknown>): string {
  const src = String(row.resolution_source ?? "").trim();
  if (src === "listing_edit") return "LISTING EDIT";
  if (src === "manual") return "MANUAL FIX";
  return src ? src.toUpperCase().replace(/_/g, " ") : "—";
}

export function historyAuditTrail(row: Record<string, unknown>, actorLabel?: string | null): string {
  const src = String(row.resolution_source ?? "").trim();
  if (src === "listing_edit") return "Auto-resolved on listing edit";
  const who = actorLabel?.trim() || (row.resolved_by ? `User ${String(row.resolved_by).slice(0, 8)}` : "Staff");
  if (src === "manual") return `Fixed by ${who}`;
  return who;
}

export type RemapSelectValue =
  | { kind: "any" }
  | { kind: "position"; position: string; side: string | null }
  | { kind: "merge"; survivorId: string };

export function parseRemapSelectValue(raw: string, row: Record<string, unknown>): RemapSelectValue | null {
  const v = raw.trim();
  if (!v || v === "placeholder") return null;
  if (v === "any") return { kind: "any" };
  if (v.startsWith("merge:")) {
    const survivorId = v.slice("merge:".length);
    if (survivorId) return { kind: "merge", survivorId };
  }
  if (v.includes("|")) {
    const [position, side] = v.split("|");
    return { kind: "position", position, side: side === "" ? null : side };
  }
  if (v === "merge" && row.survivor_id) {
    return { kind: "merge", survivorId: String(row.survivor_id) };
  }
  return { kind: "position", position: v, side: null };
}

export function remapBodyFromSelect(parsed: RemapSelectValue): { position: string | null; side: string | null } {
  if (parsed.kind === "any") return { position: null, side: null };
  if (parsed.kind === "merge") return { position: null, side: null };
  return { position: parsed.position, side: parsed.side };
}

export const COMPLETENESS_DRAWER_ROWS: Array<{ key: string; label: string }> = [
  { key: "vehicleCount", label: "Vehicles in catalog" },
  { key: "vehiclesWithOeNumbers", label: "Vehicles with factory numbers" },
  { key: "vehiclesMissingOe", label: "Vehicles missing factory numbers" },
  { key: "platformLinkCount", label: "Platform component links" },
  { key: "groups", label: "Interchange groups" },
  { key: "parts", label: "Parts on file" },
  { key: "partsWithSpecAttributes", label: "Parts with spec sheet attributes" },
  { key: "listings", label: "Car listings" },
  { key: "derived", label: "Derived fits" },
  { key: "openConflicts", label: "Open conflicts" },
  { key: "unresolvedPositionReports", label: "Unresolved position reports" },
];

export function oeCoveragePercent(comp: Record<string, unknown> | null | undefined): number | null {
  if (!comp) return null;
  const total = Number(comp.vehicleCount);
  const withOe = Number(comp.vehiclesWithOeNumbers);
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(withOe)) return null;
  return Math.round((withOe / total) * 1000) / 10;
}

export function specSheetCoveragePercent(comp: Record<string, unknown> | null | undefined): number | null {
  if (!comp) return null;
  const total = Number(comp.parts);
  const filled = Number(comp.partsWithSpecAttributes);
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(filled)) return null;
  return Math.round((filled / total) * 1000) / 10;
}

/** Server-driven normalizer chip (normVersion + normMode from health). */
export function normalizerLabelFromHealth(
  normVersion: unknown,
  normMode: unknown,
): string {
  const ver = normVersion != null && String(normVersion).trim() !== "" ? String(normVersion) : "—";
  const mode = String(normMode ?? "strict").trim() || "strict";
  return `Normalizer: v${ver} ${mode}`;
}

export function formatErrorCount24hLabel(count: number): string {
  const n = Math.max(0, Math.floor(count));
  return `${n} error${n === 1 ? "" : "s"} in 24h`;
}

export function formatActiveLogsLabel(count: number): string {
  const n = Math.max(0, Math.floor(count));
  return `${n} active log${n === 1 ? "" : "s"}`;
}

export function lastError24hMessage(
  lastError: Record<string, unknown> | null | undefined,
  fallback?: string | null,
): string {
  const err = String(lastError?.error ?? fallback ?? "").trim();
  if (!err) return "See run log for details";
  const kind = String(lastError?.kind ?? "").trim();
  if (kind && !err.toLowerCase().includes(kind.toLowerCase())) {
    return `${kind}: ${err}`;
  }
  return err;
}
