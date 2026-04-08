/**
 * Single source of truth for canonical money aggregation (`ledger_event:*` → driver-overview shape).
 * Used by GET /ledger/driver-overview (canonical), import preview, and tests.
 *
 * Keep snapshot merge logic aligned with `src/utils/snapshotsFromCanonicalLedgerEvents.ts`.
 */

export type CanonicalMoneyEvent = {
  eventType: string;
  driverId: string;
  netAmount: number;
  grossAmount?: number;
  direction?: string;
  date: string;
  platform?: string;
  paymentMethod?: string;
  metadata?: Record<string, unknown>;
  periodStart?: string;
  periodEnd?: string;
};

function normPlatform(p: string | undefined): string {
  const x = (p || "").trim();
  if (x === "GoRide") return "Roam";
  return x || "Other";
}

function asMoneyEvent(raw: unknown): CanonicalMoneyEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  const eventType = typeof e.eventType === "string" ? e.eventType : "";
  const driverId = typeof e.driverId === "string" ? e.driverId : "";
  const date = typeof e.date === "string" ? e.date : "";
  if (!eventType || !driverId || !date) return null;
  const netAmount = Number(e.netAmount);
  if (!Number.isFinite(netAmount)) return null;
  return {
    eventType,
    driverId,
    netAmount,
    grossAmount: e.grossAmount !== undefined ? Number(e.grossAmount) : undefined,
    direction: typeof e.direction === "string" ? e.direction : undefined,
    date,
    platform: typeof e.platform === "string" ? e.platform : undefined,
    paymentMethod: typeof e.paymentMethod === "string" ? e.paymentMethod : undefined,
    metadata: e.metadata && typeof e.metadata === "object" && !Array.isArray(e.metadata)
      ? (e.metadata as Record<string, unknown>)
      : undefined,
    periodStart: typeof e.periodStart === "string" ? e.periodStart : undefined,
    periodEnd: typeof e.periodEnd === "string" ? e.periodEnd : undefined,
  };
}

function effectivePlatform(e: CanonicalMoneyEvent): string {
  if (e.platform && e.platform.trim()) return normPlatform(e.platform);
  const t = e.eventType;
  if (
    t === "statement_line" ||
    t === "payout_cash" ||
    t === "payout_bank" ||
    t === "toll_support_adjustment" ||
    t === "dispute_refund" ||
    t === "statement_adjustment"
  ) {
    return "Uber";
  }
  return "Other";
}

function filterByPlatforms(events: CanonicalMoneyEvent[], platformsParam: string | undefined): CanonicalMoneyEvent[] {
  if (!platformsParam?.trim()) return events;
  let plats = platformsParam.split(",").map((s) => s.trim()).filter(Boolean);
  if (plats.includes("Roam") && !plats.includes("GoRide")) plats = [...plats, "GoRide"];
  const set = new Set(plats);
  return events.filter((ev) => set.has(effectivePlatform(ev)));
}

