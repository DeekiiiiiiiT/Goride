import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from 'recharts';
import { SafeResponsiveContainer as ResponsiveContainer } from '../ui/SafeResponsiveContainer';
import { Trip, FinancialTransaction, QuotaConfig, LedgerDriverOverview } from '../../types/data';
import { DriverEarningsHistory } from './DriverEarningsHistory';
import { DriverExpensesHistory } from './DriverExpensesHistory';
import { DriverPayoutHistory } from './DriverPayoutHistory';
import { SettlementSummaryView } from './SettlementSummaryView';
import { api } from '../../services/api';
import { useDriverFinancialBundle, type DriverLike } from '../../hooks/useDriverFinancialBundle';

interface DriverTollChargeTotals {
  chargedToDriver: number;
  writtenOff: number;
  business: number;
  refunded: number;
  reconciled: number;
  cashWash: number;
  unresolved: number;
}

// ────────────────────────────────────────────────────────────
// Props
// ────────────────────────────────────────────────────────────

interface FinancialSubTabsProps {
  driverId: string;
  driver?: DriverLike | null;
  transactions: FinancialTransaction[];
  allTrips: Trip[];
  quotaConfig: QuotaConfig | null;
  platformBreakdownData: Array<{ name: string; value: number; color: string }>;
  platformTotalEarnings: number;
  csvMetrics?: import('../../types/data').DriverMetrics[];
  uberLedgerReconciliation?: LedgerDriverOverview['period']['uber'] | null;
}

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

