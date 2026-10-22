/**
 * One close-check input for the background worker and for Close Week.
 * Cash acceptance lives on the period row. Callers that skip this helper
 * and pass only the three statements re-block a week ops already accepted.
 */
import type {
  CashSourceAck,
  CloseBlocker,
  CloseEarningsStatement,
  CloseFuelStatement,
  CloseInvariantInput,
  ClosePeriodRow,
  CloseTollStatement,
} from './closeInvariants.ts';
import type { WeekStatement } from './weekStatement.ts';

export type FinanceCoreCashFields = {
  cashSourceMismatch: number;
  uberCash: number;
  uberTripCash: number;
  cashSourceAck: CashSourceAck | null;
  tollUnknownPmCount: number;
  tollUnknownPmAmount: number;
};

export function parseCashSourceAck(raw: unknown): CashSourceAck | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const reason = String(o.reason || '').trim();
  if (!reason) return null;
  const mismatchAtAck = Number(o.mismatchAtAck);
  if (!Number.isFinite(mismatchAtAck)) return null;
  return {
    at: String(o.at || ''),
    by: o.by != null ? String(o.by) : null,
    reason,
    uberCash: Number(o.uberCash) || 0,
    uberTripCash: Number(o.uberTripCash) || 0,
    mismatchAtAck,
  };
}

function numOrZero(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Live financeCore cash + unknown toll payment method. Not the frozen snapshot. */
export function readFinanceCoreCash(
  meta: Record<string, unknown> | null | undefined,
): FinanceCoreCashFields {
  const fc = (meta?.financeCore as Record<string, unknown> | undefined) || {};
  return {
    cashSourceMismatch: numOrZero(fc.cashSourceMismatch),
    uberCash: numOrZero(fc.uberCash),
    uberTripCash: numOrZero(fc.uberTripCash),
    cashSourceAck: parseCashSourceAck(fc.cashSourceAck),
    tollUnknownPmCount: numOrZero(fc.tollUnknownPmCount),
    tollUnknownPmAmount: numOrZero(fc.tollUnknownPmAmount),
  };
}

function minorToMajor(m: unknown): number {
  return (Number(m) || 0) / 100;
}

function statementStatusForClose(
  statement: WeekStatement,
  acceptRestatementDrafts: boolean,
): 'draft' | 'closed' | 'restated' {
  if (acceptRestatementDrafts && statement.status === 'draft' && statement.supersedes) return 'closed';
  return statement.status;
}

export function fuelStatementForClose(
  statement: WeekStatement | undefined,
  acceptRestatementDrafts = false,
): CloseFuelStatement | null {
  if (!statement) return null;
  return {
    driverShare: minorToMajor(statement.amountsMinor.driverShare),
    companyShare: minorToMajor(statement.amountsMinor.companyShare),
    status: statementStatusForClose(statement, acceptRestatementDrafts),
  };
}

export function tollStatementForClose(
  statement: WeekStatement | undefined,
  acceptRestatementDrafts = false,
): CloseTollStatement | null {
  if (!statement) return null;
  return {
    totalSpend: minorToMajor(statement.amountsMinor.totalSpend),
    chargedToDriver: minorToMajor(statement.amountsMinor.chargedToDriver),
    reimbursed: minorToMajor(statement.amountsMinor.reimbursed),
    netLoss: minorToMajor(statement.amountsMinor.netLoss),
    cashWashSpend: minorToMajor(statement.amountsMinor.cashWashSpend),
    tagSpend: minorToMajor(statement.amountsMinor.tagSpend),
    status: statementStatusForClose(statement, acceptRestatementDrafts),
  };
}

export function earningsStatementForClose(
  statement: WeekStatement | undefined,
  acceptRestatementDrafts = false,
): CloseEarningsStatement | null {
  if (!statement) return null;
  return {
    passengerCash: minorToMajor(statement.amountsMinor.passengerCash),
    driverShare: minorToMajor(statement.amountsMinor.driverShare),
    companyShare: minorToMajor(statement.amountsMinor.companyShare),
    tipsPaidToDriver: minorToMajor(statement.amountsMinor.tipsPaidToDriver),
    status: statementStatusForClose(statement, acceptRestatementDrafts),
  };
}

export function assembleCloseInvariantInput(parts: {
  period: ClosePeriodRow;
  fuelStatement?: CloseFuelStatement | null;
  tollStatement?: CloseTollStatement | null;
  earningsStatement?: CloseEarningsStatement | null;
  engineDrifts?: CloseInvariantInput['engineDrifts'];
  tollEventLedger?: CloseInvariantInput['tollEventLedger'];
  skipSettlementDeskClear?: boolean;
  statementAccountSum?: number | null;
  settlementSumForWeek?: number | null;
  businessWeekPnl?: number | null;
  businessWeekPnlUnavailable?: boolean;
  sourceBlockers?: CloseBlocker[] | null;
}): CloseInvariantInput {
  const cash = readFinanceCoreCash(parts.period.metadata ?? null);
  return {
    period: parts.period,
    fuelStatement: parts.fuelStatement ?? null,
    tollStatement: parts.tollStatement ?? null,
    earningsStatement: parts.earningsStatement ?? null,
    cashSourceMismatch: cash.cashSourceMismatch,
    uberCash: cash.uberCash,
    uberTripCash: cash.uberTripCash,
    cashSourceAck: cash.cashSourceAck,
    tollUnknownPmCount: cash.tollUnknownPmCount,
    tollUnknownPmAmount: cash.tollUnknownPmAmount,
    skipSettlementDeskClear: parts.skipSettlementDeskClear,
    engineDrifts: parts.engineDrifts ?? null,
    tollEventLedger: parts.tollEventLedger ?? null,
    statementAccountSum: parts.statementAccountSum,
    settlementSumForWeek: parts.settlementSumForWeek,
    businessWeekPnl: parts.businessWeekPnl,
    businessWeekPnlUnavailable: parts.businessWeekPnlUnavailable,
    sourceBlockers: parts.sourceBlockers,
  };
}
