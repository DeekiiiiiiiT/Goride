/**
 * Server-side JAA match link application — mirrors roam-shared applyFuelMatchLinks.
 * After link persist, auto-stamps Verified GOD station when merchant uniquely matches.
 * Split cash: O(1) marker lookup, re-home to open period when fill week sealed (C1/M2/M3/M4).
 */
import * as kv from "./kv_store.tsx";
import { stampEntryCycleMetadata } from "./fuel_cycle_stamp.ts";
import {
  attachJaaPairIfUniqueMerchant,
  type AttachJaaPairResult,
} from "./fuel_jaa_station_heal.ts";
import {
  applySplitCashMatchToTx,
  splitPumpPriceOutlierPatch,
} from "../../../packages/fuel-core/src/fuelSplitCashLifecycle.ts";
import { planSplitCashPeriodLanding } from "./fuel_split_cash_rehome.ts";

function metaOf(entry: Record<string, unknown>): Record<string, unknown> {
  const m = entry?.metadata;
  return m && typeof m === "object" ? (m as Record<string, unknown>) : {};
}

export type FuelMatchPair = {
  status: string;
  statementEntry?: Record<string, unknown>;
  driverEntry?: Record<string, unknown>;
};

export function applyFuelMatchLinks(
  pair: FuelMatchPair,
): { statement?: Record<string, unknown>; driver?: Record<string, unknown> } {
  if (!pair.statementEntry || !pair.driverEntry) return {};
  if (pair.status !== "matched" && pair.status !== "amount_mismatch") return {};

  const stmt = pair.statementEntry;
  const drv = pair.driverEntry;
  const stmtMeta = metaOf(stmt);
  const drvMeta = metaOf(drv);

  const stmtAmount = Number(stmt.amount) || 0;
  const stmtLiters = stmt.liters != null ? Number(stmt.liters) : null;
  const stmtPpl =
    stmtLiters && stmtLiters > 0
      ? Number((stmtAmount / stmtLiters).toFixed(2))
      : stmt.pricePerLiter;

  const statement: Record<string, unknown> = {
    ...stmt,
    driverId: drv.driverId || stmt.driverId,
    vehicleId: drv.vehicleId || stmt.vehicleId,
    cardId: drv.cardId || stmt.cardId,
    odometer: drv.odometer ?? stmt.odometer,
    odometerImageUrl: drv.odometerImageUrl || stmt.odometerImageUrl,
    entryMode: drv.odometer != null ? "Anchor" : stmt.entryMode,
    transactionId: drv.transactionId || stmt.transactionId,
    reconciliationStatus: "Verified",
    metadata: {
      ...stmtMeta,
      jaaMatchedDriverEntryId: drv.id,
      jaaMatchStatus: pair.status,
      jaaMatchedAt: new Date().toISOString(),
      jaaMatchScore: (pair as { score?: number }).score,
      jaaMatchNotes: (pair as { notes?: string }).notes,
    },
  };

  // Split card sibling: cash owns pump liters — never take statement volume into ops totals.
  const isSplitNonVolumeOwner =
    drvMeta.splitVolumeOwner === false &&
    typeof drvMeta.fillGroupId === "string" &&
    String(drvMeta.fillGroupId).length > 0;

  const stmtLitersNum = stmtLiters;
  const matchedLiters = isSplitNonVolumeOwner ? 0 : (stmt.liters ?? drv.liters);
  const matchedCountsVolume = isSplitNonVolumeOwner
    ? false
    : Number(stmt.liters) > 0;

  let splitReconPatch: Record<string, unknown> = {};
  if (isSplitNonVolumeOwner) {
    const pumpTotal = Math.abs(Number(drvMeta.splitPumpTotal) || 0);
    const stmtAmt = Math.abs(stmtAmount);
    const legacyExpected =
      drvMeta.splitExpectedCardAmount != null
        ? Math.abs(Number(drvMeta.splitExpectedCardAmount) || 0)
        : null;
    // Keep in sync with packages/fuel-core/src/fuelSplitPayment.ts → splitReconTolerance()
    const tolerance = Math.max(50, pumpTotal * 0.01);
    const derivedCash = Math.round((pumpTotal - stmtAmt) * 100) / 100;
    const overPump = Math.round((stmtAmt - pumpTotal) * 100) / 100;
    let reconciled = stmtAmt > 0 && stmtAmt <= pumpTotal + tolerance && derivedCash >= -tolerance;
    let delta = overPump > 0 ? overPump : 0;
    // Legacy dual-read: old fills that typed cash and stamped expected card claim
    if (reconciled && legacyExpected != null) {
      const claimDelta = Math.round((stmtAmt - legacyExpected) * 100) / 100;
      if (Math.abs(claimDelta) > tolerance) {
        reconciled = false;
        delta = claimDelta;
      }
    }
    if (stmtAmt <= 0) {
      reconciled = false;
      delta = overPump;
    }

    // M4: price-band on full pump $/L — never use statement liters (partial card portion)
    const pumpLiters = Number(drvMeta.splitPumpLiters) || 0;
    const retail =
      Number(drvMeta.retailEstimateJmd) ||
      Number(stmtMeta.retailEstimateJmd) ||
      null;
    const outlierPatch =
      pumpLiters > 0
        ? splitPumpPriceOutlierPatch({
            pumpTotal,
            pumpLiters,
            retailEstimateJmd: retail,
          })
        : { splitPumpPriceOutlier: false };

    splitReconPatch = {
      splitReconciled: reconciled,
      splitVariance: !reconciled,
      splitVarianceDelta: delta,
      splitStatementAmount: stmtAmt,
      splitDerivedCashAmount: Math.max(0, derivedCash),
      awaitingCashStatement: !reconciled,
      ...(stmtLitersNum != null ? { splitStatementLiters: stmtLitersNum } : {}),
      ...outlierPatch,
    };
  }

  const driver: Record<string, unknown> = {
    ...drv,
    amount: stmt.amount,
    liters: matchedLiters,
    pricePerLiter: stmtPpl ?? drv.pricePerLiter,
    location: drv.location || stmt.location,
    cardId: stmt.cardId || drv.cardId,
    vehicleId: drv.vehicleId || stmt.vehicleId,
    reconciliationStatus: "Verified",
    metadata: {
      ...drvMeta,
      awaitingCardStatement: false,
      countsInFuelSpend: true,
      countsInFuelVolume: matchedCountsVolume,
      jaaMatchedStatementId: stmt.id,
      jaaMatchStatus: pair.status,
      jaaMatchedAt: new Date().toISOString(),
      jaaReceiptNumber: stmtMeta.jaaReceiptNumber,
      jaaResponse: stmtMeta.jaaResponse,
      jaaFuelType: stmtMeta.jaaFuelType,
      jaaMatchScore: (pair as { score?: number }).score,
      priorDriverAmount: drv.amount,
      priorDriverLiters: drv.liters,
      ...splitReconPatch,
    },
  };

  if (stmtMeta.jaaFuelType && !driver.fuelType) {
    driver.fuelType = String(stmtMeta.jaaFuelType);
  }

  return { statement, driver };
}

