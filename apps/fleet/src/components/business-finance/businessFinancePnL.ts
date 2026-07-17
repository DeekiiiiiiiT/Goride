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

export function buildPnLFromCanonicalEvents(
  events: LedgerLike[] | undefined | null,
  period: BusinessFinancePeriod,
): BusinessFinancePnL {
  const scoped = (events || []).filter((e) => inPeriod(eventDate(e), period));
  let gross = 0;
  let fees = 0;
  let fuel = 0;
  let tolls = 0;
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
    } else if (t === 'toll_charge') {
      tolls += amt;
    } else if (t === 'payout_cash' || t === 'driver_payout') {
      driverPayouts += amt;
    }
  }

  const netTrip = round2(gross - fees);
  // Maintenance & wallet not on canonical chart yet — show 0 with coverage note when empty ledger
  const maintenance = 0;
  const walletLoads = 0;
  const operatingProfit = round2(netTrip - fuel - tolls - maintenance - walletLoads - driverPayouts);
  const operatingRatio = gross > 0.005 ? round2(((gross - operatingProfit) / gross) * 100) : null;

  const lines: PnLLine[] = [
    { id: 'gross', label: 'Gross platform earnings', amount: round2(gross), kind: 'total' },
    { id: 'platform_fees', label: 'Platform fees', amount: -round2(fees), kind: 'expense' },
    { id: 'net_trip', label: 'Net trip revenue', amount: netTrip, kind: 'subtotal' },
    { id: 'fuel', label: 'Fuel', amount: -round2(fuel), kind: 'expense' },
    { id: 'tolls', label: 'Tolls', amount: -round2(tolls), kind: 'expense' },
    { id: 'maintenance', label: 'Maintenance', amount: -round2(maintenance), kind: 'expense' },
    { id: 'wallet_loads', label: 'Wallet loads', amount: -round2(walletLoads), kind: 'expense' },
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

  return {
    lines,
    operatingRatio,
    platformSplit,
    coverageNote:
      scoped.length === 0
        ? 'No canonical ledger events in this period — import statements/trips to populate P&L.'
        : undefined,
  };
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

  for (const e of scoped) {
    const t = String(e.eventType || '');
    if (!['fuel_expense', 'toll_charge', 'refund_expense', 'adjustment'].includes(t)) continue;
    const amt = eventAmount(e);
    const dateYmd = eventDate(e);
    let category = 'Other';
    if (t === 'fuel_expense') {
      fuel += amt;
      category = 'Fuel';
    } else if (t === 'toll_charge') {
      tolls += amt;
      category = 'Toll';
    } else {
      other += amt;
    }
    rows.push({
      id: String(e.id || `${t}-${dateYmd}-${rows.length}`),
      dateYmd,
      category,
      description: String(e.description || e.uberDescription || t),
      amount: round2(amt),
      source: String(e.sourceType || 'ledger'),
    });
  }

  rows.sort((a, b) => b.dateYmd.localeCompare(a.dateYmd));
  return { fuel: round2(fuel), tolls: round2(tolls), other: round2(other), rows: rows.slice(0, 100) };
}
