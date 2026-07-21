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
import { inPeriod } from './periodRange';
import { computeIndriveWalletLoadsFromLedgerEntries } from '../../utils/indriveWalletMetrics';
import type {
  BusinessFinanceBundle,
  BusinessFinancePeriod,
  CashBankSnapshot,
  DriverBalanceRow,
  ExpensesSnapshot,
  BusinessFinanceOverview,
} from './types';
import { round2, formatMoney } from './money';

async function fetchAllCanonical(
  startDate: string,
  endDate: string,
  eventTypes?: string,
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let offset = 0;
  const limit = 500;
  for (let i = 0; i < 40; i++) {
    const page = await api.getCanonicalLedgerEvents({
      startDate,
      endDate,
      eventTypes,
      limit,
      offset,
    });
    const chunk = page.data || [];
    all.push(...chunk);
    if (!page.hasMore || chunk.length === 0) break;
    offset += limit;
  }
  return all;
}

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
  opts: { organizationId?: string | null; fleetTimezone: string },
): Promise<BusinessFinanceBundle> {
  const incomplete: string[] = [];

  let ledgerEvents: Record<string, unknown>[] = [];
  try {
    ledgerEvents = await fetchAllCanonical(period.startYmd, period.endYmd);
  } catch {
    incomplete.push('Canonical ledger');
  }

  let bankExpectedEvents: Record<string, unknown>[] = [];
  try {
    bankExpectedEvents = await fetchAllCanonical(period.startYmd, period.endYmd, 'payout_bank');
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
  const packs = await mapPool(drivers.slice(0, 80), 4, async (d) => {
    const driverId = String(d.id || '');
    const name = driverName(d);
    if (!driverId) return { driverId: '', name, periods: [] as DriverFinancialPeriodClient[] };
    try {
      const res = await api.getDriverFinancialPeriods(driverId);
      const periods = Array.isArray(res?.data) ? (res.data as DriverFinancialPeriodClient[]) : [];
      return { driverId, name, periods };
    } catch {
      return { driverId, name, periods: [] as DriverFinancialPeriodClient[] };
    }
  });

  if (drivers.length > 80) {
    /* truncated flag set below — do not push soft note into hard incomplete banner */
  }

  let cashCollected = 0;
  let cashStillHeld = 0;
  let fuelFromPeriods = 0;
  let tollFromPeriods = 0;
  let driverPayoutsFromPeriods = 0;
  const debtors: Array<{ driverId: string; name: string; amount: number }> = [];
  const balanceRows: DriverBalanceRow[] = [];

  for (const pack of packs) {
    if (!pack.driverId) continue;
    const inRange = pack.periods.filter((p) => inPeriod(String(p.periodAnchor || '').slice(0, 10), period));
    for (const p of inRange) {
      cashCollected += Number(p.cashReturned) || 0;
      cashStillHeld += Math.max(0, Number(p.cashStillHeld) || 0);
      fuelFromPeriods += (Number(p.fuelGasCardSpend) || 0) + (Number(p.fuelDriverSpend) || 0);
      tollFromPeriods += Number(p.tollSpend) || 0;
      const settlement = Number(p.settlementAmount) || 0;
      if (settlement > 0) driverPayoutsFromPeriods += settlement;
    }
    const latest = inRange.sort((a, b) =>
      String(b.periodAnchor).localeCompare(String(a.periodAnchor)),
    )[0];
    if (latest) {
      const held = Math.max(0, Number(latest.cashStillHeld) || 0);
      const companyOwes = Math.max(0, Number(latest.settlementAmount) || 0);
      if (held > 0.005) debtors.push({ driverId: pack.driverId, name: pack.name, amount: round2(held) });
      const weekBank = bankRows.find((r) => r.weekStartYmd === String(latest.periodAnchor).slice(0, 10));
      balanceRows.push({
        driverId: pack.driverId,
        name: pack.name,
        cashStillHeld: round2(held),
        companyOwes: round2(companyOwes),
        bankSettled: weekBank
          ? weekBank.status === 'confirmed'
            ? 'confirmed'
            : 'pending'
          : 'unknown',
        weekLabel: String(latest.periodAnchor).slice(0, 10),
        periodAnchor: String(latest.periodAnchor).slice(0, 10),
        status: String(latest.settlementStatus || latest.status || 'open'),
      });
    }
  }

  debtors.sort((a, b) => b.amount - a.amount);
  balanceRows.sort((a, b) => b.cashStillHeld - a.cashStillHeld);

  const pnl = buildPnLFromCanonicalEvents(ledgerEvents, period);
  const expenseAgg = sumExpenseRowsFromEvents(ledgerEvents, period);

  // Prefer ledger when fuel/toll events exist — never treat net $0 as "ledger empty".
  const fuel =
    expenseAgg.fuelEventCount > 0 ? expenseAgg.fuel : round2(fuelFromPeriods);
  const tolls =
    expenseAgg.tollEventCount > 0 ? expenseAgg.tolls : round2(tollFromPeriods);
  const driverPayoutLine = pnl.lines.find((line) => line.id === 'driver_payouts')?.amount ?? 0;
  const driverPayouts =
    Math.abs(driverPayoutLine) > 0.005
      ? Math.abs(driverPayoutLine)
      : round2(driverPayoutsFromPeriods);

  const grossLine = pnl.lines.find((l) => l.id === 'gross')?.amount || 0;
  const profitLine = Number(pnl.lines.find((l) => l.id === 'operating_profit')?.amount) || 0;

  // Wallet loads: sum canonical wallet_credit already in ledgerEvents (funding transfer, not P&L).
  const { periodLoads: walletLoads } = computeIndriveWalletLoadsFromLedgerEntries(
    ledgerEvents,
    period.startYmd,
    period.endYmd,
  );
  const maintenance = expenseAgg.maintenance;
  const fixedOverhead = expenseAgg.fixed;
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
    /* optional health signal — do not fail the bundle */
  }

  let fuelVarianceFlags = 0;
  try {
    const fuelHealth = await api.getFuelReconciliationPeriodsHealth();
    const missing = Number((fuelHealth as any)?.totals?.missingCanonicalExpenseCount) || 0;
    fuelVarianceFlags = missing > 0 ? missing : 0;
  } catch {
    /* optional */
  }

  let walletShortDriverCount = 0;
  try {
    const walletFleet = await api.getIndriveWalletFleet({
      startDate: period.startYmd,
      endDate: period.endYmd,
    });
    walletShortDriverCount = Number(walletFleet?.totals?.shortDriverCount) || 0;
  } catch {
    /* optional health signal — do not fail the bundle */
  }

  const overview: BusinessFinanceOverview = {
    moneyIn: {
      grossEarnings: round2(grossLine),
      bankExpected,
      bankReceived,
      cashCollected: round2(cashCollected),
      cashStillHeld: round2(cashStillHeld),
    },
    moneyOut: {
      fuel,
      tolls,
      maintenance,
      fixedOverhead,
      operatingExpenses,
      driverPayouts,
    },
    transfers: {
      bankToIndriveWallet: round2(walletLoads),
    },
    profit: {
      operatingProfit: round2(profitLine),
      operatingRatio: pnl.operatingRatio,
    },
    risks: {
      needsStatementWeeks,
      highCashDrivers: debtors.filter((d) => d.amount > 10000).length,
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

  const expenses: ExpensesSnapshot = {
    categories: [
      {
        id: 'fuel',
        label: 'Fuel',
        amount: fuel,
        tracked: true,
        deepLinkPage: 'fuel-overview',
        deepLinkLabel: 'Open Fuel',
        note:
          pnl.fuelRecoveredWashed && pnl.fuelRecoveredWashed > 0.005
            ? `${formatMoney(fuel)} fleet loss · ${formatMoney(pnl.fuelRecoveredWashed)} already charged to drivers`
            : undefined,
      },
      {
        id: 'toll',
        label: 'Tolls',
        amount: tolls,
        tracked: true,
        deepLinkPage: 'toll-tags',
        deepLinkLabel: 'Open Toll Reconciliation',
        note:
          pnl.tollsRecoveredWashed && pnl.tollsRecoveredWashed > 0.005
            ? `${formatMoney(tolls)} fleet loss · ${formatMoney(pnl.tollsRecoveredWashed)} already removed (recovered/washed)`
            : undefined,
      },
      {
        id: 'maintenance',
        label: 'Maintenance',
        amount: maintenance,
        tracked: true,
        deepLinkPage: 'maintenance-hub',
        deepLinkLabel: 'Open Maintenance Hub',
        note: 'Completed, posted maintenance spend only; supplier quotes are excluded.',
      },
      {
        id: 'insurance',
        label: 'Insurance',
        amount: expenseAgg.byCategory.Insurance || 0,
        tracked: true,
        note: 'Scheduled recurring costs plus posted one-off insurance expenses.',
      },
      {
        id: 'lease',
        label: 'Lease / Financing',
        amount: expenseAgg.byCategory.Lease || 0,
        tracked: true,
      },
      {
        id: 'security',
        label: 'Security / GPS',
        amount: expenseAgg.byCategory.Security || expenseAgg.byCategory.Tracking || 0,
        tracked: true,
      },
      {
        id: 'software',
        label: 'Software',
        amount:
          (expenseAgg.byCategory.Software || 0) +
          (expenseAgg.byCategory['Software/Subscription'] || 0),
        tracked: true,
      },
      {
        id: 'permits',
        label: 'Permits / Registration',
        amount:
          (expenseAgg.byCategory.Permits || 0) +
          (expenseAgg.byCategory.Registration || 0),
        tracked: true,
      },
      {
        id: 'equipment',
        label: 'Equipment',
        amount: expenseAgg.byCategory.Equipment || 0,
        tracked: true,
      },
      {
        id: 'other',
        label: 'Other',
        amount: round2(
          expenseAgg.other +
            Math.max(
              0,
              operatingExpenses -
                (expenseAgg.byCategory.Insurance || 0) -
                (expenseAgg.byCategory['Software/Subscription'] || 0) -
                (expenseAgg.byCategory.Registration || 0),
            ),
        ),
        tracked: true,
      },
    ],
    rows: expenseAgg.rows,
    incompleteSources: [],
  };

  const truncated = drivers.length > 80;

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
