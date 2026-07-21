/**
 * Shared ExpensesSnapshot builder from canonical ledger events.
 * Used by the full BF bundle and by the lightweight Expense Hub loader —
 * keeps category math identical in both places.
 */
import { api } from '../../services/api';
import { buildPnLFromCanonicalEvents, sumExpenseRowsFromEvents } from './businessFinancePnL';
import type { BusinessFinancePeriod, ExpensesSnapshot } from './types';
import { round2, formatMoney } from './money';

export async function fetchAllCanonicalEvents(
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

/**
 * Build the category-card snapshot from ledger events.
 * `fallback` covers periods where fuel/toll ledger events are missing (bundle
 * passes driver-period sums; the Hub loader passes nothing → ledger-only).
 */
export function buildExpensesSnapshot(
  ledgerEvents: Record<string, unknown>[],
  period: BusinessFinancePeriod,
  fallback: { fuel?: number; tolls?: number } = {},
): ExpensesSnapshot {
  const pnl = buildPnLFromCanonicalEvents(ledgerEvents, period);
  const expenseAgg = sumExpenseRowsFromEvents(ledgerEvents, period);

  // Prefer ledger when fuel/toll events exist — never treat net $0 as "ledger empty".
  const fuel = expenseAgg.fuelEventCount > 0 ? expenseAgg.fuel : round2(fallback.fuel || 0);
  const tolls = expenseAgg.tollEventCount > 0 ? expenseAgg.tolls : round2(fallback.tolls || 0);
  const maintenance = expenseAgg.maintenance;
  const operatingExpenses = expenseAgg.operating;

  return {
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
          (expenseAgg.byCategory.Permits || 0) + (expenseAgg.byCategory.Registration || 0),
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
}
