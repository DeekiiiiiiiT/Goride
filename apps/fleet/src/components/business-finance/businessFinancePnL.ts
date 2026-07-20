/**
 * Pure P&L builder from canonical ledger events — read-only owner view.
 * Never feeds settlement math.
 */
import type { BusinessFinancePeriod, BusinessFinancePnL, PnLLine, PlatformSplitRow } from './types';
import { inPeriod } from './periodRange';
import { round2 } from './money';

type LedgerLike = Record<string, unknown>;

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function eventDate(e: LedgerLike): string {
  return String(e.date || e.postingAt || e.createdAt || '').slice(0, 10);
}

function eventAmount(e: LedgerLike): number {
  const net = num(e.netAmount);
  if (net !== 0) return Math.abs(net);
  return Math.abs(num(e.grossAmount));
}

function platformOf(e: LedgerLike): string {
  const p = String(e.platform || 'unknown').toLowerCase();
  if (p.includes('uber')) return 'Uber';
  if (p.includes('indrive') || p.includes('in_drive')) return 'InDrive';
  if (p.includes('roam')) return 'Roam';
  return p === 'unknown' ? 'Other' : p;
}

/**
 * Net toll figures from raw canonical events. A `toll_charge` only represents
 * a real, unrecovered business loss once you subtract:
 *  - `toll_refund` — the toll operator literally refunded it
 *  - `toll_charge_offset` (inflow) — Toll Reconciliation determined it's a
 *    cash_wash / phantom / expense_logged-superseded / personal-recovered
 *    charge, so it's not a fleet loss (see toll_pnl_offset.ts)
 * and add back:
 *  - `toll_charge_offset` (outflow) — a prior offset was reinstated (e.g. a
 *    resolution reverted to pending)
 * `toll_charged_to_driver` / `toll_charge_reversed` are driver-wallet billing
 * events, not a fleet cost decision — deliberately NOT netted here.
 */
function computeTollNetting(scoped: LedgerLike[]): {
  gross: number;
  recovered: number;
  reinstated: number;
  net: number;
  clipped: boolean;
  provisional: number;
} {
  let gross = 0;
  let recovered = 0;
  let reinstated = 0;
  const offsetSourceIds = new Set<string>();
  const tripCharges: Array<{ sourceId: string; amt: number }> = [];

  for (const e of scoped) {
    const t = String(e.eventType || '');
    const amt = eventAmount(e);
    if (t === 'toll_charge') {
      gross += amt;
      if (String(e.sourceType || '') === 'trip') {
        tripCharges.push({ sourceId: String(e.sourceId || ''), amt });
      }
    } else if (t === 'toll_refund') {
      recovered += amt;
    } else if (t === 'toll_charge_offset') {
      const dir = String(e.direction || '');
      if (dir === 'inflow') {
        recovered += amt;
        offsetSourceIds.add(String(e.sourceId || ''));
      } else if (dir === 'outflow') {
        reinstated += amt;
      }
    }
  }

  const rawNet = gross - recovered + reinstated;
  const net = round2(Math.max(0, rawNet));
  const clipped = rawNet < -0.005;

  // Trip-level tolls (unlinked-refund flow) with no active offset in scope are
  // either still `pending` review, or the offset-emission flag is off — either
  // way, honestly disclosed as not-yet-resolution-confirmed.
  const provisional = round2(
    tripCharges.reduce((s, tc) => (offsetSourceIds.has(tc.sourceId) ? s : s + tc.amt), 0),
  );

  return { gross: round2(gross), recovered: round2(recovered), reinstated: round2(reinstated), net, clipped, provisional };
}