export function FinancialSubTabs({
  driverId,
  driver = null,
  transactions,
  allTrips,
  quotaConfig,
  platformBreakdownData,
  platformTotalEarnings,
  csvMetrics = [],
  uberLedgerReconciliation = null,
}: FinancialSubTabsProps) {
  // Shared Financials core — stays mounted across Expenses/Settlement/Payout switches.
  const financialBundle = useDriverFinancialBundle(driverId, driver);

  // Driver toll disposition (charged / written-off / business / refunded /
  // reconciled) — server-computed from toll_ledger for the Reconciliation tab.
  const [tollTotals, setTollTotals] = React.useState<DriverTollChargeTotals | null>(null);
  React.useEffect(() => {
    let active = true;
    if (!driverId) return;
    api.getDriverTollCharges(driverId)
      .then(res => { if (active) setTollTotals(res.data.totals); })
      .catch(err => console.error('[FinancialSubTabs] driver toll charges load failed', err));
    return () => { active = false; };
  }, [driverId]);

  // Cash Wash is a new bucket that only appears once the unified settlement
  // model is trusted — gate its display so the card grid doesn't change for
  // fleets that haven't opted in yet.
  const unifiedTollSettlementEnabled = financialBundle.unifiedToll;

  const uberSsotReconciliation = React.useMemo(() => {
    let fareComponents = 0;
    let tips = 0;
    let promotions = 0;
    let refundExpense = 0;

    for (const t of allTrips) {
      const platformNorm = String(t.platform || '').toLowerCase();
      if (platformNorm !== 'uber') continue;
      fareComponents += Number(t.uberFareComponents) || 0;
      tips += Number(t.uberTips) || 0;
      promotions += Number(t.uberPromotionsAmount) || 0;
      refundExpense += Number(t.uberRefundExpenseAmount) || 0;
    }

    const netEarnings = fareComponents + tips + promotions - refundExpense;
    return { fareComponents, tips, promotions, refundExpense, netEarnings };
  }, [allTrips]);

  const reconciliationStatus = React.useMemo(() => {
    if (!uberLedgerReconciliation) return { label: 'No ledger reconciliation data', ok: false };
    const deltaNet = uberSsotReconciliation.netEarnings - uberLedgerReconciliation.netEarnings;
    return {
      label: Math.abs(deltaNet) <= 0.05 ? 'Reconciled' : `Mismatch (delta ${deltaNet.toFixed(2)})`,
      ok: Math.abs(deltaNet) <= 0.05,
    };
  }, [uberLedgerReconciliation, uberSsotReconciliation.netEarnings]);

  return (
    <Tabs defaultValue="earnings" className="space-y-4">
      <TabsList className="grid w-full grid-cols-5 max-w-[750px]">
        <TabsTrigger value="earnings">Earnings</TabsTrigger>
        <TabsTrigger value="expenses">Expenses</TabsTrigger>
        <TabsTrigger value="settlement">Settlement</TabsTrigger>
        <TabsTrigger value="payout">Payout</TabsTrigger>
        <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
      </TabsList>

      {/* ── Earnings Sub-Tab ── */}
      <TabsContent value="earnings" className="space-y-6">
        <div className="grid grid-cols-1 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Earnings Breakdown by Platform</CardTitle>
              <CardDescription className="text-xs text-slate-500">
                All-time completed trip earnings across platforms
              </CardDescription>
            </CardHeader>
            <CardContent>
              {platformBreakdownData.length > 0 ? (
                <div className="flex flex-col md:flex-row items-center gap-6">
                  <div className="relative w-full md:w-1/2 h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={platformBreakdownData}
                          cx="50%"
                          cy="50%"
                          innerRadius={65}
                          outerRadius={90}
                          paddingAngle={4}
                          dataKey="value"
                        >
                          {platformBreakdownData.map((entry, index) => (
                            <Cell key={`plat-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number) => [
                            `$${value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
                            'Earnings',
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    {/* Recharts center Label often gets wrong/missing cx,cy in SVG — overlay keeps total visible */}
                    <div
                      className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center"
                      aria-hidden
                    >
                      <span className="text-lg font-bold tabular-nums text-slate-900">
                        {`$${Number.isFinite(platformTotalEarnings) ? platformTotalEarnings.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}`}
                      </span>
                      <span className="text-[11px] text-slate-400 mt-0.5">Total Earnings</span>
                    </div>
                  </div>
                  <div className="w-full md:w-1/2 space-y-2">
                    {platformBreakdownData.map((d) => {
                      const pct =
                        platformTotalEarnings > 0
                          ? (d.value / platformTotalEarnings) * 100
                          : 0;
                      return (
                        <div key={d.name} className="flex items-center gap-3">
                          <div
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: d.color }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-slate-700">
                                {d.name}
                              </span>
                              <span className="text-sm text-slate-600 font-medium">
                                {`$${d.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                              </span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-100 rounded-full mt-1">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${pct}%`, backgroundColor: d.color }}
                              />
                            </div>
                          </div>
                          <span className="text-xs text-slate-400 w-10 text-right">
                            {pct.toFixed(0)}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-[200px] text-slate-400 text-sm">
                  No completed trips found for earnings breakdown.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <DriverEarningsHistory
          driverId={driverId}
          quotaConfig={quotaConfig || undefined}
          trips={allTrips}
          transactions={transactions}
        />
      </TabsContent>

      {/* ── Expenses Sub-Tab ── */}
      <TabsContent value="expenses" className="space-y-6">
        <DriverExpensesHistory
          driverId={driverId}
          driver={driver}
          transactions={transactions}
          trips={allTrips}
          financialBundle={financialBundle}
        />
      </TabsContent>

      {/* ── Payout Sub-Tab ── */}
      <TabsContent value="payout" className="space-y-6">
        <DriverPayoutHistory
          driverId={driverId}
          driver={driver}
          transactions={transactions}
          trips={allTrips}
          csvMetrics={csvMetrics}
          financialBundle={financialBundle}
        />
      </TabsContent>

      {/* ── Settlement Sub-Tab ── */}
      <TabsContent value="settlement" className="space-y-6">
        <SettlementSummaryView
          driverId={driverId}
          driver={driver}
          trips={allTrips}
          transactions={transactions}
          csvMetrics={csvMetrics}
          financialBundle={financialBundle}
        />
      </TabsContent>

      {/* ── Reconciliation Sub-Tab ── */}
      <TabsContent value="reconciliation" className="space-y-6">
        {/* Toll disposition — how this driver's tolls were resolved. */}
        <Card>
          <CardHeader>
            <CardTitle>Toll Reconciliation</CardTitle>
            <CardDescription className="text-xs text-slate-500">
              How this driver's tolls were resolved by the admin.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!tollTotals ? (
              <div className="text-sm text-slate-400 py-4">Loading toll disposition…</div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {([
                  { label: 'Charged to Driver', value: tollTotals.chargedToDriver, tone: 'text-rose-600', hint: 'Personal-use tolls billed to this driver.' },
                  { label: 'Reconciled', value: tollTotals.reconciled, tone: 'text-emerald-600', hint: 'Matched to a trip (platform reimbursed).' },
                  { label: 'Refunded', value: tollTotals.refunded, tone: 'text-emerald-600', hint: 'Refunded by the provider.' },
                  { label: 'Business Expense', value: tollTotals.business, tone: 'text-slate-700', hint: 'Absorbed by the fleet as a business cost.' },
                  { label: 'Written Off', value: tollTotals.writtenOff, tone: 'text-slate-700', hint: 'Written off as a loss.' },
                  ...(unifiedTollSettlementEnabled
                    ? [{ label: 'Cash Wash', value: tollTotals.cashWash, tone: 'text-sky-600', hint: 'Cash toll, no resolution yet — nets against what the driver is owed, not a real loss.' }] as const
                    : []),
                  { label: 'Unresolved', value: tollTotals.unresolved, tone: 'text-amber-600', hint: 'Still pending reconciliation.' },
                ] as const).map(item => (
                  <div key={item.label} className="rounded-lg border border-slate-200 p-3">
                    <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">{item.label}</p>
                    <p className={`text-lg font-bold mt-1 ${item.tone}`}>
                      ${item.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{item.hint}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Uber Reconciliation (SSOT vs Ledger)</CardTitle>
            <CardDescription className="text-xs text-slate-500">
              {reconciliationStatus.label}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  SSOT (allocated from payments_driver)
                </p>
                <div className="space-y-1.5 mt-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Fare Components</span>
                    <span className="font-medium">
                      ${uberSsotReconciliation.fareComponents.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Tips</span>
                    <span className="font-medium">
                      ${uberSsotReconciliation.tips.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Promotions</span>
                    <span className="font-medium">
                      ${uberSsotReconciliation.promotions.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Refunds/Expenses</span>
                    <span className="font-medium">
                      ${uberSsotReconciliation.refundExpense.toFixed(2)}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-slate-100 flex justify-between">
                    <span className="font-semibold">Net Earnings</span>
                    <span className="font-semibold">
                      ${uberSsotReconciliation.netEarnings.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Ledger (computed from kv_store)
                </p>
                <div className="space-y-1.5 mt-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Fare Components</span>
                    <span className="font-medium">
                      ${(uberLedgerReconciliation?.fareComponents ?? 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Tips</span>
                    <span className="font-medium">
                      ${(uberLedgerReconciliation?.tips ?? 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Promotions</span>
                    <span className="font-medium">
                      ${(uberLedgerReconciliation?.promotions ?? 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Refunds/Expenses</span>
                    <span className="font-medium">
                      ${(uberLedgerReconciliation?.refundExpense ?? 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-slate-100 flex justify-between">
                    <span className="font-semibold">Net Earnings</span>
                    <span className="font-semibold">
                      ${(uberLedgerReconciliation?.netEarnings ?? 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}