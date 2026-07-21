/**
 * Pure P&L builder from canonical ledger events — read-only owner view.
 * Never feeds settlement math.
 */
import type { BusinessFinancePeriod, BusinessFinancePnL, PnLLine, PlatformSplitRow } from './types';
import { inPeriod } from './periodRange';
import { round2 } from './money';
import {
  computeTollFleetLossNetting,
  tollEventAmount,
  tollEventDate,
  tollRecoveredWashedMemo,
} from '../../utils/tollFleetLossNetting';
import {
  computeFuelFleetLossNetting,
  fuelRecoveredWashedMemo,
} from '../../utils/fuelFleetLossNetting';
import { recognizePlatformGrossAndFees } from '../../utils/platformFeeRecognition';

type LedgerLike = Record<string, unknown>;

function eventDate(e: LedgerLike): string {
  return tollEventDate(e);
}

function eventAmount(e: LedgerLike): number {
  return tollEventAmount(e);
}

export function buildPnLFromCanonicalEvents(
  events: LedgerLike[] | undefined | null,
  period: BusinessFinancePeriod,
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
    if (t === 'payout_cash' || t === 'driver_payout') {
      driverPayouts += eventAmount(e);
    }
  }

  const fuelNet = computeFuelFleetLossNetting(scoped);
  const fuel = fuelNet.net;
  const fuelRecoveredMemo = fuelRecoveredWashedMemo(fuelNet);

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
          alreadyCovered: fuelRecoveredMemo ?? 0,
          reimbursedToDrivers,
          fleetLoss: fuel,
        }
      : undefined;

  const tollNet = computeTollFleetLossNetting(scoped);
  const tolls = tollNet.net;
  const recoveredMemo = tollRecoveredWashedMemo(tollNet);

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
  // Maintenance not tracked yet. Wallet loads are transfers (Cash & Bank), not P&L expenses.
  const operatingProfit = round2(netTrip - fuel - tolls - driverPayouts);
  const operatingRatio = gross > 0.005 ? round2(((gross - operatingProfit) / gross) * 100) : null;

  // Memo line retired — Tolls/Fuel accordions on PnLTab carry the owner breakdown.
  const lines: PnLLine[] = [
    { id: 'gross', label: 'Gross platform earnings', amount: round2(gross), kind: 'total' },
    { id: 'platform_fees', label: 'Platform fees', amount: -round2(fees), kind: 'expense' },
    { id: 'net_trip', label: 'Net trip revenue', amount: netTrip, kind: 'subtotal' },
    { id: 'fuel', label: 'Fuel', amount: -round2(fuel), kind: 'expense' },
    { id: 'tolls', label: 'Tolls', amount: -round2(tolls), kind: 'expense' },
    { id: 'maintenance', label: 'Maintenance', amount: null, kind: 'expense', tracked: false },
    { id: 'driver_payouts', label: 'Driver payouts', amount: -round2(driverPayouts), kind: 'expense' },
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
      `${formatMoneyPlain(tollNet.provisional)} of Tolls is from trip-level tolls with no cash-wash/phantom/personal determination synced to this P&L yet — if these were already resolved in Toll Reconciliation, run the P&L offset backfill to sync them here; this number may otherwise change once reviewed.`,
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
  other: number;
  tollEventCount: number;
  fuelEventCount: number;
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
    'toll_refund',
    'toll_charge_offset',
    'refund_expense',
    'adjustment',
  ];
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
    } else if (t === 'toll_charge') {
      tolls += amt;
      tollEventCount++;
      category = 'Toll';
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
    fuel: round2(Math.max(0, fuel)),
    tolls: round2(Math.max(0, tolls)),
    other: round2(other),
    tollEventCount,
    fuelEventCount,
    rows: rows.slice(0, 100),
  };
}
