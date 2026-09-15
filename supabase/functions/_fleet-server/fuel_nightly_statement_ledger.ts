/**
 * Nightly: locked fuel weeks — finalized snapshot vs fuel statement vs ledger events.
 */
import * as kv from "./kv_store.tsx";
import { getServiceClient } from "./service_client.ts";
import { upsertFinanceReconDrifts } from "./finance_recon_drift.ts";
import type { StatementEngineDrift } from "../../../packages/finance-core/src/statementEngineCompare.ts";

const EPS_MINOR = 1;

function ymd(v: unknown): string {
  return String(v || "").slice(0, 10);
}

function majorToMinor(n: number): number {
  return Math.round((Number(n) || 0) * 100);
}

type FuelEventRow = {
  event_type: string;
  amount_minor: number;
};

function sumFuelLedgerByDriver(
  events: FuelEventRow[],
): { driverShareMinor: number; companyShareMinor: number } {
  let driverShareMinor = 0;
  let companyShareMinor = 0;
  for (const ev of events) {
    const et = String(ev.event_type || "");
    const amt = Math.abs(Number(ev.amount_minor) || 0);
    if (et === "fuel_deduction") driverShareMinor += amt;
    else if (et === "fuel_fleet_share") companyShareMinor += amt;
  }
  return { driverShareMinor, companyShareMinor };
}

function pushDrift(
  out: StatementEngineDrift[],
  field: string,
  statementMinor: number,
  engineMinor: number,
) {
  const delta = statementMinor - engineMinor;
  if (Math.abs(delta) <= EPS_MINOR) return;
  out.push({
    kind: "fuel",
    field,
    statementMinor,
    engineMinor,
    deltaMinor: delta,
  });
}

/**
 * Compare locked org fuel weeks to statements + ledger; upsert finance_recon_drift (source nightly).
 */
export async function upsertLockedFuelWeekStatementLedgerDrifts(opts: {
  fromYmd: string;
  activeFuelEventsByPeriod: Map<string, FuelEventRow[]>;
}): Promise<{ periodsChecked: number; driversChecked: number }> {
  const sb = getServiceClient();
  const fromYmd = ymd(opts.fromYmd);
  let periodsChecked = 0;
  let driversChecked = 0;

  const { data: lockedPeriods, error } = await sb
    .from("fuel_reconciliation_period")
    .select("org_id, week_start, week_end, total_spend, driver_share, company_share")
    .eq("status", "locked")
    .gte("week_start", fromYmd);
  if (error) {
    console.warn("[fuel_nightly_statement_ledger] load locked periods failed", error.message);
    return { periodsChecked: 0, driversChecked: 0 };
  }

  for (const period of lockedPeriods || []) {
    try {
      const orgId = String(period.org_id || "").trim();
      const weekStart = ymd(period.week_start);
      if (!orgId || !weekStart) continue;
      periodsChecked += 1;

      const prefix = `finalized_report:${weekStart}:`;
      const rawSnaps = ((await kv.getByPrefix(prefix)) || []) as Record<string, unknown>[];
      const snaps = rawSnaps.filter((s) => {
        const rowOrg = String(s.orgId || s.org_id || "");
        return !rowOrg || rowOrg === orgId;
      });
      if (!snaps.length) continue;

      for (const snap of snaps) {
        const driverId = String(snap.driverId || "").trim();
        if (!driverId) continue;
        driversChecked += 1;

        const snapDriverMinor = majorToMinor(Number(snap.driverShare) || 0);
        const snapCompanyMinor = majorToMinor(Number(snap.companyShare) || 0);

        const { data: stmtRow } = await sb
          .from("week_statements")
          .select("amounts_minor, version, status")
          .eq("organization_id", orgId)
          .eq("driver_id", driverId)
          .eq("week_key", weekStart)
          .eq("kind", "fuel")
          .in("status", ["closed", "draft", "restated"])
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle();

        const stmtAmt = (stmtRow?.amounts_minor || {}) as Record<string, number>;
        const stmtDriverMinor = Math.round(Number(stmtAmt.driverShare) || 0);
        const stmtCompanyMinor = Math.round(Number(stmtAmt.companyShare) || 0);

        const evKey = `${driverId}|${weekStart}`;
        const ledger = sumFuelLedgerByDriver(opts.activeFuelEventsByPeriod.get(evKey) || []);

        const drifts: StatementEngineDrift[] = [];
        pushDrift(drifts, "driverShare", snapDriverMinor, stmtDriverMinor);
        pushDrift(drifts, "companyShare", snapCompanyMinor, stmtCompanyMinor);
        pushDrift(drifts, "ledger_driverShare", stmtDriverMinor, ledger.driverShareMinor);
        pushDrift(drifts, "ledger_companyShare", stmtCompanyMinor, ledger.companyShareMinor);
        pushDrift(drifts, "snapshot_ledger_driverShare", snapDriverMinor, ledger.driverShareMinor);
        pushDrift(drifts, "snapshot_ledger_companyShare", snapCompanyMinor, ledger.companyShareMinor);

        if (!drifts.length) continue;

        await upsertFinanceReconDrifts({
          organizationId: orgId,
          driverId,
          weekKey: weekStart,
          source: "nightly",
          drifts,
        });
      }
    } catch (periodErr) {
      console.warn("[fuel_nightly_statement_ledger] period skipped", periodErr);
    }
  }

  return { periodsChecked, driversChecked };
}
