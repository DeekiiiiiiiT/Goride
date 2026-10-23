/** Pure row shaping for recon.week_blockers (R19-01). No database access. */
import type { CloseBlocker } from "../../../packages/finance-core/src/closeInvariants.ts";

export type ReconServiceLine = "rideshare" | "rush_delivery";

export type BlockerScope = {
  orgId: string;
  weekKey: string;
  serviceLine: ReconServiceLine;
  /** null = whole-week rows. */
  driverId: string | null;
};

export type BlockerRow = {
  organization_id: string;
  week_key: string;
  service_line: string;
  driver_id: string | null;
  code: string;
  source_id: string | null;
  severity: string;
  fingerprint: string;
  message: string;
  persisted: number | null;
  expected: number | null;
  delta: number | null;
  computed_at: string;
};

function num(value: unknown): number | null {
  const n = Number(value);
  return value == null || !Number.isFinite(n) ? null : n;
}

/** Matches the table's unique key inside one scope. */
export function blockerRowKey(code: string, sourceId: string | null): string {
  return `${code}|${sourceId ?? ""}`;
}

/** One row per (code, source). Same-code drifts on several fields merge into one row. */
export function blockerRowsForScope(scope: BlockerScope, blockers: CloseBlocker[], now: string): BlockerRow[] {
  const byKey = new Map<string, BlockerRow>();
  for (const blocker of blockers) {
    const sourceId = blocker.sourceId ? String(blocker.sourceId) : null;
    const key = blockerRowKey(blocker.code, sourceId);
    const existing = byKey.get(key);
    if (existing) {
      if (blocker.severity === "block") existing.severity = "block";
      if (blocker.message && !existing.message.includes(blocker.message)) {
        existing.message = `${existing.message}; ${blocker.message}`;
      }
      existing.persisted = existing.expected = existing.delta = null;
      continue;
    }
    byKey.set(key, {
      organization_id: scope.orgId,
      week_key: scope.weekKey,
      service_line: scope.serviceLine,
      driver_id: scope.driverId,
      code: blocker.code,
      source_id: sourceId,
      severity: blocker.severity,
      fingerprint: [blocker.code, scope.driverId ?? "", sourceId ?? ""].join(":"),
      message: blocker.message || blocker.code,
      persisted: num(blocker.persisted),
      expected: num(blocker.expected),
      delta: num(blocker.delta),
      computed_at: now,
    });
  }
  return [...byKey.values()];
}
