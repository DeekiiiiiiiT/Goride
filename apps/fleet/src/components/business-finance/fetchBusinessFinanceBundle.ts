/**
 * Read-only Business Finance data fetch — composes existing APIs.
 * Additive; never writes; never calls settlement mutators.
 */
import { api } from '../../services/api';
import {
  aggregateExpectedBankByWeek,
  mergeBankReceiveConfirms,
  fleetBankDisplayStatus,
} from '../../utils/fleetBankReceive';
import type { DriverFinancialPeriodClient } from '../../hooks/useDriverFinancialPeriods';
import { buildPnLFromCanonicalEvents, sumExpenseRowsFromEvents } from './businessFinancePnL';
import { buildExpensesSnapshot, fetchAllCanonicalEvents } from './expensesSnapshot';
import { inPeriod } from './periodRange';
import {
  agreementChecks,
  cashHeldExcludingReceivable,
  companyFuelCost,
  profitAfterCompanyFuel,
} from '@roam/finance-core';
import type {
  BusinessFinanceBundle,
  BusinessFinancePeriod,
  CashBankSnapshot,
  DriverBalanceRow,
  ExpensesSnapshot,
  BusinessFinanceOverview,
} from './types';
import { round2, formatMoney } from './money';
import type { ServiceLineScope } from '../../contexts/ServiceLineScopeContext';
import { filterLedgerEventsByServiceLineScope } from '../../utils/filterLedgerByServiceLineScope';

const fetchAllCanonical = fetchAllCanonicalEvents;

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return out;
}

function driverName(d: Record<string, unknown>): string {
  return (
    String(d.name || d.fullName || '').trim() ||
    [d.firstName, d.lastName].filter(Boolean).join(' ').trim() ||
    String(d.id || 'Driver')
  );
}

