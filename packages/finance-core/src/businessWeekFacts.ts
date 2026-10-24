import { round2 } from './money.ts';
import { tieOut, uberEarningsTie, type TieOut } from './businessStatement.ts';
import { driverPaidFuelCredit } from './driverFuelCredit.ts';

const EPS = 0.01;

export type MovementFact = {
  kind: string;
  status: string;
  amountMinor: number;
  /** Kind of the movement this row reverses, when kind is reverse. */
  reversesKind?: string | null;
};

/** Posted pays and collections. A reverse reduces the kind it undoes. */
export function netSettlementMovements(rows: MovementFact[]): { paid: number; collected: number } {
  let paid = 0;
  let collected = 0;
  for (const row of rows) {
    if (String(row.status || '') !== 'posted') continue;
    const major = round2((Number(row.amountMinor) || 0) / 100);
    const kind = String(row.kind || '');
    if (kind === 'pay') paid += major;
    else if (kind === 'collect') collected += major;
    else if (kind === 'reverse') {
      if (row.reversesKind === 'collect') collected -= major;
      else if (row.reversesKind === 'pay' || !row.reversesKind) paid -= major;
    }
  }
  return { paid: round2(Math.max(0, paid)), collected: round2(Math.max(0, collected)) };
}

/** Cash the driver is carrying. An overpayment receivable is not cash. */
export function cashHeldExcludingReceivable(cashStillHeld: number, receivable: number): number {
  return round2(Math.max(0, (Number(cashStillHeld) || 0) - Math.max(0, Number(receivable) || 0)));
}

export type StatementFact = {
  kind: string;
  driverId: string;
  weekKey: string;
  version: number;
  status: string;
  amountsMinor: Record<string, number>;
};

export function latestStatements(rows: StatementFact[]): StatementFact[] {
  const map = new Map<string, StatementFact>();
  for (const row of rows) {
    const key = `${row.weekKey}|${row.driverId}|${row.kind}`;
    const prev = map.get(key);
    if (!prev || row.version >= prev.version) map.set(key, row);
  }
  return [...map.values()];
}

/** Closed only when every week has a closed fuel, toll, and earnings statement. */
export function periodSealStatus(latest: StatementFact[], weekKeys: string[]): 'Closed' | 'Open' {
  const weeks = [...new Set(weekKeys.map((w) => w.slice(0, 10)).filter(Boolean))];
  if (!weeks.length) return 'Open';
  for (const week of weeks) {
    const lanes = latest.filter((s) => s.weekKey.slice(0, 10) === week);
    for (const kind of ['fuel', 'toll', 'earnings']) {
      const ofKind = lanes.filter((s) => s.kind === kind);
      if (!ofKind.length || ofKind.some((s) => s.status !== 'closed')) return 'Open';
    }
  }
  return 'Closed';
}

export function sumStatementAmount(
  latest: StatementFact[],
  kind: string,
  field: string,
  onlyClosed = true,
): number {
  let n = 0;
  for (const row of latest) {
    if (row.kind !== kind) continue;
    if (onlyClosed && row.status !== 'closed') continue;
    n += (Number(row.amountsMinor?.[field]) || 0) / 100;
  }
  return round2(n);
}

/** Closed week uses the sealed statement. An open week uses the live fuel engine. */
export function companyFuelCost(input: {
  sealed: boolean;
  sealedCompanyShare: number;
  engineCompanyShare: number;
}): number {
  const sealedShare = round2(Number(input.sealedCompanyShare) || 0);
  const engineShare = round2(Number(input.engineCompanyShare) || 0);
  return input.sealed ? sealedShare : engineShare;
}

export function profitAfterCompanyFuel(input: {
  operatingProfit: number;
  fuelInProfit: number;
  companyFuel: number;
  fixedInProfit: number;
  fixedReplacement: number | null;
  cashBasis: boolean;
  payoutsInProfit: number;
  movementPays: number;
}): number {
  const fixedNext = input.fixedReplacement == null ? input.fixedInProfit : input.fixedReplacement;
  const payoutDelta = input.cashBasis ? input.movementPays - input.payoutsInProfit : 0;
  return round2(
    input.operatingProfit +
      input.fuelInProfit -
      input.companyFuel +
      input.fixedInProfit -
      fixedNext -
      payoutDelta,
  );
}

export type AgreementRow = TieOut & { held?: boolean; pending?: string };

export function agreementChecks(input: {
  ledgerGross: number;
  sealedEarningsGross: number;
  earningsHeld: boolean;
  ledgerFuel: number;
  sealedFuelSpend: number;
  ledgerTolls: number;
  sealedTollNet: number;
  payouts: number;
  movementPays: number;
  bankExpected: number;
  bankDeposits: number;
  statementSummary: number;
  ledgerStatement: number;
}): AgreementRow[] {
  const revenue = uberEarningsTie({
    ledgerUber: input.ledgerGross,
    uberTotal: input.sealedEarningsGross,
    weekStart: input.earningsHeld ? '2026-08-03' : '2026-01-05',
  });
  return [
    { ...tieOut('revenue', 'Revenue', input.ledgerGross, input.sealedEarningsGross), held: revenue.held },
    tieOut('fuel', 'Fuel', input.ledgerFuel, input.sealedFuelSpend),
    tieOut('tolls', 'Tolls', input.ledgerTolls, input.sealedTollNet),
    tieOut('payouts', 'Payouts (owed vs paid)', input.payouts, input.movementPays),
    tieOut('bank', 'Bank (expected vs received)', input.bankExpected, input.bankDeposits),
    tieOut('ledgers', 'Statement summary', input.statementSummary, input.ledgerStatement),
  ];
}

export function checksAllOk(rows: AgreementRow[]): boolean {
  return rows.every((row) => row.held || row.ok || Math.abs(row.difference) <= EPS);
}

/**
 * Fuel credit on a driver or admin settlement screen.
 * Company fuel share is not cash the driver laid out.
 */
export function settlementFuelCreditMajor(input: {
  amount?: number;
  companyShare?: number;
  driverPaidFuel?: number;
}): number {
  const driverPaid = Number(input.driverPaidFuel);
  if (Number.isFinite(driverPaid) && driverPaid > 0) return driverPaidFuelCredit(driverPaid);
  const amount = round2(Number(input.amount) || 0);
  const company = round2(Number(input.companyShare) || 0);
  if (company > EPS && Math.abs(amount - company) <= EPS) return 0;
  return round2(Math.max(0, amount));
}
