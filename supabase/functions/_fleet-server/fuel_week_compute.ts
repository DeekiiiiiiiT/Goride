/**
 * Server week compute: shared fuel-core snapshots + saved distances.
 * The screen reviews this result. It does not recompute the week.
 */
import { getServiceClient } from "./service_client.ts";
import { prepareFuelWeekReports } from "./fuel_week_prepare.ts";
import { loadWeekFuelEntries } from "./fuel_period_build_snapshots.ts";
import { queryFleet } from "./repos/baseRepo.ts";

function hashParts(parts: string[]): string {
  let h = 2166136261;
  const text = parts.sort().join("|");
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export async function hashFuelWeekInputs(orgId: string, weekStart: string, weekEnd: string): Promise<string> {
  const entries = await loadWeekFuelEntries(orgId, weekStart, weekEnd);
  const trips = await queryFleet("trips", {
    org: orgId,
    dateFrom: weekStart,
    dateTo: weekEnd,
    limit: 5000,
  });
  if (trips.error) throw trips.error;
  const parts = [
    ...entries.map((e) => {
      const meta = e.metadata && typeof e.metadata === "object" ? e.metadata as Record<string, unknown> : {};
      return `${e.id}:${e.amount}:${e.odometer}:${e.liters}:${e.type || ""}:${meta.jaaMatchedDriverEntryId || ""}`;
    }),
    ...((trips.data || []) as any[]).map((t) => `${t.id}:${t.distance || t.tripDistance || t.km || ""}`),
    "shape:fuel-rule-v1",
  ];
  return hashParts(parts);
}

export async function computeFuelWeekSnapshot(args: {
  orgId: string;
  periodId: string;
  weekStart: string;
  weekEnd: string;
}) {
  const sb = getServiceClient();
  const inputsHash = await hashFuelWeekInputs(args.orgId, args.weekStart, args.weekEnd);
  const { data: latest } = await sb
    .from("fuel_week_snapshot")
    .select("id, version, inputs_hash, money")
    .eq("org_id", args.orgId)
    .eq("period_id", args.periodId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest && latest.inputs_hash === inputsHash) {
    return { snapshot: latest, reused: true };
  }
  const built = await prepareFuelWeekReports({
    orgId: args.orgId,
    weekStart: args.weekStart,
    weekEnd: args.weekEnd,
  });
  if (!built.ok) {
    throw new Error(built.error || "fuel week compute failed");
  }
  const version = (Number(latest?.version) || 0) + 1;
  const money = { reports: built.reports, totalSpend: built.totalSpend };
  const { data: inserted, error } = await sb
    .from("fuel_week_snapshot")
    .insert({
      org_id: args.orgId,
      period_id: args.periodId,
      week_start: args.weekStart,
      version,
      inputs_hash: inputsHash,
      money,
      blockers: [],
      provenance: { engine: "generateDriverFleetReport" },
    })
    .select("id, version, inputs_hash, money")
    .single();
  if (error) throw new Error(error.message);

  return { snapshot: inserted, reused: false };
}

export async function loadFuelWeekSnapshotVersion(args: {
  orgId: string;
  periodId: string;
  version: number;
}) {
  const sb = getServiceClient();
  const { data: row, error } = await sb
    .from("fuel_week_snapshot")
    .select("id, version, inputs_hash, money, week_start")
    .eq("org_id", args.orgId)
    .eq("period_id", args.periodId)
    .eq("version", args.version)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return { ok: false as const, status: 409, body: { error: "snapshot_stale" } };
  const { data: newer } = await sb
    .from("fuel_week_snapshot")
    .select("version")
    .eq("org_id", args.orgId)
    .eq("period_id", args.periodId)
    .gt("version", args.version)
    .limit(1);
  if (newer && newer.length) {
    return { ok: false as const, status: 409, body: { error: "snapshot_stale", currentVersion: newer[0].version } };
  }
  return { ok: true as const, row };
}