export async function fetchBusinessFinanceBundle(
  period: BusinessFinancePeriod,
  opts: {
    organizationId?: string | null;
    fleetTimezone: string;
    basis?: 'accrual' | 'cash';
    serviceLineScope?: ServiceLineScope;
  },
): Promise<BusinessFinanceBundle> {
  const incomplete: string[] = [];
  const scope = opts.serviceLineScope ?? 'all';

  let ledgerEvents: Record<string, unknown>[] = [];
  try {
    ledgerEvents = filterLedgerEventsByServiceLineScope(
      await fetchAllCanonical(period.startYmd, period.endYmd),
      scope,
    );
  } catch {
    incomplete.push('Canonical ledger');
  }

  let bankExpectedEvents: Record<string, unknown>[] = [];
  try {
    bankExpectedEvents = filterLedgerEventsByServiceLineScope(
      await fetchAllCanonical(period.startYmd, period.endYmd, 'payout_bank'),
      scope,
    );
  } catch {
    incomplete.push('Bank expected (payout_bank)');
  }

  let confirms: Awaited<ReturnType<typeof api.getFleetBankConfirms>>['data'] = [];
  try {
    confirms = (await api.getFleetBankConfirms()).data || [];
  } catch {
    incomplete.push('Bank confirms');
  }

  let drivers: Record<string, unknown>[] = [];
  try {
    const res = await api.getDrivers();
    drivers = Array.isArray(res) ? res : Array.isArray((res as any)?.data) ? (res as any).data : [];
  } catch {
    incomplete.push('Drivers');
  }

  const expected = aggregateExpectedBankByWeek(bankExpectedEvents, opts.fleetTimezone);
  const bankRows = mergeBankReceiveConfirms(expected, confirms, opts.organizationId).filter((r) =>
    inPeriod(r.weekStartYmd, period),
  );

  const bankExpected = round2(bankRows.reduce((s, r) => s + (r.expected || 0), 0));
  const bankReceived = round2(
    bankRows.reduce((s, r) => s + (r.status === 'confirmed' ? r.amountReceived || 0 : 0), 0),
  );
  const needsStatementWeeks = bankRows.filter((r) => fleetBankDisplayStatus(r) === 'needs_statement').length;

  // Driver period snapshots (read-only) — capped concurrency
  type PeriodPack = {
    driverId: string;
    name: string;
    periods: DriverFinancialPeriodClient[];
  };
  const packs = await mapPool(drivers, 4, async (d) => {
    const driverId = String(d.id || '');
    const name = driverName(d);
    if (!driverId) return { driverId: '', name, periods: [] as DriverFinancialPeriodClient[] };
    try {
      const serviceLine = scope === 'rideshare' || scope === 'rush_delivery' ? scope : undefined;
      const res = await api.getDriverFinancialPeriods(driverId, serviceLine);
      const periods = Array.isArray(res?.data) ? (res.data as DriverFinancialPeriodClient[]) : [];
      return { driverId, name, periods };
    } catch {
      incomplete.push(`Driver periods (${name || driverId})`);
      return { driverId, name, periods: [] as DriverFinancialPeriodClient[] };
    }
  });

  let cashCollected = 0;
  let cashStillHeld = 0;
  let owedByDrivers = 0;
  let cashWrittenOff = 0;
  let fuelGasCardFromPeriods = 0;
  let fuelDriverFromPeriods = 0;
  let driverCommissionFromPeriods = 0;
  const debtors: Array<{ driverId: string; name: string; amount: number }> = [];
  const balanceRows: DriverBalanceRow[] = [];

  for (const pack of packs) {
    if (!pack.driverId) continue;
    const inRange = pack.periods.filter((p) => inPeriod(String(p.periodAnchor || '').slice(0, 10), period));
    for (const p of inRange) {
      cashCollected += Number(p.cashCollected) || 0;
      const receivable = fuelCreditAmount(p);
      const held = cashHeldExcludingReceivable(Number(p.cashStillHeld) || 0, receivable);
      cashStillHeld += held;
      owedByDrivers += receivable;
      cashWrittenOff += Number(p.cashWrittenOff) || 0;
      fuelGasCardFromPeriods += Number(p.fuelGasCardSpend) || 0;
      fuelDriverFromPeriods += Number(p.fuelDriverSpend) || 0;
      driverCommissionFromPeriods += Number(p.driverShare) || 0;
      const companyOwes = Math.max(0, Number(p.settlementAmount) || 0);
      if (held > 0.005) debtors.push({ driverId: pack.driverId, name: pack.name, amount: round2(held) });
      const weekBank = bankRows.find((r) => r.weekStartYmd === String(p.periodAnchor).slice(0, 10));
      balanceRows.push({
        driverId: pack.driverId,
        name: pack.name,
        cashStillHeld: round2(held),
        owedByDriver: receivable > 0.01 ? round2(receivable) : undefined,
        companyOwes: round2(companyOwes),
        bankSettled: weekBank
          ? weekBank.status === 'confirmed'
            ? 'confirmed'
            : 'pending'
          : 'unknown',
        weekLabel: String(p.periodAnchor).slice(0, 10),
        periodAnchor: String(p.periodAnchor).slice(0, 10),
        status: String(p.settlementStatus || p.status || 'open'),
        note: fuelCreditNote(p),
      });
    }
  }

  debtors.sort((a, b) => b.amount - a.amount);
  balanceRows.sort((a, b) => b.cashStillHeld - a.cashStillHeld);

  const pnl = buildPnLFromCanonicalEvents(ledgerEvents, period, {
    driverCommission: driverCommissionFromPeriods,
    cashWriteOffs: cashWrittenOff,
    basis: opts.basis === 'cash' ? 'cash' : 'accrual',
  });
  const expenseAgg = sumExpenseRowsFromEvents(ledgerEvents, period);

  if (pnl.fuelBreakdown) {
    const ledgerNamed =
      (pnl.fuelBreakdown.gasCardSpend || 0) > 0.005 ||
      (pnl.fuelBreakdown.driverCashSpend || 0) > 0.005;
    if (!ledgerNamed) {
      pnl.fuelBreakdown.gasCardSpend = round2(fuelGasCardFromPeriods);
      pnl.fuelBreakdown.driverCashSpend = round2(fuelDriverFromPeriods);
    }
  } else if (fuelGasCardFromPeriods > 0.005 || fuelDriverFromPeriods > 0.005) {
    pnl.fuelBreakdown = {
      grossSpend: 0,
      gasCardSpend: round2(fuelGasCardFromPeriods),
      driverCashSpend: round2(fuelDriverFromPeriods),
      alreadyCovered: 0,
      reimbursedToDrivers: 0,
      fleetLoss: 0,
    };
  }

  // Prefer ledger when fuel/toll events exist — never treat net $0 as "ledger empty".
  // Do not sum card + driver cash into one Fuel fallback (that labeled company plastic as driver money).
  const fuel = expenseAgg.fuelEventCount > 0 ? expenseAgg.fuel : 0;
  const tolls = expenseAgg.tollEventCount > 0 ? expenseAgg.tolls : 0;
  const driverPayoutLine = pnl.lines.find((line) => line.id === 'driver_payouts')?.amount ?? 0;
  const driverPayouts = Math.abs(driverPayoutLine);

  const grossLine = pnl.lines.find((l) => l.id === 'gross')?.amount || 0;
  const profitLine = Number(pnl.lines.find((l) => l.id === 'operating_profit')?.amount) || 0;
  const platformFees = Math.abs(pnl.lines.find((l) => l.id === 'platform_fees')?.amount || 0);
  const driverCommission = Math.abs(pnl.lines.find((l) => l.id === 'driver_commission')?.amount || 0);
  const otherIncome = Number(pnl.lines.find((l) => l.id === 'other_income')?.amount) || 0;
  const ledgerFailed = incomplete.some((s) => /canonical ledger/i.test(s));

  const maintenance = expenseAgg.maintenance;
  let fixedOverhead = expenseAgg.fixed;
  const operatingExpenses = expenseAgg.operating;
  let businessPaymentOutflows = 0;
  let businessBankOrCardOutflows = 0;
  let businessCashOutflows = 0;
  let businessOtherInflows = 0;
  for (const event of ledgerEvents) {
    const type = String(event.eventType || '');
    const date = String(event.date || event.postingAt || event.createdAt || '').slice(0, 10);
    if (!inPeriod(date, period) || String(event.sourceType || '') !== 'transaction') continue;
    const amount = Math.abs(Number(event.netAmount) || Number(event.grossAmount) || 0);
    if (type === 'other_income') {
      businessOtherInflows += amount;
      continue;
    }
    if (type !== 'operating_expense' && type !== 'maintenance') continue;
    businessPaymentOutflows += amount;
    const method = String(event.paymentMethod || '').toLowerCase();
    if (method === 'cash') businessCashOutflows += amount;
    else businessBankOrCardOutflows += amount;
  }

  let tollVarianceFlags = 0;
  try {
    const periodsRes = await api.getTollReconciliationPeriods();
    const missing = Number((periodsRes as any)?.totals?.missingCanonicalChargeCount) || 0;
    tollVarianceFlags = missing > 0 ? missing : 0;
  } catch {
    incomplete.push('Toll health');
  }

  let fuelVarianceFlags = 0;
  try {
    const fuelHealth = await api.getFuelReconciliationPeriodsHealth();
    const missing = Number((fuelHealth as any)?.totals?.missingCanonicalExpenseCount) || 0;
    fuelVarianceFlags = missing > 0 ? missing : 0;
  } catch {
    incomplete.push('Fuel health');
  }

  let walletShortDriverCount = 0;
  let walletLoads = 0;
  try {
    const walletFleet = await api.getIndriveWalletFleet({
      startDate: period.startYmd,
      endDate: period.endYmd,
    });
    walletShortDriverCount = Number(walletFleet?.totals?.shortDriverCount) || 0;
    walletLoads = Number(walletFleet?.totals?.periodLoads) || 0;
  } catch {
    incomplete.push('InDrive wallet');
  }

  let weekRead: Awaited<ReturnType<typeof fetchWeekRead>> | null = null;
  try {
    weekRead = await fetchWeekRead(period.startYmd, period.endYmd);
  } catch {
    incomplete.push('Week statements');
  }

  let ledgerEarnings: number | null = null;
  try {
    const summary = await api.getLedgerFleetSummary({
      startDate: period.startYmd,
      endDate: period.endYmd,
    });
    ledgerEarnings = Number(summary?.data?.totalEarnings);
    if (!Number.isFinite(ledgerEarnings)) ledgerEarnings = null;
  } catch {
    incomplete.push('Ledgers');
  }

  const cashBasis = opts.basis === 'cash';
  const fuelInProfit = round2(Math.abs(pnl.lines.find((l) => l.id === 'fuel')?.amount || 0));
  const companyFuel = weekRead
    ? companyFuelCost({
        sealed: weekRead.companyFuelSealed,
        sealedCompanyShare: weekRead.sealedCompanyShare,
        engineCompanyShare: weekRead.engineCompanyShare > 0.005
          ? weekRead.engineCompanyShare
          : round2(pnl.fuelBreakdown?.fleetLoss ?? fuel),
      })
    : round2(pnl.fuelBreakdown?.fleetLoss ?? fuel);
  let fixedReplacement: number | null = null;
  if (!cashBasis && weekRead && weekRead.coverageRecognised > 0.005 && weekRead.coveredSourceIds.length) {
    const covered = new Set(weekRead.coveredSourceIds);
    let lump = 0;
    for (const event of ledgerEvents) {
      if (String(event.eventType || '') !== 'fixed_expense') continue;
      const date = String(event.date || event.postingAt || '').slice(0, 10);
      if (!inPeriod(date, period)) continue;
      if (!covered.has(String(event.sourceId || ''))) continue;
      lump += Math.abs(Number(event.netAmount) || Number(event.grossAmount) || 0);
    }
    fixedReplacement = round2(fixedOverhead - lump + weekRead.coverageRecognised);
    fixedOverhead = fixedReplacement;
  }
  const movementPays = weekRead ? weekRead.movementPays : driverPayouts;
  const collected = weekRead && weekRead.movementCollects > 0.005
    ? weekRead.movementCollects
    : round2(cashCollected);
  const fuelLine = pnl.lines.find((line) => line.id === 'fuel');
  if (fuelLine) fuelLine.amount = -companyFuel;
  const fixedLine = pnl.lines.find((line) => line.id === 'fixed_overhead');
  if (fixedLine && fixedReplacement != null) fixedLine.amount = -fixedOverhead;
  const payoutLine = pnl.lines.find((line) => line.id === 'driver_payouts');
  if (payoutLine) payoutLine.amount = -movementPays;
  const operatingProfit = ledgerFailed
    ? 0
    : profitAfterCompanyFuel({
        operatingProfit: profitLine,
        fuelInProfit,
        companyFuel,
        fixedInProfit: expenseAgg.fixed,
        fixedReplacement,
        cashBasis,
        payoutsInProfit: cashBasis ? driverPayouts : 0,
        movementPays,
      });
  const profitLineRow = pnl.lines.find((line) => line.id === 'operating_profit');
  if (profitLineRow && !ledgerFailed) profitLineRow.amount = operatingProfit;
  const pumpSpend = round2(pnl.fuelBreakdown?.grossSpend || fuel);
  const weekClosed = weekRead?.weekStatus === 'Closed';
  const agreement = agreementChecks({
    ledgerGross: round2(grossLine),
    sealedEarningsGross: weekClosed || weekRead?.earningsHeld
      ? (weekRead?.sealedEarningsGross ?? round2(grossLine))
      : round2(grossLine),
    earningsHeld: weekRead?.earningsHeld ?? false,
    ledgerFuel: pumpSpend,
    sealedFuelSpend: weekRead?.companyFuelSealed ? weekRead.sealedFuelSpend : pumpSpend,
    ledgerTolls: tolls,
    sealedTollNet: weekClosed ? (weekRead?.sealedTollNet ?? tolls) : tolls,
    payouts: weekRead ? weekRead.closedAmountOwed : 0,
    movementPays,
    bankExpected,
    bankDeposits: weekRead?.bankConfirmed ? weekRead.bankDeposits : 0,
    statementSummary: round2(grossLine),
    ledgerStatement: ledgerEarnings ?? round2(grossLine),
  });
  if (!weekRead) {
    for (const row of agreement) {
      if (row.id === 'revenue' || row.id === 'fuel' || row.id === 'tolls' || row.id === 'payouts') {
        row.ok = false;
        if (row.id === 'payouts') row.pending = 'Week statements';
      }
    }
  }
  const bankRow = agreement.find((row) => row.id === 'bank');
  if (bankRow && !weekRead?.bankConfirmed) {
    bankRow.ok = false;
    bankRow.pending = 'Not confirmed';
  }

  const overview: BusinessFinanceOverview = {
    moneyIn: {
      grossEarnings: round2(grossLine),
      bankExpected,
      bankReceived,
      cashCollected: collected,
      cashStillHeld: round2(cashStillHeld),
      owedByDrivers: round2(owedByDrivers),
    },
    moneyOut: {
      fuel,
      tolls,
      maintenance,
      fixedOverhead,
      operatingExpenses,
      driverPayouts: movementPays,
      cashWrittenOff: round2(cashWrittenOff),
      platformFees: round2(platformFees),
      driverCommission: round2(driverCommission),
      otherIncome: round2(otherIncome),
      fuelSpend: round2(pnl.fuelBreakdown?.grossSpend || fuel),
      fleetFuelCost: companyFuel,
    },
    transfers: {
      bankToIndriveWallet: round2(walletLoads),
      tagTopUps: weekRead?.tagTopUps || 0,
    },
    courier: weekRead
      ? { moneyIn: round2(weekRead.courierIn), moneyOut: round2(weekRead.courierOut) }
      : undefined,
    agreement,
    weekStatus: ledgerFailed ? 'Unavailable' : (weekRead?.weekStatus ?? 'Open'),
    profit: {
      operatingProfit,
      operatingRatio: ledgerFailed || grossLine <= 0.005
        ? null
        : round2(((grossLine - operatingProfit) / grossLine) * 100),
      withheld: ledgerFailed,
    },
    basis: opts.basis === 'cash' ? 'cash' : 'accrual',
    risks: {
      needsStatementWeeks,
      highCashDrivers: new Set(
        debtors.filter((d) => d.amount > 10000).map((d) => d.driverId),
      ).size,
      tollVarianceFlags,
      fuelVarianceFlags,
      walletShortDriverCount,
    },
    incompleteSources: [
      ...incomplete,
      ...(tollVarianceFlags > 0
        ? [`${tollVarianceFlags} tag toll(s) missing from Business Finance ledger — run canonical tolls backfill`]
        : []),
      ...(fuelVarianceFlags > 0
        ? [`${fuelVarianceFlags} fuel fill(s) missing from Business Finance ledger — check fuel expense sync`]
        : []),
      ...(walletShortDriverCount > 0
        ? [`${walletShortDriverCount} driver(s) short on InDrive wallet`]
        : []),
    ],
  };

  const cashBank: CashBankSnapshot = {
    platformBank: {
      expected: bankExpected,
      received: bankReceived,
      variance: round2(bankReceived - bankExpected),
      needsStatementWeeks,
    },
    driverCash: {
      totalStillHeld: round2(cashStillHeld),
      topDebtors: debtors.slice(0, 5),
    },
    walletLoads: {
      periodLoads: round2(walletLoads),
      shortDriverCount: walletShortDriverCount,
    },
    businessPayments: {
      periodOutflows: round2(businessPaymentOutflows),
      bankOrCardOutflows: round2(businessBankOrCardOutflows),
      cashOutflows: round2(businessCashOutflows),
      otherInflows: round2(businessOtherInflows),
    },
    incompleteSources: overview.incompleteSources.filter((s) =>
      /bank|wallet|driver|cash/i.test(s),
    ),
  };

  const expenses: ExpensesSnapshot = buildExpensesSnapshot(ledgerEvents, period);

  const truncated = false;

  return {
    period,
    overview,
    pnl,
    cashBank,
    expenses,
    driverBalances: {
      rows: balanceRows,
      incompleteSources: incomplete.includes('Drivers') ? ['Drivers'] : [],
      truncated,
      truncateCap: truncated ? 80 : undefined,
    },
  };
}

