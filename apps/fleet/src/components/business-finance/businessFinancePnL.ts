/**
 * Pure P&L builder from canonical ledger events — read-only owner view.
 * Never feeds settlement math.
 */
import type { BusinessFinancePeriod, BusinessFinancePnL, PnLLine, PlatformSplitRow } from './types';
import { inPeriod } from './periodRange';
import { round2 } from './money';
import {
  computeTollFleetLossNetting,
  isTripSourcedTollCharge,
  tollEventAmount,
  tollEventDate,
  tollRecoveredWashedMemo,
} from '../../utils/tollFleetLossNetting';
import {
  computeFuelFleetLossNetting,
  fuelRecoveredWashedMemo,
} from '../../utils/fuelFleetLossNetting';
import {
  isCashStyleFuelPaymentSource,
  resolveFuelPaymentSource,
} from '../../utils/fuelPaymentSource';
import { recognizePlatformGrossAndFees } from '../../utils/platformFeeRecognition';

type LedgerLike = Record<string, unknown>;

function eventDate(e: LedgerLike): string {
  return tollEventDate(e);
}

function eventAmount(e: LedgerLike): number {
  return tollEventAmount(e);
}

function fuelExpensePumpPay(e: LedgerLike): 'card' | 'cash' | 'unknown' {
  const meta =
    e.metadata && typeof e.metadata === 'object'
      ? (e.metadata as Record<string, unknown>)
      : {};
  const raw = e.paymentSource ?? meta.paymentSource;
  if (raw == null || String(raw).trim() === '') return 'unknown';
  const enumVal = resolveFuelPaymentSource(String(raw)).enum;
  if (enumVal === 'Gas_Card') return 'card';
  if (isCashStyleFuelPaymentSource(enumVal)) return 'cash';
  return 'unknown';
}