export function buildPnLFromCanonicalEvents(
  events: LedgerLike[] | undefined | null,
  period: BusinessFinancePeriod,
): BusinessFinancePnL {
  const scoped = (events || []).filter((e) => inPeriod(eventDate(e), period));
  let gross = 0;
  let fees = 0;
  let fuel = 0;
  let driverPayouts = 0;
  const byPlatform = new Map<string, { gross: number; fees: number }>();

  for (const e of scoped) {
    const t = String(e.eventType || '');
    const amt = eventAmount(e);
    const plat = platformOf(e);
    if (!byPlatform.has(plat)) byPlatform.set(plat, { gross: 0, fees: 0 });
    const row = byPlatform.get(plat)!;

    if (t === 'fare_earning' || t === 'tip' || t === 'promotion') {
      gross += amt;
      row.gross += amt;
    } else if (t === 'platform_fee') {
      fees += amt;
      row.fees += amt;
    } else if (t === 'fuel_expense') {
      fuel += amt;
    } else if (t === 'payout_cash' || t === 'driver_payout') {
      driverPayouts += amt;
    }
  }

  const tollNet = computeTollNetting(scoped);
  const tolls = tollNet.net;

  const netTrip = round2(gross - fees);
  // Maintenance & wallet not on canonical chart yet — exclude from profit, show as untracked
  const operatingProfit = round2(netTrip - fuel - tolls - driverPayouts);
  const operatingRatio = gross > 0.005 ? round2(((gross - operatingProfit) / gross) * 100) : null;

  const lines: PnLLine[] = [
    { id: 'gross', label: 'Gross platform earnings', amount: round2(gross), kind: 'total' },
    { id: 'platform_fees', label: 'Platform fees', amount: -round2(fees), kind: 'expense' },
    { id: 'net_trip', label: 'Net trip revenue', amount: netTrip, kind: 'subtotal' },
    { id: 'fuel', label: 'Fuel', amount: -round2(fuel), kind: 'expense' },
    { id: 'tolls', label: 'Tolls', amount: -round2(tolls), kind: 'expense' },
    ...(tollNet.recovered > 0.005
      ? [
          {
            id: 'tolls_memo' as const,
            label: 'of which recovered / cash-washed (not a fleet loss)',
            amount: round2(tollNet.recovered - tollNet.reinstated),
            kind: 'memo' as const,
          },
        ]
      : []),
    { id: 'maintenance', label: 'Maintenance', amount: null, kind: 'expense', tracked: false },
    { id: 'wallet_loads', label: 'Wallet loads', amount: null, kind: 'expense', tracked: false },
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

  return {
    lines,
    operatingRatio,
    platformSplit,
    coverageNote: noteParts.length ? noteParts.join(' ') : undefined,
    tollsRecoveredWashed: tollNet.recovered > 0.005 ? round2(tollNet.recovered - tollNet.reinstated) : undefined,
  };
}

function formatMoneyPlain(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function sumExpenseRowsFromEvents(
  events: LedgerLike[] | undefined | null,
  period: BusinessFinancePeriod,
): { fuel: number; tolls: number; other: number; rows: Array<{
  id: string;
  dateYmd: string;
  category: string;
  description: string;
  amount: number;
  source: string;
}> } {
  const scoped = (events || []).filter((e) => inPeriod(eventDate(e), period));
  let fuel = 0;
  let tolls = 0;
  let other = 0;
  const rows: Array<{
    id: string;
    dateYmd: string;
    category: string;
    description: string;
    amount: number;
    source: string;
  }> = [];

  const RECOGNIZED = ['fuel_expense', 'toll_charge', 'toll_refund', 'toll_charge_offset', 'refund_expense', 'adjustment'];
  for (const e of scoped) {
    const t = String(e.eventType || '');
    if (!RECOGNIZED.includes(t)) continue;
    const amt = eventAmount(e);
    const dateYmd = eventDate(e);
    let category = 'Other';
    let signedAmount = amt;
    if (t === 'fuel_expense') {
      fuel += amt;
      category = 'Fuel';
    } else if (t === 'toll_charge') {
      tolls += amt;
      category = 'Toll';
    } else if (t === 'toll_refund') {
      // Real refund from the toll operator — a credit against Tolls.
      tolls -= amt;
      category = 'Toll';
      signedAmount = -amt;
    } else if (t === 'toll_charge_offset') {
      // Not a fleet loss (cash_wash/phantom/expense_logged/personal) — credit;
      // or a reinstatement of a prior offset — debit. See toll_pnl_offset.ts.
      category = 'Toll';
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
  return { fuel: round2(fuel), tolls: round2(Math.max(0, tolls)), other: round2(other), rows: rows.slice(0, 100) };
}