type WeekRead = {
  weekStatus: 'Closed' | 'Open';
  earningsHeld: boolean;
  companyFuelSealed: boolean;
  sealedCompanyShare: number;
  engineCompanyShare: number;
  sealedFuelSpend: number;
  sealedEarningsGross: number;
  sealedTollNet: number;
  movementPays: number;
  movementCollects: number;
  tagTopUps: number;
  courierIn: number;
  courierOut: number;
  coverageRecognised: number;
  coveredSourceIds: string[];
  closedAmountOwed: number;
  bankDeposits: number;
  bankConfirmed: boolean;
};

async function fetchWeekRead(startYmd: string, endYmd: string): Promise<WeekRead> {
  const { API_ENDPOINTS } = await import('../../services/apiConfig');
  const { requireAuthHeaders } = await import('../../utils/authHeaders');
  const response = await fetch(
    `${API_ENDPOINTS.fleetOps}/business-finance/week-read?startYmd=${startYmd}&endYmd=${endYmd}`,
    { headers: await requireAuthHeaders(null) },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Week read failed');
  return payload.data as WeekRead;
}

function fuelCreditAmount(period: DriverFinancialPeriodClient): number {
  const fc = (period.metadata as { financeCore?: { fuelCreditReceivable?: { amount?: number } } } | undefined)
    ?.financeCore?.fuelCreditReceivable;
  const amount = Number(fc?.amount) || 0;
  return amount > 0.01 ? amount : 0;
}

function fuelCreditNote(period: DriverFinancialPeriodClient): string | undefined {
  const fc = (period.metadata as { financeCore?: { fuelCreditReceivable?: { amount?: number; sourceWeek?: string } } } | undefined)
    ?.financeCore?.fuelCreditReceivable;
  const amount = Number(fc?.amount) || 0;
  const week = String(fc?.sourceWeek || '').slice(0, 10);
  if (amount <= 0.01 || !week) return undefined;
  return `Includes $${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} owed from the week of ${week}. The cash already paid is unchanged.`;
}