export function buildPnLFromCanonicalEvents(
  events: LedgerLike[] | undefined | null,
  period: BusinessFinancePeriod,
  extras?: { driverCommission?: number; cashWriteOffs?: number; basis?: 'accrual' | 'cash' },
): BusinessFinancePnL {
  const scoped = (events || []).filter((e) => inPeriod(eventDate(e), period));

  // Gross + fees via shared recognition (platform_fee or fare gap; pre-commission gross).
  const recognized = recognizePlatformGrossAndFees(scoped);
  const gross = recognized.totalGross;
  const fees = recognized.totalFees;
  const byPlatform = recognized.byPlatform;

  let driverPayouts = 0;
  for (const e of scoped) {
    const t = String(e.eventType || '');
    if (t === 'driver_payout') {
      driverPayouts += eventAmount(e);
    }
  }
  const driverCommission = round2(Math.max(0, extras?.driverCommission || 0));
  const cashWriteOffs = round2(extras?.cashWriteOffs || 0);
  const basis = extras?.basis === 'cash' ? 'cash' : 'accrual';
  const payoutsInProfit = basis === 'cash' ? round2(driverPayouts) : 0;

  const fuelNet = computeFuelFleetLossNetting(scoped);
  const fuel = fuelNet.net;
  const fuelRecoveredMemo = fuelRecoveredWashedMemo(fuelNet);

  let gasCardSpend = 0;
  let driverCashSpend = 0;
  for (const e of scoped) {
    if (String(e.eventType || '') !== 'fuel_expense') continue;
    const amt = eventAmount(e);
    const pay = fuelExpensePumpPay(e);
    if (pay === 'card') gasCardSpend += amt;
    else if (pay === 'cash') driverCashSpend += amt;
  }
  gasCardSpend = round2(gasCardSpend);
  driverCashSpend = round2(driverCashSpend);

  // Wallet reimbursements — shown in Fuel accordion, not netted into fleet loss.
  let reimbursedToDrivers = 0;
  for (const e of scoped) {
    if (String(e.eventType || '') === 'fuel_reimbursement') {
      reimbursedToDrivers += eventAmount(e);
    }
  }
  reimbursedToDrivers = round2(Math.max(0, reimbursedToDrivers));

  const fuelBreakdown =
    fuelNet.gross > 0.005 ||
    (fuelRecoveredMemo != null && fuelRecoveredMemo > 0.005) ||
    reimbursedToDrivers > 0.005 ||
    fuel > 0.005
      ? {
          grossSpend: fuelNet.gross,
          gasCardSpend,
          driverCashSpend,
          alreadyCovered: fuelRecoveredMemo ?? 0,
          reimbursedToDrivers,
          fleetLoss: fuel,
        }
      : undefined;

  const tollNet = computeTollFleetLossNetting(scoped);
  const tolls = tollNet.net;
  const recoveredMemo = tollRecoveredWashedMemo(tollNet);

  let fixedOverhead = 0;
  let maintenance = 0;
  let operatingExpenses = 0;
  let otherIncome = 0;
  for (const e of scoped) {
    const type = String(e.eventType || '');
    const amount = eventAmount(e);
    if (type === 'fixed_expense') fixedOverhead += amount;
    else if (type === 'maintenance') maintenance += amount;
    else if (type === 'operating_expense') operatingExpenses += amount;
    else if (type === 'other_income') otherIncome += amount;
  }

  // Charge Driver wallet postings — shown in Tolls accordion, not netted into fleet loss.
  let chargedToDrivers = 0;
  for (const e of scoped) {
    const t = String(e.eventType || '');
    if (t === 'toll_charged_to_driver') chargedToDrivers += eventAmount(e);
    else if (t === 'toll_charge_reversed') chargedToDrivers -= eventAmount(e);
  }
  chargedToDrivers = round2(Math.max(0, chargedToDrivers));

  const tollBreakdown =
    tollNet.gross > 0.005 ||
    (recoveredMemo != null && recoveredMemo > 0.005) ||
    chargedToDrivers > 0.005 ||
    tolls > 0.005
      ? {
          grossCharges: tollNet.gross,
          alreadyCovered: recoveredMemo ?? 0,
          chargedToDrivers,
          fleetLoss: tolls,
        }
      : undefined;

  const netTrip = round2(gross - fees);
  const operatingProfit = round2(
    netTrip +
      otherIncome -
      driverCommission -
      fuel -
      tolls -
      maintenance -
      fixedOverhead -
      operatingExpenses -
      cashWriteOffs -
      payoutsInProfit,
  );
  const operatingRatio = gross > 0.005 ? round2(((gross - operatingProfit) / gross) * 100) : null;

  const lines: PnLLine[] = [
    { id: 'gross', label: 'Gross platform earnings', amount: round2(gross), kind: 'total' },
    { id: 'platform_fees', label: 'Platform fees', amount: -round2(fees), kind: 'expense' },
    { id: 'net_trip', label: 'Net trip revenue', amount: netTrip, kind: 'subtotal' },
    { id: 'driver_commission', label: 'Driver commission (COGS)', amount: -driverCommission, kind: 'expense' },
    { id: 'fuel', label: 'Fuel', amount: -round2(fuel), kind: 'expense' },
    { id: 'tolls', label: 'Tolls', amount: -round2(tolls), kind: 'expense' },
    { id: 'maintenance', label: 'Maintenance', amount: -round2(maintenance), kind: 'expense' },
    { id: 'fixed_overhead', label: 'Fixed overhead', amount: -round2(fixedOverhead), kind: 'expense' },
    { id: 'operating_expenses', label: 'Other operating expenses', amount: -round2(operatingExpenses), kind: 'expense' },
    { id: 'other_income', label: 'Other income', amount: round2(otherIncome), kind: 'subtotal' },
    { id: 'cash_write_offs', label: 'Cash write-offs', amount: -cashWriteOffs, kind: 'expense' },
    {
      id: 'driver_payouts',
      label: 'Driver payouts (cash)',
      amount: -round2(driverPayouts),
      kind: basis === 'cash' ? 'expense' : 'memo',
    },
    { id: 'operating_profit', label: 'Operating profit', amount: operatingProfit, kind: 'result' },
  ];

  const platformSplit: PlatformSplitRow[] = [...byPlatform.entries()]
    .map(([platform, v]) => ({
      platform,
      gross: round2(v.gross),
      fees: round2(v.fees),
      net: round2(v.gross - v.fees),
    }))
    .sort((a, b) => b.gross - a.gross);

  const noteParts: string[] = [];
  if (scoped.length === 0) {
    noteParts.push('No canonical ledger events in this period — import statements/trips to populate P&L.');
  }
  if (tollNet.provisional > 0.005) {
    noteParts.push(
      `${formatMoneyPlain(tollNet.provisional)} of Uber trip tolls is counted as reimbursement (not extra spend). Confirm in Toll Reconciliation — cash-wash / phantom / personal still need a P&L offset if those trips are not covering a tag debit.`,
    );
  }
  if (tollNet.clipped) {
    noteParts.push('Toll recoveries exceeded gross toll charges this period — Tolls floored at $0; check Toll Reconciliation for a data mismatch.');
  }
  if (fuelNet.clipped) {
    noteParts.push('Fuel recoveries exceeded gross fuel spend this period — Fuel floored at $0; check Consumption Reconciliation for a data mismatch.');
  }

  return {
    lines,
    operatingRatio,
    platformSplit,
    coverageNote: noteParts.length ? noteParts.join(' ') : undefined,
    tollsRecoveredWashed: recoveredMemo,
    tollBreakdown,
    fuelRecoveredWashed: fuelRecoveredMemo,
    fuelBreakdown,
  };
}