/** Same bucketing as client `snapshotsFromCanonicalLedgerEvents`. */
function snapshotsFromCanonicalLedgerEventsInner(
  events: readonly CanonicalMoneyEvent[],
): Array<{
  driverId: string;
  periodStart: string;
  periodEnd: string;
  totalEarnings?: number;
  netFareStatement?: number;
  tipsStatement?: number;
  promotionsStatement?: number;
  refundsAndExpenses?: number;
  refundsToll?: number;
  cashCollected?: number;
  bankTransferred?: number;
  _has?: boolean;
}> {
  type Acc = NonNullable<ReturnType<typeof snapshotsFromCanonicalLedgerEventsInner>[number]>;
  const acc = new Map<string, Acc>();

  const periodKey = (e: CanonicalMoneyEvent) => {
    const ps = e.periodStart && /^\d{4}-\d{2}-\d{2}$/.test(e.periodStart) ? e.periodStart : e.date.slice(0, 10);
    const pe = e.periodEnd && /^\d{4}-\d{2}-\d{2}$/.test(e.periodEnd) ? e.periodEnd : e.date.slice(0, 10);
    return { ps, pe };
  };
  const bucketKey = (driverId: string, ps: string, pe: string) =>
    `${driverId.trim().toLowerCase()}|${ps}|${pe}`;

  const touch = (driverId: string, ps: string, pe: string): Acc => {
    const k = bucketKey(driverId, ps, pe);
    let row = acc.get(k);
    if (!row) {
      row = { driverId: driverId.trim(), periodStart: ps, periodEnd: pe, _has: false };
      acc.set(k, row);
    }
    return row;
  };

  for (const e of events) {
    const { ps, pe } = periodKey(e);
    const row = touch(e.driverId, ps, pe);

    if (e.eventType === "statement_line") {
      const code = typeof e.metadata?.lineCode === "string" ? e.metadata.lineCode : "";
      const mag = Math.abs(e.netAmount);
      const outflow = e.direction === "outflow";
      row._has = true;
      switch (code) {
        case "TOTAL_EARNINGS":
          row.totalEarnings = (row.totalEarnings ?? 0) + (outflow ? -mag : mag);
          break;
        case "NET_FARE":
          row.netFareStatement = (row.netFareStatement ?? 0) + (outflow ? -mag : mag);
          break;
        case "PROMOTIONS":
          row.promotionsStatement = (row.promotionsStatement ?? 0) + (outflow ? -mag : mag);
          break;
        case "TIPS":
          row.tipsStatement = (row.tipsStatement ?? 0) + (outflow ? -mag : mag);
          break;
        case "REFUNDS_EXPENSES":
          row.refundsAndExpenses = (row.refundsAndExpenses ?? 0) + mag;
          break;
        case "REFUNDS_TOLL":
          row.refundsToll = (row.refundsToll ?? 0) + mag;
          break;
        default:
          break;
      }
    } else if (e.eventType === "payout_cash") {
      row._has = true;
      row.cashCollected = (row.cashCollected ?? 0) + Math.abs(e.netAmount);
    } else if (e.eventType === "payout_bank") {
      row._has = true;
      row.bankTransferred = (row.bankTransferred ?? 0) + Math.abs(e.netAmount);
    }
  }

  return Array.from(acc.values()).filter((r) => r._has);
}

function mergeSnapshots(
  events: CanonicalMoneyEvent[],
): {
  netFareStatement: number;
  tipsStatement: number;
  promotionsStatement: number;
  refundsAndExpenses: number;
  refundsToll: number;
  totalEarnings: number;
  payoutCash: number;
  payoutBank: number;
  hasStatementLines: boolean;
} {
  const snaps = snapshotsFromCanonicalLedgerEventsInner(events);
  const out = {
    netFareStatement: 0,
    tipsStatement: 0,
    promotionsStatement: 0,
    refundsAndExpenses: 0,
    refundsToll: 0,
    totalEarnings: 0,
    payoutCash: 0,
    payoutBank: 0,
    hasStatementLines: false,
  };
  for (const s of snaps) {
    out.netFareStatement += s.netFareStatement ?? 0;
    out.tipsStatement += s.tipsStatement ?? 0;
    out.promotionsStatement += s.promotionsStatement ?? 0;
    out.refundsAndExpenses += s.refundsAndExpenses ?? 0;
    out.refundsToll += s.refundsToll ?? 0;
    out.totalEarnings += s.totalEarnings ?? 0;
    out.payoutCash += s.cashCollected ?? 0;
    out.payoutBank += s.bankTransferred ?? 0;
    if (
      s.totalEarnings != null ||
      s.netFareStatement != null ||
      s.tipsStatement != null ||
      s.promotionsStatement != null ||
      s.refundsAndExpenses != null ||
      s.refundsToll != null
    ) {
      out.hasStatementLines = true;
    }
  }
  return out;
}

type Accum = {
  pEarnings: number;
  pCash: number;
  /** Sum of `payout_bank` canonical lines (org statement). */
  pBankTransferred: number;
  pTolls: number;
  pTips: number;
  pBaseFare: number;
  pUberFareComponents: number;
  pUberTips: number;
  pUberPrior: number;
  pUberPromo: number;
  pUberRefund: number;
  /** From `TOTAL_EARNINGS` statement lines when present. */
  pStatementTotalEarnings: number;
  pPlatformFees: number;
  pPlatformFeesByPlatform: Record<string, number>;
  pFareGrossMinusNetByPlatform: Record<string, number>;
  pTripCount: number;
  pCancelledCount: number;
  pDisputeRefunds: number;
  pPlatformStats: Record<string, { earnings: number; tripCount: number; cashCollected: number; tolls: number }>;
  dailyMap: Record<string, { total: number; byPlatform: Record<string, number> }>;
};

