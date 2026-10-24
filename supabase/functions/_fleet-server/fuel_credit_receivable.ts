/**
 * Book a driver receivable for a closed week that credited company gas-card
 * fuel. The cash payout stays. The amount lands on the next open week so
 * Collect / offset / write-off can clear it. confirm:false is a preview.
 */
import { getServiceClient } from "./service_client.ts";
import { persistPeriodRowWithVersion } from "./period_persist.ts";
import { periodEndForAnchor, nextPeriodAnchor } from "../../../packages/finance-core/src/periodKey.ts";
import { mergeOpeningCashCustody } from "../../../packages/finance-core/src/custodyCarry.ts";
import {
  fuelCreditOverpayment,
  fuelOverpaymentReceivableStamp,
} from "../../../packages/finance-core/src/driverFuelCredit.ts";
import { isPeriodFrozen } from "./settlement_period_freeze.ts";

function sb() {
  return getServiceClient();
}

export type FuelCreditReceivableResult = {
  preview: true;
  sourceWeek: string;
  driverId: string;
  correctOwed: number;
  paid: number;
  receivable: number;
  targetWeek: string | null;
  alreadyApplied: boolean;
  applied: boolean;
};

export async function previewOrApplyFuelCreditReceivable(opts: {
  organizationId: string;
  driverId: string;
  sourceWeek: string;
  confirm?: boolean;
}): Promise<FuelCreditReceivableResult> {
  const sourceWeek = String(opts.sourceWeek).slice(0, 10);
  const { data: source, error } = await sb()
    .from("driver_financial_periods")
    .select(
      "driver_share, fuel_deduction, fuel_driver_spend, fuel_fleet_share, cash_collected, cash_returned, settlement_paid, metadata, status, closed_at",
    )
    .eq("organization_id", opts.organizationId)
    .eq("driver_id", opts.driverId)
    .eq("period_anchor", sourceWeek)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!source) throw new Error("PERIOD_NOT_FOUND");

  const paid = Number(source.settlement_paid) || 0;
  const receivable = fuelCreditOverpayment({
    driverShare: Number(source.driver_share) || 0,
    fuelDeduction: Number(source.fuel_deduction) || 0,
    cashCollected: Number(source.cash_collected) || 0,
    cashReturned: Number(source.cash_returned) || 0,
    driverPaidFuel: Number(source.fuel_driver_spend) || 0,
    companyFuelShare: Number(source.fuel_fleet_share) || 0,
    settlementPaid: paid,
  });

  const { data: later, error: laterErr } = await sb()
    .from("driver_financial_periods")
    .select("id, period_anchor, status, closed_at, settlement_status, metadata, organization_id")
    .eq("driver_id", opts.driverId)
    .gt("period_anchor", sourceWeek)
    .order("period_anchor", { ascending: true });
  if (laterErr) throw new Error(laterErr.message);

  const open = (later || []).find((row) =>
    !isPeriodFrozen({
      status: row.status,
      closedAt: row.closed_at,
      settlementStatus: row.settlement_status,
      metadata: row.metadata as Record<string, unknown> | null,
    }),
  );
  const targetWeek = open
    ? String(open.period_anchor).slice(0, 10)
    : nextPeriodAnchor(sourceWeek);

  const openFc = ((open?.metadata as { financeCore?: Record<string, unknown> } | null)?.financeCore) || {};
  const prior = openFc.fuelCreditReceivable as { sourceWeek?: string; amount?: number } | undefined;
  const alreadyApplied = prior?.sourceWeek === sourceWeek && Math.abs((Number(prior.amount) || 0) - receivable) <= 0.01;

  const result: FuelCreditReceivableResult = {
    preview: true,
    sourceWeek,
    driverId: opts.driverId,
    correctOwed: Math.round((paid - receivable) * 100) / 100,
    paid,
    receivable,
    targetWeek,
    alreadyApplied,
    applied: false,
  };

  if (!opts.confirm || alreadyApplied || receivable <= 0.01) return result;

  const stamp = fuelOverpaymentReceivableStamp({
    amount: receivable,
    sourceWeek,
    driverPaidFuel: Number(source.fuel_driver_spend) || 0,
    companyFuelShare: Number(source.fuel_fleet_share) || 0,
  });
  const nextMeta = { ...((open?.metadata as Record<string, unknown>) || {}) };
  const nextFc = mergeOpeningCashCustody(
    { ...((nextMeta.financeCore as Record<string, unknown>) || {}), ...stamp },
    receivable,
    sourceWeek,
  );
  nextMeta.financeCore = nextFc;

  if (open?.id) {
    await persistPeriodRowWithVersion(opts.driverId, targetWeek, {
      metadata: nextMeta,
      updated_at: new Date().toISOString(),
    });
  } else {
    await persistPeriodRowWithVersion(opts.driverId, targetWeek, {
      organization_id: opts.organizationId,
      period_end: periodEndForAnchor(targetWeek),
      status: "open",
      settlement_status: "pending",
      metadata: nextMeta,
      source_event_hash: "",
    });
  }

  return { ...result, applied: true };
}

/** Settled weeks where company fuel share was credited and the payout is too high. */
export async function scanFuelCreditOverpayments(organizationId: string) {
  const { data, error } = await sb()
    .from("driver_financial_periods")
    .select(
      "driver_id, period_anchor, driver_share, fuel_deduction, fuel_driver_spend, fuel_fleet_share, cash_collected, cash_returned, settlement_paid",
    )
    .eq("organization_id", organizationId)
    .gt("settlement_paid", 0);
  if (error) throw new Error(error.message);
  const hits = [];
  for (const row of data || []) {
    const receivable = fuelCreditOverpayment({
      driverShare: Number(row.driver_share) || 0,
      fuelDeduction: Number(row.fuel_deduction) || 0,
      cashCollected: Number(row.cash_collected) || 0,
      cashReturned: Number(row.cash_returned) || 0,
      driverPaidFuel: Number(row.fuel_driver_spend) || 0,
      companyFuelShare: Number(row.fuel_fleet_share) || 0,
      settlementPaid: Number(row.settlement_paid) || 0,
    });
    if (receivable <= 0.01) continue;
    hits.push({
      driverId: row.driver_id,
      week: String(row.period_anchor).slice(0, 10),
      paid: Number(row.settlement_paid) || 0,
      companyFuelShare: Number(row.fuel_fleet_share) || 0,
      driverPaidFuel: Number(row.fuel_driver_spend) || 0,
      receivable,
    });
  }
  return hits;
}
