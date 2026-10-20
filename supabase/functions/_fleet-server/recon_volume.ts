/**
 * R3-06 / R4-05: live source volume for coverageInputHash.
 * Shared by wizard materialize (recon_routes) and Close Week (week_close_recon)
 * so late rows flip STEP_STALE at close the same way as in the wizard.
 */
import { getServiceClient } from "./service_client.ts";
import type { ReconSourceId } from "./recon_sources_mirror.ts";
import { periodEndForAnchor } from "../../../packages/finance-core/src/periodKey.ts";

export async function sourceVolumeMetrics(
  orgId: string,
  sourceId: ReconSourceId,
  weekKey: string,
): Promise<{ rowCount: number; amountMinor: number }> {
  const sb = getServiceClient();
  const end = periodEndForAnchor(weekKey);

  if (sourceId === "toll_usage" || sourceId === "toll_topup" || sourceId === "cash_tolls") {
    const typeFilter = sourceId === "toll_topup"
      ? ["top_up", "topup", "Top-up"]
      : sourceId === "cash_tolls"
      ? null
      : ["usage", "Usage", "toll_usage"];
    let q = sb
      .from("fleet_toll_ledger")
      .select("id, amount, payment_method, type")
      .eq("organization_id", orgId)
      .gte("date", weekKey)
      .lte("date", end)
      .limit(100000);
    if (typeFilter) q = q.in("type", typeFilter);
    const { data } = await q;
    const rows = data ?? [];
    let amountMinor = 0;
    let rowCount = 0;
    for (const r of rows) {
      const pm = String((r as { payment_method?: string }).payment_method || "").toLowerCase();
      if (sourceId === "cash_tolls" && !(pm.includes("cash"))) continue;
      if (sourceId !== "cash_tolls" && pm.includes("cash")) continue;
      rowCount += 1;
      amountMinor += Math.round(Math.abs(Number((r as { amount?: number }).amount) || 0) * 100);
    }
    return { rowCount, amountMinor };
  }

  if (sourceId === "uber_bundle" || sourceId === "indrive_trips") {
    // Prefer live trips so close-hash matches dual-read coverage when batches lag.
    let tripQ = sb
      .from("fleet_trips")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .gte("date", weekKey)
      .lte("date", end);
    if (sourceId === "uber_bundle") tripQ = tripQ.ilike("platform", "%uber%");
    if (sourceId === "indrive_trips") tripQ = tripQ.ilike("platform", "%indrive%");
    const { count: tripCount } = await tripQ;
    if ((tripCount ?? 0) > 0) return { rowCount: tripCount ?? 0, amountMinor: 0 };

    const { data } = await sb
      .from("fleet_import_batches")
      .select("record_count, rows_committed, coverage_start, coverage_end")
      .eq("organization_id", orgId)
      .eq("source_id", sourceId)
      .in("status", ["completed", "committed"])
      .lte("coverage_start", end)
      .gte("coverage_end", weekKey)
      .limit(50);
    let rowCount = 0;
    for (const b of data ?? []) {
      rowCount += Number(
        (b as { rows_committed?: number }).rows_committed ??
          (b as { record_count?: number }).record_count ??
          0,
      ) || 0;
    }
    return { rowCount, amountMinor: 0 };
  }

  if (sourceId === "fuel_card_roam" || sourceId === "fuel_card_self") {
    const { data: fuelRows } = await sb
      .from("fleet_fuel_entries")
      .select("id, type, payload_json")
      .eq("organization_id", orgId)
      .gte("date", weekKey)
      .lte("date", end)
      .limit(100000);
    let live = 0;
    for (const f of fuelRows ?? []) {
      const payload = (f as { payload_json?: Record<string, unknown> }).payload_json || {};
      const importSrc = String(payload.importSource || "").toLowerCase();
      const entrySource = String(payload.entrySource || "").toLowerCase();
      const type = String((f as { type?: string }).type || "");
      const cardId = String(payload.cardId || "").trim();
      const paid = String(payload.paymentMethod || payload.paidBy || "").toLowerCase();
      if (sourceId === "fuel_card_roam") {
        // Gas Card / Roam Fuels inventory fills (issuer may be JAA Advance rental).
        if (
          type === "Card_Transaction" ||
          entrySource === "fuel-card" ||
          paid === "gas card" ||
          paid === "company_card" ||
          paid === "gas_card" ||
          !!cardId
        ) {
          live += 1;
        }
      } else if (importSrc.includes("jaa") || importSrc.includes("self_serve")) {
        live += 1;
      }
    }
    if (live > 0) return { rowCount: live, amountMinor: 0 };

    const { data } = await sb
      .from("fleet_import_batches")
      .select("record_count, rows_committed, coverage_start, coverage_end")
      .eq("organization_id", orgId)
      .eq("source_id", sourceId)
      .in("status", ["completed", "committed"])
      .lte("coverage_start", end)
      .gte("coverage_end", weekKey)
      .limit(50);
    let rowCount = 0;
    for (const b of data ?? []) {
      rowCount += Number(
        (b as { rows_committed?: number }).rows_committed ??
          (b as { record_count?: number }).record_count ??
          0,
      ) || 0;
    }
    return { rowCount, amountMinor: 0 };
  }

  if (sourceId === "roam_trips" || sourceId === "rush_deliveries") {
    let q = sb
      .from("fleet_trips")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .gte("date", weekKey)
      .lte("date", end);
    if (sourceId === "roam_trips") q = q.ilike("platform", "%roam%");
    if (sourceId === "rush_deliveries") q = q.eq("service_line", "rush_delivery");
    const { count } = await q;
    return { rowCount: count ?? 0, amountMinor: 0 };
  }

  if (sourceId === "cash_fuel") {
    const { count } = await sb
      .from("fleet_fuel_entries")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .gte("date", weekKey)
      .lte("date", end);
    return { rowCount: count ?? 0, amountMinor: 0 };
  }

  return { rowCount: 0, amountMinor: 0 };
}
