/**
 * Persist statement↔engine drifts to public.finance_recon_drift (Pass 5).
 */
import { getServiceClient } from "./service_client.ts";
import type { StatementEngineDrift } from "../../../packages/finance-core/src/statementEngineCompare.ts";

function sb() {
  return getServiceClient();
}

export type DriftSource = "close_preview" | "rebuild" | "nightly" | "close";

export async function upsertFinanceReconDrifts(opts: {
  organizationId: string;
  driverId: string;
  weekKey: string;
  statementVersion?: number | null;
  source: DriftSource;
  drifts: readonly StatementEngineDrift[];
}): Promise<void> {
  const organizationId = String(opts.organizationId || "").trim();
  const driverId = String(opts.driverId || "").trim();
  const weekKey = String(opts.weekKey || "").slice(0, 10);
  if (!organizationId || !driverId || !/^\d{4}-\d{2}-\d{2}$/.test(weekKey)) return;

  const now = new Date().toISOString();
  const openFields = new Set(opts.drifts.map((d) => `${d.kind}:${d.field}`));

  for (const d of opts.drifts) {
    const { error } = await sb().from("finance_recon_drift").upsert(
      {
        organization_id: organizationId,
        driver_id: driverId,
        week_key: weekKey,
        kind: d.kind,
        field: d.field,
        statement_minor: d.statementMinor,
        engine_minor: d.engineMinor,
        delta_minor: d.deltaMinor,
        statement_version: opts.statementVersion ?? null,
        status: "open",
        source: opts.source,
        detected_at: now,
        resolved_at: null,
      },
      { onConflict: "organization_id,driver_id,week_key,kind,field" },
    );
    if (error) {
      console.warn("[finance_recon_drift] upsert failed", error.message);
    }
  }

  // Resolve prior open fields for this driver-week that are no longer drifting.
  const { data: openRows, error: loadErr } = await sb()
    .from("finance_recon_drift")
    .select("id, kind, field")
    .eq("organization_id", organizationId)
    .eq("driver_id", driverId)
    .eq("week_key", weekKey)
    .eq("status", "open");
  if (loadErr) {
    console.warn("[finance_recon_drift] load open failed", loadErr.message);
    return;
  }
  for (const row of openRows ?? []) {
    const key = `${row.kind}:${row.field}`;
    if (openFields.has(key)) continue;
    await sb()
      .from("finance_recon_drift")
      .update({ status: "resolved", resolved_at: now })
      .eq("id", row.id);
  }
}

export async function countOpenFinanceReconDrifts(
  organizationId: string,
  weekKey?: string,
): Promise<number> {
  let q = sb()
    .from("finance_recon_drift")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("status", "open");
  if (weekKey) q = q.eq("week_key", String(weekKey).slice(0, 10));
  const { count, error } = await q;
  if (error) {
    console.warn("[finance_recon_drift] count failed", error.message);
    return 0;
  }
  return count ?? 0;
}
