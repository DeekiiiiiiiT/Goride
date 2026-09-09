/**
 * Cross-system close invariants (audit §6.4).
 *
 * `checkPeriodInvariants` (periodInvariants.ts) only checks a period row against
 * ITSELF. §6.4 requires that the period projection also ties to the independent
 * fuel / toll / earnings statements and to the week P&L — enforced as a
 * PRECONDITION of closing, not overnight. Any failure blocks the close and
 * produces a named, actionable drift record.
 *
 *   close(week) requires, for every driver:
 *     |period.fuel_deduction         − fuelStatement.driverShare|       ≤ ε
 *     |period.fuel_fleet_share       − fuelStatement.companyShare|      ≤ ε
 *     |period.toll_spend             − tollStatement.totalSpend|        ≤ ε
 *     |period.toll_charged_to_driver − tollStatement.chargedToDriver|   ≤ ε
 *     |period.cash_collected         − earningsStatement.passengerCash| ≤ ε
 *     earnings_gross = driver_share + fleet_share + tips_paid
 *     Σ statement amounts by account = 0                (true double-entry)
 *     Σ driver settlements for week  = BusinessFinance week P&L
 */
import { round2 } from './money.ts';

/** JMD closing tolerance (1 cent). */
export const CLOSE_INVARIANT_EPS = 0.01;

export type CloseInvariantSeverity = 'block' | 'warn';

export type CloseBlocker = {
  /** Stable machine code, e.g. FUEL_DRIVER_SHARE_MISMATCH. */
  code: string;
  severity: CloseInvariantSeverity;
  driverId?: string;
  week?: string;
  /** Value on the persisted period projection. */
  persisted: number;
  /** Value the independent source (statement / identity) expects. */
  expected: number;
  /** persisted − expected, rounded. */
  delta: number;
  message: string;
};

/** Period projection fields consumed by the close invariants (major units). */
export type ClosePeriodRow = {
  driver_id?: string | null;
  period_anchor?: string | null;
  fuel_deduction?: number | null;
  fuel_fleet_share?: number | null;
  toll_spend?: number | null;
  toll_cash_spend?: number | null;
  toll_tag_spend?: number | null;
  toll_charged_to_driver?: number | null;
  cash_collected?: number | null;
  driver_share?: number | null;
  fleet_share?: number | null;
  tips_paid_to_driver?: number | null;
  earnings_gross?: number | null;
  settlement_amount?: number | null;
  /**
   * Passenger cash still with the driver after share math (adjCashBalance).
   * When settlement residual is settled, this is applied share — not a close Collect gate.
   */
  cash_still_held?: number | null;
  /** Used for H-5 cashHeldClamped close blocker. */
  metadata?: Record<string, unknown> | null;
};

/** Independent statement values (major units) the period must tie to. */
export type CloseFuelStatement = {
  driverShare: number;
  companyShare: number;
  /** Pass 3: draft/unverified statements cannot close the week. */
  status?: 'draft' | 'closed' | 'restated';
};
export type CloseTollStatement = {
  totalSpend: number;
  chargedToDriver: number;
  reimbursed?: number;
  netLoss?: number;
  cashWashSpend?: number;
  tagSpend?: number;
  status?: 'draft' | 'closed' | 'restated';
};
export type CloseEarningsStatement = {
  passengerCash: number;
  driverShare?: number;
  companyShare?: number;
  tipsPaidToDriver?: number;
  status?: 'draft' | 'closed' | 'restated';
};

