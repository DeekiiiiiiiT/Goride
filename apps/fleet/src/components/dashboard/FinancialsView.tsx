import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  Line,
  ComposedChart,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { SafeResponsiveContainer as ResponsiveContainer } from '../ui/SafeResponsiveContainer';
import { Trip } from '../../types/data';
import { DollarSign, TrendingUp, Wallet, PiggyBank, Receipt, Database } from "lucide-react";

interface FinancialsViewProps {
  trips: Trip[];
  // Phase 5: Ledger-sourced fleet summary (optional — falls back to trips if null)
  fleetSummary?: {
    totalEarnings: number;
    totalTripCount: number;
    totalCashCollected: number;
    dailyTrend: Array<{ date: string; earnings: number; tripCount: number }>;
    topDrivers: Array<{ driverId: string; driverName: string; earnings: number; tripCount: number }>;
    platformBreakdown: Array<{ platform: string; earnings: number; tripCount: number }>;
    revenueByType: { fare: number; tip: number; promotion: number; other: number };
  } | null;
  /** Navigate to another page id (e.g. Business Finance) for CTA links. */
  onNavigate?: (page: string) => void;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

export function FinancialsView({ trips, fleetSummary = null, onNavigate }: FinancialsViewProps) {
  // Budgets moved to Business Finance → Budgets (single source of truth with
  // ledger-sourced actuals). This view is ledger-sourced revenue analytics only.

  // Financial Metrics Calculation
  const metrics = useMemo(() => {
    let totalRevenue = 0;
    let totalCash = 0;
    let totalRefunds = 0;
    let totalTips = 0;
    let avgRevenuePerTrip = 0;
    let expenseRatio = 0;
    let cashPercentage = 0;
    let bestPlatform = 'N/A';
    let platformStats: Record<string, { revenue: number, count: number }> = {};
    let pieData: Array<{ name: string; value: number }> = [];
    let revenueSource: 'ledger' | 'unavailable' = 'unavailable';

    if (fleetSummary) {
      // Phase 6: Ledger is sole source — no trip fallback
      revenueSource = 'ledger';
      totalRevenue = fleetSummary.totalEarnings;
      totalCash = fleetSummary.totalCashCollected;
      avgRevenuePerTrip = fleetSummary.totalTripCount > 0 ? totalRevenue / fleetSummary.totalTripCount : 0;
      cashPercentage = totalRevenue > 0 ? (totalCash / totalRevenue) * 100 : 0;

      // Revenue by type from ledger
      const rbt = fleetSummary.revenueByType;
      pieData = [
        { name: 'Fare', value: rbt.fare },
        { name: 'Tip', value: rbt.tip },
        { name: 'Promotion', value: rbt.promotion },
        { name: 'Other', value: rbt.other },
      ].filter(d => d.value > 0);
      totalTips = rbt.tip;

      // Platform stats from ledger
      fleetSummary.platformBreakdown.forEach(p => {
        platformStats[p.platform] = { revenue: p.earnings, count: p.tripCount };
      });

      // Best platform
      let maxRev = 0;
      Object.entries(platformStats).forEach(([p, stats]) => {
        if (stats.revenue > maxRev) {
          maxRev = stats.revenue;
          bestPlatform = p;
        }
      });

      // Refunds/expenses — known gap: not in ledger yet, compute from trips
      const completedTrips = trips.filter(t => t.status === 'Completed' || t.transactionType);
      completedTrips.forEach(t => {
        const amt = t.amount || 0;
        if (amt < 0) totalRefunds += Math.abs(amt);
      });
      expenseRatio = totalRevenue > 0 ? (totalRefunds / totalRevenue) * 100 : 0;

    } else {
      // Phase 6: No trip fallback — show zeros when ledger unavailable
      console.error('[FinancialsView] Ledger fleet summary unavailable — showing $0 (no trip fallback)');
    }

    return {
      totalRevenue,
      avgRevenuePerTrip,
      bestPlatform,
      platformStats,
      totalCash,
      totalRefunds,
      totalTips,
      expenseRatio,
      cashPercentage,
      pieData,
      revenueSource
    };
  }, [trips, fleetSummary]);

  // Daily Revenue & Trip Count Data for Composed Chart
  const chartData = useMemo(() => {
    // Phase 6: Ledger is sole source — no trip fallback
    if (fleetSummary?.dailyTrend && fleetSummary.dailyTrend.length > 0) {
      // Deduplicate by date label to avoid Recharts duplicate key warnings
      const seen = new Map<string, number>();
      return fleetSummary.dailyTrend.map(d => {
        let label = new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const count = seen.get(label) || 0;
        seen.set(label, count + 1);
        if (count > 0) label = `${label} (${count + 1})`;
        return { date: label, revenue: d.earnings, trips: d.tripCount };
      });
    }

    // Phase 6: Return empty when ledger unavailable
    console.error('[FinancialsView] Ledger daily trend unavailable — showing empty chart (no trip fallback)');
    return [];
  }, [fleetSummary]);

  return (
    <div className="space-y-6">
      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard 
          title="Total Earnings"
          value={`$${metrics.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
          icon={<DollarSign className="h-4 w-4 text-emerald-600" />}
          subtext="Gross Revenue"
          sourceTag={metrics.revenueSource === 'ledger' 
            ? <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full font-medium"><Database className="h-2.5 w-2.5" />Ledger</span>
            : <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full font-medium">Unavailable</span>
          }
        />
        <MetricCard 
          title="Net Profit (Est)"
          value={`$${(metrics.totalRevenue - metrics.totalRefunds).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
          icon={<Wallet className="h-4 w-4 text-indigo-600" />}
          subtext="After expenses"
        />
         <MetricCard 
          title="Avg / Driver"
          value={`$${metrics.avgRevenuePerTrip.toFixed(2)}`} // Placeholder for per driver
          icon={<TrendingUp className="h-4 w-4 text-blue-600" />}
          subtext="Per Trip Average"
        />
        <MetricCard 
          title="Expense Ratio"
          value={`${metrics.expenseRatio.toFixed(1)}%`}
          icon={<Receipt className="h-4 w-4 text-rose-600" />}
          subtext={`$${metrics.totalRefunds.toFixed(0)} refunded`}
        />
        <MetricCard 
          title="Cash %"
          value={`${metrics.cashPercentage.toFixed(1)}%`}
          icon={<PiggyBank className="h-4 w-4 text-amber-600" />}
          subtext={`$${metrics.totalCash.toLocaleString()} collected`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Budgets moved to Business Finance (ledger-sourced actuals). */}
        <Card className="lg:col-span-1">
            <CardHeader>
                <CardTitle className="text-lg">Budget vs Actual</CardTitle>
                <CardDescription>Now managed in Business Finance.</CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-slate-500 mb-4">
                    Monthly budgets and variance against real ledger actuals now live in
                    Business Finance, so targets are checked against the same numbers as
                    your Profit &amp; Loss.
                </p>
                {onNavigate && (
                    <button
                        type="button"
                        onClick={() => onNavigate('business-finance')}
                        className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                    >
                        Open Business Finance
                    </button>
                )}
            </CardContent>
        </Card>

        {/* Main Chart: Revenue vs Volume */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Revenue vs. Trip Volume</CardTitle>
            <CardDescription>
              Daily comparison of gross revenue and number of trips (Last 14 Days).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[350px] w-full overflow-x-auto flex justify-center">
              {chartData.length > 0 ? (
                <div style={{ minWidth: '600px', height: '100%' }}>
                  <ResponsiveContainer width="100%" height="100%" minWidth={600} minHeight={300}>
                    <ComposedChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis 
                        dataKey="date" 
                        stroke="#64748b" 
                        fontSize={12} 
                        tickLine={false} 
                        axisLine={false} 
                        />
                        <YAxis 
                        yAxisId="left" 
                        stroke="#64748b" 
                        fontSize={12} 
                        tickLine={false} 
                        axisLine={false} 
                        tickFormatter={(value) => `$${value}`}
                        />
                        <YAxis 
                        yAxisId="right" 
                        orientation="right" 
                        stroke="#64748b" 
                        fontSize={12} 
                        tickLine={false} 
                        axisLine={false}
                        />
                        <Tooltip 
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        />
                        <Legend verticalAlign="top" height={36}/>
                        <Bar yAxisId="left" dataKey="revenue" name="Revenue" fill="#4f46e5" radius={[4, 4, 0, 0]} barSize={30} />
                        <Line yAxisId="right" type="monotone" dataKey="trips" name="Trip Count" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400">
                  No data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Revenue Breakdown (Pie) */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Revenue Breakdown</CardTitle>
            <CardDescription>Source of earnings.</CardDescription>
          </CardHeader>
          <CardContent>
             <div className="h-[250px] w-full" style={{ minWidth: '200px' }}>
                {metrics.pieData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%" minWidth={200} minHeight={200}>
                        <PieChart>
                            <Pie
                                data={metrics.pieData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="value"
                            >
                                {metrics.pieData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(val) => `$${Number(val).toFixed(2)}`} />
                            <Legend verticalAlign="bottom" height={36} />
                        </PieChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="flex items-center justify-center h-full text-slate-400">
                        No breakdown available
                    </div>
                )}
             </div>
             {/* Expense Summary List */}
             <div className="mt-4 space-y-3 pt-4 border-t">
                 <h4 className="text-sm font-medium text-slate-700">Expense Analysis</h4>
                 <div className="flex justify-between text-sm">
                     <span className="text-slate-500">Refunds</span>
                     <span className="font-medium text-rose-600">${metrics.totalRefunds.toFixed(2)}</span>
                 </div>
                 <div className="flex justify-between text-sm">
                     <span className="text-slate-500">Tolls & Fees</span>
                     <span className="font-medium text-slate-900">$0.00</span>
                 </div>
                 <div className="flex justify-between text-sm">
                     <span className="text-slate-500">Net Profit Margin</span>
                     <span className="font-medium text-emerald-600">
                         {metrics.totalRevenue > 0 ? (100 - metrics.expenseRatio).toFixed(1) : 0}%
                     </span>
                 </div>
             </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ title, value, icon, subtext, sourceTag }: { title: string, value: string, icon: React.ReactNode, subtext: string, sourceTag?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
          {title}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</div>
        <p className="text-xs text-slate-500 mt-1">
          {subtext}
        </p>
        {sourceTag && <div className="mt-1">{sourceTag}</div>}
      </CardContent>
    </Card>
  );
}