function formatMoneyPlain(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function sumExpenseRowsFromEvents(
  events: LedgerLike[] | undefined | null,
  period: BusinessFinancePeriod,
): {
  fuel: number;
  tolls: number;
  maintenance: number;
  fixed: number;
  operating: number;
  byCategory: Record<string, number>;
    other: number;
    tollEventCount: number;
    fuelEventCount: number;
    rowCount: number;
    rows: Array<{
    id: string;
    dateYmd: string;
    category: string;
    description: string;
    amount: number;
    source: string;
  }>;
} {
  const scoped = (events || []).filter((e) => inPeriod(eventDate(e), period));
  let fuel = 0;
  let tolls = 0;
  let maintenance = 0;
  let fixed = 0;
  let operating = 0;
  const byCategory: Record<string, number> = {};
  let other = 0;
  let tollEventCount = 0;
  let fuelEventCount = 0;
  const rows: Array<{
    id: string;
    dateYmd: string;
    category: string;
    description: string;
    amount: number;
    source: string;
  }> = [];

  const RECOGNIZED = [
    'fuel_expense',
    'fuel_charge_offset',
    'toll_charge',
    'toll_reimbursement',
    'toll_refund',
    'toll_charge_offset',
    'refund_expense',
    'adjustment',
    'fixed_expense',
    'maintenance',
    'operating_expense',
  ];
  const tripOffsetSourceIds = new Set<string>();
  for (const e of scoped) {
    if (String(e.eventType || '') !== 'toll_charge_offset') continue;
    if (String(e.direction || '') !== 'inflow') continue;
    tripOffsetSourceIds.add(String(e.sourceId || ''));
  }
  for (const e of scoped) {
    const t = String(e.eventType || '');
    if (!RECOGNIZED.includes(t)) continue;
    const amt = eventAmount(e);
    const dateYmd = eventDate(e);
    let category = 'Other';
    let signedAmount = amt;
    if (t === 'fuel_expense') {
      fuel += amt;
      fuelEventCount++;
      category = 'Fuel';
    } else if (t === 'fuel_charge_offset') {
      category = 'Fuel';
      fuelEventCount++;
      if (String(e.direction || '') === 'inflow') {
        fuel -= amt;
        signedAmount = -amt;
      } else {
        fuel += amt;
        signedAmount = amt;
      }
    } else if (t === 'toll_charge' || t === 'toll_reimbursement') {
      tollEventCount++;
      category = 'Toll';
      // Unmatched Uber trip toll = reimbursement credit, not a second plaza bill.
      if (isTripSourcedTollCharge(e) && !tripOffsetSourceIds.has(String(e.sourceId || ''))) {
        tolls -= amt;
        signedAmount = -amt;
      } else {
        tolls += amt;
      }
    } else if (t === 'toll_refund') {
      // Real refund from the toll operator — a credit against Tolls.
      tolls -= amt;
      tollEventCount++;
      category = 'Toll';
      signedAmount = -amt;
    } else if (t === 'toll_charge_offset') {
      // Not a fleet loss (cash_wash/phantom/expense_logged/personal) — credit;
      // or a reinstatement of a prior offset — debit. See toll_pnl_offset.ts.
      category = 'Toll';
      tollEventCount++;
      if (String(e.direction || '') === 'inflow') {
        tolls -= amt;
        signedAmount = -amt;
      } else {
        tolls += amt;
        signedAmount = amt;
      }
    } else if (t === 'fixed_expense') {
      fixed += amt;
      category = String(e.category || 'Fixed overhead');
      byCategory[category] = (byCategory[category] || 0) + amt;
    } else if (t === 'maintenance') {
      maintenance += amt;
      category = 'Maintenance';
      byCategory.Maintenance = (byCategory.Maintenance || 0) + amt;
    } else if (t === 'operating_expense') {
      operating += amt;
      category = String(e.category || 'Other');
      byCategory[category] = (byCategory[category] || 0) + amt;
    } else {
      other += amt;
    }
    rows.push({
      id: String(e.id || `${t}-${dateYmd}-${rows.length}`),
      dateYmd,
      category,
      description: String(e.description || e.uberDescription || t),
      amount: round2(signedAmount),
      source: String(e.sourceType || 'ledger'),
    });
  }

  rows.sort((a, b) => b.dateYmd.localeCompare(a.dateYmd));
  return {
    fuel: round2(fuel),
    tolls: computeTollFleetLossNetting(scoped).net,
    maintenance: round2(maintenance),
    fixed: round2(fixed),
    operating: round2(operating),
    byCategory: Object.fromEntries(
      Object.entries(byCategory).map(([key, value]) => [key, round2(value)]),
    ),
    other: round2(other),
    tollEventCount,
    fuelEventCount,
    rowCount: rows.length,
    rows: rows.slice(0, 100),
  };
}