async function loadCashSiblingTx(
  fillGroupId: string,
): Promise<Record<string, unknown> | null> {
  // M2: O(1) via fuel_split marker written at persistSplitFill
  const marker = (await kv.get(`fuel_split:${fillGroupId}`)) as Record<
    string,
    unknown
  > | null;
  const cashId =
    marker && typeof marker.cashTransactionId === "string"
      ? marker.cashTransactionId
      : null;
  if (cashId) {
    const tx = await kv.get(`transaction:${cashId}`);
    if (tx && typeof tx === "object") return tx as Record<string, unknown>;
  }

  // Legacy fallback — scan then backfill marker
  const txs = (await kv.getByPrefix("transaction:")) || [];
  for (const raw of txs) {
    const tx = raw as Record<string, unknown>;
    const tm = metaOf(tx);
    if (tm.fillGroupId !== fillGroupId || tm.splitRole !== "cash") continue;
    if (cashId == null && tx.id) {
      await kv.set(`fuel_split:${fillGroupId}`, {
        fillGroupId,
        cashTransactionId: tx.id,
        cardFuelEntryId: marker?.cardFuelEntryId || null,
        createdAt: new Date().toISOString(),
        backfilledAt: new Date().toISOString(),
      });
    }
    return tx;
  }
  return null;
}