export type CloseInvariantInput = {
  period: ClosePeriodRow;
  fuelStatement?: CloseFuelStatement | null;
  tollStatement?: CloseTollStatement | null;
  earningsStatement?: CloseEarningsStatement | null;
  /**
   * Sum of every posted statement amount by account for the week. True
   * double-entry closes to 0; a nonzero value is an unbalanced book.
   */
  statementAccountSum?: number | null;
  /** Sum of driver settlements for the week — must equal businessWeekPnl. */
  settlementSumForWeek?: number | null;
  /** BusinessFinance week P&L for the same week. */
  businessWeekPnl?: number | null;
  /**
   * When settlementSumForWeek is set but P&L feed is unavailable, emit an
   * explicit warn (never a silent pass that looks like the lanes tied).
   */
  businessWeekPnlUnavailable?: boolean;
  /**
   * M-1: absolute trip-CSV vs ledger cash disagreement on the period.
   * Values above ε block close (badge-only was the old intentional behavior).
   * Declared explicitly — it is read below but the field was missing, so every
   * caller passing it was an excess-property type error.
   */
  cashSourceMismatch?: number | null;
  /**
   * When re-signing restatements on an already-frozen week, skip desk open-balance
   * gates (fleet owes / driver owes / cash held) — those apply to first close only.
   */
  skipSettlementDeskClear?: boolean;
  /**
   * Toll rows in spend whose payment method is neither cash nor tag. They break
   * the toll_spend = cash + tag identity by exactly this amount, so they are
   * reported as TOLL_PAYMENT_METHOD_UNKNOWN (actionable) instead of a bare
   * TOLL_SPEND_SPLIT (which names no cause). Read from
   * metadata.financeCore.tollUnknownPm*.
   */
  tollUnknownPmCount?: number | null;
  tollUnknownPmAmount?: number | null;
  /**
   * Pass 5: statement↔engine drifts for closed lanes. Each becomes a block
   * (FUEL_ENGINE_DRIFT / TOLL_ENGINE_DRIFT / EARNINGS_ENGINE_DRIFT).
   */
  engineDrifts?: Array<{
    code: string;
    severity: CloseInvariantSeverity;
    driverId?: string;
    week?: string;
    persisted: number;
    expected: number;
    delta: number;
    message: string;
  }> | null;
  /**
   * Engine vs operational ledger (toll inflation audit): active toll_usage
   * events must resolve to live spend-eligible toll_ledger rows at matching amounts.
   */
  tollEventLedger?: {
    orphanCount: number;
    orphanAmountMajor: number;
    eventSpendMajor: number;
    ledgerSpendMajor: number;
    /** Live toll rows with no active toll_usage event — spend understated. */
    missingEventCount?: number;
    missingEventAmountMajor?: number;
    /** Active events on quarantined / non-spend ledger rows (Audit §10). */
    ineligibleEventCount?: number;
    ineligibleEventAmountMajor?: number;
    /** Live spend rows where abs(event) ≠ abs(ledger). */
    amountMismatchCount?: number;
    amountMismatchAmountMajor?: number;
  } | null;
  eps?: number;
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pushIfDrift(
  out: CloseBlocker[],
  eps: number,
  ctx: { driverId?: string; week?: string },
  code: string,
  message: string,
  persisted: number,
  expected: number,
  severity: CloseInvariantSeverity = 'block',
) {
  const delta = round2(persisted - expected);
  if (Math.abs(delta) <= eps) return;
  out.push({
    code,
    severity,
    driverId: ctx.driverId,
    week: ctx.week,
    persisted: round2(persisted),
    expected: round2(expected),
    delta,
    message,
  });
}

/**
 * Run all §6.4 cross-system invariants for one driver-week. Returns every
 * blocker; an empty array means the week ties and may close. Missing statements
 * are themselves blockers — you cannot close a week whose sources are absent.
 */
export function checkCloseInvariants(input: CloseInvariantInput): CloseBlocker[] {
  const eps = input.eps ?? CLOSE_INVARIANT_EPS;
  const p = input.period;
  const ctx = {
    driverId: p.driver_id != null ? String(p.driver_id) : undefined,
    week: p.period_anchor != null ? String(p.period_anchor).slice(0, 10) : undefined,
  };
  const out: CloseBlocker[] = [];

  // ── Fuel lane ──────────────────────────────────────────────────────────────
  if (!input.fuelStatement) {
    out.push({
      code: 'FUEL_STATEMENT_MISSING',
      severity: 'block',
      driverId: ctx.driverId,
      week: ctx.week,
      persisted: num(p.fuel_deduction),
      expected: 0,
      delta: round2(num(p.fuel_deduction)),
      message: 'No fuel statement published for this driver-week',
    });
  } else if (input.fuelStatement.status && input.fuelStatement.status !== 'closed') {
    // Pass 3: draft/unverified fuel cannot close (H-7 independence).
    out.push({
      code: 'FUEL_STATEMENT_UNVERIFIED',
      severity: 'block',
      driverId: ctx.driverId,
      week: ctx.week,
      persisted: num(p.fuel_deduction),
      expected: num(input.fuelStatement.driverShare),
      delta: round2(num(p.fuel_deduction) - num(input.fuelStatement.driverShare)),
      message: 'Fuel statement is draft/unverified — finalize fuel before close',
    });
  } else {
    pushIfDrift(
      out, eps, ctx,
      'FUEL_DRIVER_SHARE_MISMATCH',
      'period.fuel_deduction ≠ fuelStatement.driverShare',
      num(p.fuel_deduction), num(input.fuelStatement.driverShare),
    );
    pushIfDrift(
      out, eps, ctx,
      'FUEL_FLEET_SHARE_MISMATCH',
      'period.fuel_fleet_share ≠ fuelStatement.companyShare',
      num(p.fuel_fleet_share), num(input.fuelStatement.companyShare),
    );
  }

  // ── Toll lane ────────────────────────────────────────────────────────────────
  if (!input.tollStatement) {
    out.push({
      code: 'TOLL_STATEMENT_MISSING',
      severity: 'block',
      driverId: ctx.driverId,
      week: ctx.week,
      persisted: num(p.toll_spend),
      expected: 0,
      delta: round2(num(p.toll_spend)),
      message: 'No toll statement published for this driver-week',
    });
  } else if (input.tollStatement.status && input.tollStatement.status !== 'closed') {
    out.push({
      code: 'TOLL_STATEMENT_UNVERIFIED',
      severity: 'block',
      driverId: ctx.driverId,
      week: ctx.week,
      persisted: num(p.toll_spend),
      expected: num(input.tollStatement.totalSpend),
      delta: round2(num(p.toll_spend) - num(input.tollStatement.totalSpend)),
      message: 'Toll statement is draft/unverified — seal from canonical events before close',
    });
  } else {
    pushIfDrift(
      out, eps, ctx,
      'TOLL_SPEND_MISMATCH',
      'period.toll_spend ≠ tollStatement.totalSpend',
      num(p.toll_spend), num(input.tollStatement.totalSpend),
    );
    pushIfDrift(
      out, eps, ctx,
      'TOLL_CHARGED_MISMATCH',
      'period.toll_charged_to_driver ≠ tollStatement.chargedToDriver',
      num(p.toll_charged_to_driver), num(input.tollStatement.chargedToDriver),
    );
    // Toll four-card identity: Spend − Reimbursed − ChargedToDrivers − NetLoss ≈ 0
    if (
      input.tollStatement.reimbursed != null ||
      input.tollStatement.netLoss != null
    ) {
      const residual = round2(
        num(input.tollStatement.totalSpend) -
          num(input.tollStatement.reimbursed) -
          num(input.tollStatement.chargedToDriver) -
          num(input.tollStatement.netLoss),
      );
      pushIfDrift(
        out, eps, ctx,
        'TOLL_IDENTITY_UNBALANCED',
        'Spend − Reimbursed − ChargedToDrivers − NetLoss ≠ 0',
        residual, 0,
      );
    }
  }

  // toll_spend must equal cash + tag (audit §6.2 — close blocker, not nightly-only).
  {
    const tollSpend = num(p.toll_spend);
    const tollCash = num(p.toll_cash_spend);
    const tollTag = num(p.toll_tag_spend);
    const unknownCount = Math.max(0, Math.trunc(num(input.tollUnknownPmCount)));
    const unknownAmount = round2(num(input.tollUnknownPmAmount));

    // A row with no payment method lands in toll_spend but in neither bucket, so
    // the split below breaks by exactly that amount. Name the real cause first —
    // a bare "spend ≠ cash + tag" gives an operator nothing to act on.
    if (unknownCount > 0 || Math.abs(unknownAmount) > eps) {
      out.push({
        code: 'TOLL_PAYMENT_METHOD_UNKNOWN',
        severity: 'block',
        driverId: ctx.driverId,
        week: ctx.week,
        persisted: round2(tollCash + tollTag),
        expected: tollSpend,
        delta: unknownAmount,
        message:
          `${unknownCount} toll row(s) have no cash/tag payment method ` +
          `($${Math.abs(unknownAmount).toFixed(2)}) — set the payment method on each, ` +
          `then rebuild the week before close`,
      });
    }

    if (tollSpend > 0 || tollCash > 0 || tollTag > 0) {
      const splitGap = round2(tollSpend - round2(tollCash + tollTag));
      // Only report the raw split when it is NOT already explained by unknown-PM
      // rows — otherwise the operator gets two blockers for one cause.
      const explainedByUnknownPm =
        (unknownCount > 0 || Math.abs(unknownAmount) > eps) &&
        Math.abs(splitGap - unknownAmount) <= eps;
      if (!explainedByUnknownPm) {
        pushIfDrift(
          out, eps, ctx,
          'TOLL_SPEND_SPLIT',
          'period.toll_spend ≠ toll_cash_spend + toll_tag_spend',
          tollSpend, round2(tollCash + tollTag),
        );
      }
    }
  }

  // Engine vs live toll ledger — orphaned / ineligible / mismatched toll_usage.
  if (input.tollEventLedger) {
    const tel = input.tollEventLedger;

    const ineligibleCount = Math.max(0, Math.trunc(num(tel.ineligibleEventCount)));
    const ineligibleAmount = round2(num(tel.ineligibleEventAmountMajor));
    if (ineligibleCount > 0 || Math.abs(ineligibleAmount) > eps) {
      out.push({
        code: 'TOLL_EVENT_INELIGIBLE',
        severity: 'block',
        driverId: ctx.driverId,
        week: ctx.week,
        persisted: round2(tel.eventSpendMajor),
        expected: round2(tel.ledgerSpendMajor),
        delta: ineligibleAmount,
        message:
          `${ineligibleCount} toll money event(s) sit on quarantined/voided rows ` +
          `($${Math.abs(ineligibleAmount).toFixed(2)}) — reverse before close`,
      });
    }

    const mismatchCount = Math.max(0, Math.trunc(num(tel.amountMismatchCount)));
    const mismatchAmount = round2(num(tel.amountMismatchAmountMajor));
    if (mismatchCount > 0 || Math.abs(mismatchAmount) > eps) {
      out.push({
        code: 'TOLL_EVENT_AMOUNT_MISMATCH',
        severity: 'block',
        driverId: ctx.driverId,
        week: ctx.week,
        persisted: round2(tel.eventSpendMajor),
        expected: round2(tel.ledgerSpendMajor),
        delta: mismatchAmount,
        message:
          `${mismatchCount} toll money event(s) amount ≠ live ledger ` +
          `($${Math.abs(mismatchAmount).toFixed(2)}) — repair before close`,
      });
    }

    // Opposite direction: a live toll with no event is spend never counted.
    const missingCount = Math.max(0, Math.trunc(num(tel.missingEventCount)));
    const missingAmount = round2(num(tel.missingEventAmountMajor));
    if (missingCount > 0 || Math.abs(missingAmount) > eps) {
      out.push({
        code: 'TOLL_EVENT_MISSING',
        severity: 'block',
        driverId: ctx.driverId,
        week: ctx.week,
        persisted: round2(tel.eventSpendMajor),
        expected: round2(tel.ledgerSpendMajor),
        delta: missingAmount,
        message:
          `${missingCount} live toll row(s) have no money event ` +
          `($${Math.abs(missingAmount).toFixed(2)} of spend not counted) — ` +
          `re-post before close`,
      });
    }

    if (tel.orphanCount > 0 || Math.abs(tel.orphanAmountMajor) > eps) {
      out.push({
        code: 'TOLL_EVENT_ORPHANED',
        severity: 'block',
        driverId: ctx.driverId,
        week: ctx.week,
        persisted: round2(tel.eventSpendMajor),
        expected: round2(tel.ledgerSpendMajor),
        delta: round2(tel.orphanAmountMajor || tel.eventSpendMajor - tel.ledgerSpendMajor),
        message: `${tel.orphanCount} toll money event(s) have no live toll row ($${round2(tel.orphanAmountMajor).toFixed(2)}) — repair before close`,
      });
    } else if (
      missingCount === 0 &&
      Math.abs(missingAmount) <= eps &&
      ineligibleCount === 0 &&
      Math.abs(ineligibleAmount) <= eps &&
      mismatchCount === 0 &&
      Math.abs(mismatchAmount) <= eps
    ) {
      // Skip when the gap is already explained by a more specific blocker.
      pushIfDrift(
        out, eps, ctx,
        'TOLL_EVENT_ORPHANED',
        'Σ active toll_usage events ≠ Σ live toll_ledger spend',
        num(tel.eventSpendMajor), num(tel.ledgerSpendMajor),
      );
    }
  }

  // ── Earnings / cash lane ──────────────────────────────────────────────────────
  if (!input.earningsStatement) {
    out.push({
      code: 'EARNINGS_STATEMENT_MISSING',
      severity: 'block',
      driverId: ctx.driverId,
      week: ctx.week,
      persisted: num(p.cash_collected),
      expected: 0,
      delta: round2(num(p.cash_collected)),
      message: 'No earnings statement published for this driver-week',
    });
  } else if (input.earningsStatement.status && input.earningsStatement.status !== 'closed') {
    out.push({
      code: 'EARNINGS_STATEMENT_UNVERIFIED',
      severity: 'block',
      driverId: ctx.driverId,
      week: ctx.week,
      persisted: num(p.cash_collected),
      expected: num(input.earningsStatement.passengerCash),
      delta: round2(num(p.cash_collected) - num(input.earningsStatement.passengerCash)),
      message: 'Earnings statement is draft/unverified — rebuild must publish from engines',
    });
  } else {
    pushIfDrift(
      out, eps, ctx,
      'CASH_COLLECTED_MISMATCH',
      'period.cash_collected ≠ earningsStatement.passengerCash',
      num(p.cash_collected), num(input.earningsStatement.passengerCash),
    );
  }

  // ── earnings_gross = driver_share + fleet_share + tips_paid ────────────────────
  const gross = num(p.earnings_gross);
  if (gross > 0) {
    const identity = round2(
      num(p.driver_share) + num(p.fleet_share) + num(p.tips_paid_to_driver),
    );
    pushIfDrift(
      out, eps, ctx,
      'EARNINGS_GROSS_IDENTITY',
      'earnings_gross ≠ driver_share + fleet_share + tips_paid',
      gross, identity,
    );
  }

  // ── Σ statement amounts by account = 0 (true double-entry) ─────────────────────
  if (input.statementAccountSum != null) {
    pushIfDrift(
      out, eps, ctx,
      'STATEMENT_ACCOUNTS_UNBALANCED',
      'Σ statement amounts by account ≠ 0',
      num(input.statementAccountSum), 0,
    );
  }

  // ── Σ driver settlements for week = BusinessFinance week P&L ────────────────────
  if (input.settlementSumForWeek != null && input.businessWeekPnl != null) {
    pushIfDrift(
      out, eps, ctx,
      'SETTLEMENT_PNL_MISMATCH',
      'Σ driver settlements for week ≠ BusinessFinance week P&L',
      num(input.settlementSumForWeek), num(input.businessWeekPnl),
    );
  } else if (
    input.settlementSumForWeek != null &&
    input.businessWeekPnl == null &&
    input.businessWeekPnlUnavailable
  ) {
    out.push({
      code: 'BUSINESS_WEEK_PNL_UNAVAILABLE',
      severity: 'warn',
      driverId: ctx.driverId,
      week: ctx.week,
      persisted: num(input.settlementSumForWeek),
      expected: 0,
      delta: round2(num(input.settlementSumForWeek)),
      message: 'Business Finance week P&L not available — settlement↔P&L tie skipped',
    });
  }

  // ── M-1: cash source mismatch blocks close ─────────────────────────────────────
  if (input.cashSourceMismatch != null && Math.abs(num(input.cashSourceMismatch)) > eps) {
    pushIfDrift(
      out, eps, ctx,
      'CASH_SOURCE_MISMATCH',
      'trip CSV Uber cash disagrees with ledger payout_cash beyond ε',
      num(input.cashSourceMismatch), 0,
    );
  }

  // ── Settlement desk clear before freeze (PERIOD_FROZEN traps unpaid money) ──────
  if (!input.skipSettlementDeskClear) {
    const settlementAmount = num(p.settlement_amount);
    if (settlementAmount > eps) {
      out.push({
        code: 'SETTLEMENT_FLEET_OWES',
        severity: 'block',
        driverId: ctx.driverId,
        week: ctx.week,
        persisted: round2(settlementAmount),
        expected: 0,
        delta: round2(settlementAmount),
        message: 'Fleet still owes this driver — Pay remaining on Cash desk before close',
      });
    } else if (settlementAmount < -eps) {
      out.push({
        code: 'SETTLEMENT_DRIVER_OWES',
        severity: 'block',
        driverId: ctx.driverId,
        week: ctx.week,
        persisted: round2(settlementAmount),
        expected: 0,
        delta: round2(settlementAmount),
        message: 'Driver still owes cash — Collect remaining on Cash desk before close',
      });
    }
    // Driver-share-first: cash_still_held after residual≈0 is passenger cash already
    // applied to the driver’s share — not fleet Collect. Open residuals are gated only by
    // SETTLEMENT_FLEET_OWES / SETTLEMENT_DRIVER_OWES (do not also SETTLEMENT_CASH_HELD).
    // (Intentionally no SETTLEMENT_CASH_HELD here.)

    // H-5: clamped-negative cash held was recorded but never blocked close.
    const fc = (p.metadata?.financeCore || {}) as Record<string, unknown>;
    if (fc.cashHeldClamped === true) {
      const unclamped = num(fc.unclampedCashHeld);
      out.push({
        code: 'CASH_HELD_OVER_RETURNED',
        severity: 'block',
        driverId: ctx.driverId,
        week: ctx.week,
        persisted: round2(unclamped),
        expected: 0,
        delta: round2(unclamped),
        message:
          'Fleet returned more cash than the driver held — resolve over-return before close',
      });
    }
  }

  // ── Pass 5: statement ↔ fresh engine (post-cutover failability) ─────────────────
  if (input.engineDrifts && input.engineDrifts.length > 0) {
    for (const d of input.engineDrifts) {
      out.push({
        code: d.code,
        severity: d.severity === 'warn' ? 'warn' : 'block',
        driverId: d.driverId ?? ctx.driverId,
        week: d.week ?? ctx.week,
        persisted: round2(d.persisted),
        expected: round2(d.expected),
        delta: round2(d.delta),
        message: d.message,
      });
    }
  }

  return out;
}

/** True when the week ties and no blocking invariant failed. */
export function canCloseWeek(blockers: readonly CloseBlocker[]): boolean {
  return !blockers.some((b) => b.severity === 'block');
}