function accumulateWindow(events: CanonicalMoneyEvent[], platformsParam?: string): Accum {
  const evs = filterByPlatforms(events, platformsParam);
  const stmt = mergeSnapshots(
    evs.filter((e) =>
      e.eventType === "statement_line" || e.eventType === "payout_cash" || e.eventType === "payout_bank"
    ),
  );

  /** Use CSV/statement rows for Uber fare totals (and skip per-trip fare_earning for Uber). */
  const stmtHasFareBearingTotals =
    Math.abs(stmt.netFareStatement) > 1e-9 ||
    Math.abs(stmt.totalEarnings) > 1e-9 ||
    Math.abs(stmt.tipsStatement) > 1e-9 ||
    Math.abs(stmt.promotionsStatement) > 1e-9;

  const uberUseStatementForFare = stmt.hasStatementLines && stmtHasFareBearingTotals;

  /**
   * Legacy bug: REFUNDS_EXPENSES alone set `uberHasStatement` and zeroed fare while still skipping
   * Uber `fare_earning` rows. Only suppress trip fares when statement actually carries fare lines.
   */
  const uberHasStatement = uberUseStatementForFare;

  const a: Accum = {
    pEarnings: 0,
    pCash: stmt.payoutCash,
    pBankTransferred: stmt.payoutBank,
    pTolls: 0,
    pTips: 0,
    pBaseFare: 0,
    pUberFareComponents: 0,
    pUberTips: 0,
    pUberPrior: 0,
    pUberPromo: 0,
    pUberRefund: 0,
    pStatementTotalEarnings: 0,
    pPlatformFees: 0,
    pPlatformFeesByPlatform: {},
    pFareGrossMinusNetByPlatform: {},
    pTripCount: 0,
    pCancelledCount: 0,
    pDisputeRefunds: 0,
    pPlatformStats: {},
    dailyMap: {},
  };

  const ensurePlat = (plat: string) => {
    if (!a.pPlatformStats[plat]) {
      a.pPlatformStats[plat] = { earnings: 0, tripCount: 0, cashCollected: 0, tolls: 0 };
    }
  };

  if (uberUseStatementForFare) {
    a.pUberFareComponents = stmt.netFareStatement;
    a.pUberTips = stmt.tipsStatement;
    a.pUberPromo = stmt.promotionsStatement;
    a.pUberRefund = stmt.refundsAndExpenses;
    a.pStatementTotalEarnings = stmt.totalEarnings;
    a.pTips += stmt.tipsStatement;
    a.pEarnings += stmt.netFareStatement + stmt.tipsStatement + stmt.promotionsStatement - stmt.refundsAndExpenses;
  } else if (stmt.refundsAndExpenses > 1e-9) {
    /** Statement refunds without fare lines: still subtract from period (fare from trip rows). */
    a.pUberRefund += stmt.refundsAndExpenses;
    a.pEarnings -= stmt.refundsAndExpenses;
    ensurePlat("Uber");
    a.pPlatformStats["Uber"].earnings -= stmt.refundsAndExpenses;
  }

  const addDaily = (day: string | undefined, plat: string, amt: number) => {
    if (!day) return;
    if (!a.dailyMap[day]) a.dailyMap[day] = { total: 0, byPlatform: {} };
    a.dailyMap[day].total += amt;
    a.dailyMap[day].byPlatform[plat] = (a.dailyMap[day].byPlatform[plat] || 0) + amt;
  };

  if (uberUseStatementForFare) {
    ensurePlat("Uber");
    a.pPlatformStats["Uber"].earnings =
      stmt.netFareStatement + stmt.tipsStatement + stmt.promotionsStatement - stmt.refundsAndExpenses;
    if (Math.abs(stmt.payoutCash) > 0.0001) {
      a.pPlatformStats["Uber"].cashCollected = stmt.payoutCash;
    }
  }

  /** When org statement includes cash collected, do not also sum per-trip cash (double-count). */
  const skipUberTripCashBecauseStatement = Math.abs(stmt.payoutCash) > 0.0001;

  for (const e of evs) {
    const net = e.netAmount;
    const gross = Number.isFinite(e.grossAmount) ? (e.grossAmount as number) : Math.abs(net);
    const plat = effectivePlatform(e);
    const et = e.eventType;

    if (et === "statement_line" || et === "payout_cash" || et === "payout_bank") {
      continue;
    }

    if (
      plat === "Uber" &&
      uberHasStatement &&
      (et === "fare_earning" || et === "tip" || et === "promotion" || et === "refund_expense")
    ) {
      if (et === "fare_earning") {
        a.pTripCount += 1;
        a.pBaseFare += gross;
        a.pFareGrossMinusNetByPlatform[plat] = (a.pFareGrossMinusNetByPlatform[plat] || 0) + (gross - net);
        ensurePlat(plat);
        a.pPlatformStats[plat].tripCount += 1;
        if (e.paymentMethod === "Cash" && !skipUberTripCashBecauseStatement) {
          const cashAmt = e.metadata?.cashCollected != null
            ? Number(e.metadata.cashCollected)
            : Math.abs(net);
          a.pCash += cashAmt;
          a.pPlatformStats[plat].cashCollected += cashAmt;
        }
      }
      continue;
    }

    if (et === "fare_earning") {
      a.pTripCount += 1;
      a.pEarnings += net;
      a.pBaseFare += gross;
      a.pFareGrossMinusNetByPlatform[plat] = (a.pFareGrossMinusNetByPlatform[plat] || 0) + (gross - net);
      ensurePlat(plat);
      a.pPlatformStats[plat].earnings += net;
      a.pPlatformStats[plat].tripCount += 1;
      if (e.paymentMethod === "Cash") {
        const cashAmt = e.metadata?.cashCollected != null
          ? Number(e.metadata.cashCollected)
          : Math.abs(net);
        a.pCash += cashAmt;
        a.pPlatformStats[plat].cashCollected += cashAmt;
      }
      if (plat === "Uber" && !uberHasStatement) {
        /** Match statement `NET_FARE` semantics (driver net), not passenger gross. */
        a.pUberFareComponents += net;
      }
      addDaily(e.date.slice(0, 10), plat, net);
    } else if (et === "tip") {
      a.pEarnings += net;
      a.pTips += net;
      ensurePlat(plat);
      a.pPlatformStats[plat].earnings += net;
      if (plat === "Uber" && !uberHasStatement) a.pUberTips += net;
      addDaily(e.date.slice(0, 10), plat, net);
    } else if (et === "prior_period_adjustment") {
      a.pEarnings += net;
      ensurePlat(plat);
      a.pPlatformStats[plat].earnings += net;
      if (plat === "Uber") a.pUberPrior += net;
      addDaily(e.date.slice(0, 10), plat, net);
    } else if (et === "promotion") {
      a.pEarnings += net;
      ensurePlat(plat);
      a.pPlatformStats[plat].earnings += net;
      if (plat === "Uber" && !uberHasStatement) a.pUberPromo += net;
      addDaily(e.date.slice(0, 10), plat, net);
    } else if (et === "refund_expense") {
      a.pEarnings += net;
      ensurePlat(plat);
      a.pPlatformStats[plat].earnings += net;
      if (plat === "Uber" && !uberHasStatement) a.pUberRefund += Math.abs(net);
      addDaily(e.date.slice(0, 10), plat, net);
    } else if (et === "toll_charge") {
      a.pTolls += Math.abs(net);
      ensurePlat(plat);
      a.pPlatformStats[plat].tolls += Math.abs(net);
    } else if (et === "platform_fee") {
      const fee = Math.abs(net);
      a.pPlatformFees += fee;
      a.pPlatformFeesByPlatform[plat] = (a.pPlatformFeesByPlatform[plat] || 0) + fee;
    } else if (et === "cancelled_trip_loss") {
      a.pCancelledCount += 1;
    } else if (et === "toll_support_adjustment" || et === "dispute_refund") {
      a.pEarnings += net;
      a.pDisputeRefunds += Math.abs(net);
      ensurePlat(plat);
      a.pPlatformStats[plat].earnings += net;
      addDaily(e.date.slice(0, 10), plat, net);
    } else if (et === "statement_adjustment") {
      a.pEarnings += net;
      ensurePlat(plat);
      a.pPlatformStats[plat].earnings += net;
      addDaily(e.date.slice(0, 10), plat, net);
    }
  }

  return a;
}