/** Persist linked pair + re-stamp cycle metadata; auto GOD attach when merchant unique. */
export async function persistFuelMatchPair(
  pair: FuelMatchPair,
): Promise<{
  ok: boolean;
  statementId?: string;
  driverId?: string;
  stationHeal?: AttachJaaPairResult;
  splitCashRehome?: string;
  splitCashBlocked?: string;
}> {
  const linked = applyFuelMatchLinks(pair);
  if (!linked.statement || !linked.driver) return { ok: false };

  const vehicleId = String(linked.driver.vehicleId || linked.statement.vehicleId || "");
  const vehicle = vehicleId ? await kv.get(`vehicle:${vehicleId}`) : null;

  if (vehicle) {
    await stampEntryCycleMetadata(linked.statement, vehicle as Record<string, unknown>);
    await stampEntryCycleMetadata(linked.driver, vehicle as Record<string, unknown>);
  }

  await kv.set(`fuel_entry:${linked.statement.id}`, linked.statement);
  await kv.set(`fuel_entry:${linked.driver.id}`, linked.driver);

  let splitCashRehome: string | undefined;
  let splitCashBlocked: string | undefined;

  // Mirror split recon onto cash sibling transaction — set derived cash when reconciled.
  try {
    const drvMeta = metaOf(linked.driver);
    const fillGroupId = typeof drvMeta.fillGroupId === "string" ? drvMeta.fillGroupId : "";
    if (
      fillGroupId &&
      (drvMeta.splitVariance === true ||
        drvMeta.splitReconciled === true ||
        drvMeta.splitDerivedCashAmount != null)
    ) {
      const tx = await loadCashSiblingTx(fillGroupId);
      if (tx) {
        const tm = metaOf(tx);
        const reconciled = drvMeta.splitReconciled === true;
        const derivedCash = Math.abs(Number(drvMeta.splitDerivedCashAmount) || 0);

        if (reconciled) {
          const orgId = String(
            tx.organizationId || linked.driver.organizationId || linked.statement.organizationId || "",
          );
          const driverId = String(tx.driverId || linked.driver.driverId || "");
          const fillDate = String(tx.date || linked.driver.date || "");

          const plan = await planSplitCashPeriodLanding({
            orgId,
            driverId,
            fillDate,
          });

          const applied = applySplitCashMatchToTx({
            tx: tx as {
              id: string;
              date?: string;
              status?: string;
              amount?: number;
              metadata?: Record<string, unknown> | null;
            },
            plan,
            derivedCashPositive: derivedCash,
            drvMeta,
            reconciled: true,
          });

          if (applied.outcome === "blocked") {
            console.error(
              "[persistFuelMatchPair] split cash re-home blocked",
              {
                fillGroupId,
                fillWeekKey: applied.fillWeekKey,
                blockedReason: applied.blockedReason,
              },
            );
            splitCashBlocked = applied.blockedReason;
            await kv.set(`transaction:${tx.id}`, applied.tx);
          } else {
            if (applied.outcome === "rehome" && applied.rehomeToWeek) {
              splitCashRehome = applied.rehomeToWeek;
            }
            await kv.set(`transaction:${tx.id}`, applied.tx);

            // Sync linked cash fuel_entry amount (physical date stays on fill)
            const linkedEntryId =
              typeof tm.linkedFuelEntryId === "string"
                ? tm.linkedFuelEntryId
                : typeof tx.fuelEntryId === "string"
                  ? tx.fuelEntryId
                  : null;
            if (linkedEntryId && applied.fuelEntryMeta) {
              const fe = await kv.get(`fuel_entry:${linkedEntryId}`);
              if (fe && typeof fe === "object") {
                const entry = fe as Record<string, unknown>;
                const em = metaOf(entry);
                await kv.set(`fuel_entry:${linkedEntryId}`, {
                  ...entry,
                  amount: applied.fuelEntryAmount,
                  metadata: {
                    ...em,
                    ...applied.fuelEntryMeta,
                  },
                });
              }
            }
          }
        } else {
          const applied = applySplitCashMatchToTx({
            tx: tx as {
              id: string;
              date?: string;
              status?: string;
              amount?: number;
              metadata?: Record<string, unknown> | null;
            },
            plan: {
              action: "write_in_place",
              fillWeekKey: "",
              originalFillDate: "",
            },
            derivedCashPositive: derivedCash,
            drvMeta,
            reconciled: false,
          });
          await kv.set(`transaction:${tx.id}`, applied.tx);
        }
      }
    }
  } catch (sibErr) {
    console.error("[persistFuelMatchPair] split cash sibling stamp failed (non-fatal)", sibErr);
  }

  // Reload after cycle stamp so attach reads latest money/odo/meta
  const statementFresh =
    (await kv.get(`fuel_entry:${linked.statement.id}`)) || linked.statement;
  const driverFresh = (await kv.get(`fuel_entry:${linked.driver.id}`)) || linked.driver;

  let stationHeal: AttachJaaPairResult | undefined;
  try {
    stationHeal = await attachJaaPairIfUniqueMerchant(
      statementFresh as Record<string, unknown>,
      driverFresh as Record<string, unknown>,
    );
  } catch (e) {
    console.error("[persistFuelMatchPair] station heal failed", e);
    stationHeal = {
      attached: false,
      reason: e instanceof Error ? e.message : "Station heal error",
    };
  }

  return {
    ok: true,
    statementId: String(linked.statement.id),
    driverId: String(linked.driver.id),
    stationHeal,
    splitCashRehome,
    splitCashBlocked,
  };
}