function toDailyEarnings(dailyMap: Accum["dailyMap"]) {
  return Object.entries(dailyMap)
    .map(([date, val]) => ({ date, total: Number(val.total.toFixed(2)), byPlatform: val.byPlatform }))
    .sort((x, y) => x.date.localeCompare(y.date));
}

/** ISO yyyy-MM-dd slice, or null if invalid. */
export function ymdSlice(s: string | undefined): string | null {
  if (!s || typeof s !== "string") return null;
  const y = s.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(y) ? y : null;
}

export function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(ymd + "T12:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Driver overview date filter: include rows whose `date` falls in [startDate, endDate], OR
 * (for statement / payout lines) whose `periodStart`..`periodEnd` overlaps that range.
 *
 * **Contrast with Roam/InDrive in the UI:** those platforms’ period cards often sum **`trip.date`** in-range
 * (simple interval). Uber money here is **ledger_event**-based, not raw trip rows — so a 1-day picker can
 * include Roam/InDrive trips for that day while Uber canonical rows need this window + statement rules.
 *
 * Import canonical events set `date` to the **earliest trip day** in the batch for Uber promotion/payout/REFUNDS_TOLL
 * (`buildCanonicalImportEvents`), so calendar-week filters align with trip activity; `periodStart`/`periodEnd` still carry
 * the statement window for overlap rules (e.g. driver-overview).
 *
 * Legacy rows often omitted `periodStart`/`periodEnd` in KV. `date` may be period end, a mid-week posting day,
 * or a **pay/settlement day many days after** the statement week (e.g. week ending Mar 29 but `date` Apr 10).
 * A ±7d band after `endDate` was still excluding those rows for a tight Mar 23–29 picker while Mar 28–Apr 4
 * worked — widen the post-period side so statement/payout lines still match the user’s CSV week.
 */
export function canonicalEventInSelectedWindow(
  v: Record<string, unknown>,
  startDate: string,
  endDate: string,
): boolean {
  const d = ymdSlice(v.date as string);
  if (d && d >= startDate && d <= endDate) return true;
  const ps = ymdSlice(v.periodStart as string);
  const pe = ymdSlice(v.periodEnd as string);
  if (ps && pe) return ps <= endDate && pe >= startDate;

  const et = typeof v.eventType === 'string' ? v.eventType : '';
  const isStatementish =
    et === 'statement_line' || et === 'payout_cash' || et === 'payout_bank';

  // Statement rows with only periodStart (no periodEnd): include if periodStart overlaps range
  if (isStatementish && ps && !pe) {
    if (ps >= startDate && ps <= endDate) return true;
  }

  // Widen band for statement rows whose `date` may be import/posting date rather than period date
  if (isStatementish && d) {
    const bandLo = addDaysYmd(startDate, -14);
    const bandHi = addDaysYmd(endDate, 21);
    if (d >= bandLo && d <= bandHi) return true;
  }
  return false;
}

/**
 * Maps canonical event rows into `LedgerDriverOverview`-compatible JSON (legacy driver-overview shape).
 */
export function aggregateCanonicalEventsToLedgerDriverOverview(
  periodRaw: unknown[],
  prevRaw: unknown[],
  lifetimeRaw: unknown[],
  platformsParam?: string,
): Record<string, unknown> {
  const period = periodRaw.map(asMoneyEvent).filter(Boolean) as CanonicalMoneyEvent[];
  const prev = prevRaw.map(asMoneyEvent).filter(Boolean) as CanonicalMoneyEvent[];
  const lifetime = lifetimeRaw.map(asMoneyEvent).filter(Boolean) as CanonicalMoneyEvent[];

  const p = accumulateWindow(period, platformsParam);
  const prevAgg = accumulateWindow(prev, platformsParam);
  const lt = accumulateWindow(lifetime, platformsParam);

  const uberNet = p.pUberFareComponents + p.pUberTips + p.pUberPrior + p.pUberPromo - p.pUberRefund;

  const dailyEarnings = toDailyEarnings(p.dailyMap);

  const completeness = {
    totalTrips: p.pTripCount,
    ledgerTrips: p.pTripCount,
    isComplete: true,
    missingCount: 0,
    byPlatform: {} as Record<string, { trips: number; ledger: number }>,
  };

  return {
    period: {
      earnings: Number(p.pEarnings.toFixed(2)),
      cashCollected: Number(p.pCash.toFixed(2)),
      bankTransferred: Number(p.pBankTransferred.toFixed(2)),
      tolls: Number(p.pTolls.toFixed(2)),
      tips: Number(p.pTips.toFixed(2)),
      baseFare: Number(p.pBaseFare.toFixed(2)),
      uber: {
        fareComponents: Number(p.pUberFareComponents.toFixed(2)),
        tips: Number(p.pUberTips.toFixed(2)),
        priorPeriodAdjustments: Number(p.pUberPrior.toFixed(2)),
        promotions: Number(p.pUberPromo.toFixed(2)),
        refundExpense: Number(p.pUberRefund.toFixed(2)),
        netEarnings: Number(uberNet.toFixed(2)),
        statementTotalEarnings: Number(p.pStatementTotalEarnings.toFixed(2)),
      },
      platformFees: Number(p.pPlatformFees.toFixed(2)),
      platformFeesByPlatform: Object.fromEntries(
        Object.entries(p.pPlatformFeesByPlatform).map(([k, v]) => [k, Number(v.toFixed(2))]),
      ),
      fareGrossMinusNetByPlatform: Object.fromEntries(
        Object.entries(p.pFareGrossMinusNetByPlatform).map(([k, v]) => [k, Number(v.toFixed(2))]),
      ),
      tripCount: p.pTripCount,
      cancelledCount: p.pCancelledCount,
      disputeRefunds: Number(p.pDisputeRefunds.toFixed(2)),
    },
    prevPeriod: {
      earnings: Number(prevAgg.pEarnings.toFixed(2)),
    },
    lifetime: {
      earnings: Number(lt.pEarnings.toFixed(2)),
      tripCount: lt.pTripCount,
      tripRecordCount: undefined,
      cashCollected: Number(lt.pCash.toFixed(2)),
      tolls: Number(lt.pTolls.toFixed(2)),
      uber: {
        fareComponents: Number(lt.pUberFareComponents.toFixed(2)),
        tips: Number(lt.pUberTips.toFixed(2)),
        priorPeriodAdjustments: Number(lt.pUberPrior.toFixed(2)),
        promotions: Number(lt.pUberPromo.toFixed(2)),
        refundExpense: Number(lt.pUberRefund.toFixed(2)),
        netEarnings: Number(
          (
            lt.pUberFareComponents +
            lt.pUberTips +
            lt.pUberPrior +
            lt.pUberPromo -
            lt.pUberRefund
          ).toFixed(2),
        ),
      },
      disputeRefunds: Number(lt.pDisputeRefunds.toFixed(2)),
      platformStats: Object.fromEntries(
        Object.entries(lt.pPlatformStats).map(([k, v]) => [
          k,
          {
            earnings: Number(v.earnings.toFixed(2)),
            tripCount: v.tripCount,
            cashCollected: Number(v.cashCollected.toFixed(2)),
            tolls: Number(v.tolls.toFixed(2)),
          },
        ]),
      ),
    },
    platformStats: Object.fromEntries(
      Object.entries(p.pPlatformStats).map(([k, v]) => [
        k,
        {
          earnings: Number(v.earnings.toFixed(2)),
          tripCount: v.tripCount,
          cashCollected: Number(v.cashCollected.toFixed(2)),
          tolls: Number(v.tolls.toFixed(2)),
        },
      ]),
    ),
    dailyEarnings,
    completeness,
    readModelSource: "canonical_events",
  };
}
