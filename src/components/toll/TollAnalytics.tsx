import React, { useMemo } from 'react';
import { Receipt, Loader2, RefreshCw, TrendingDown, TrendingUp, CreditCard, Calculator, Users, Zap, MapPin, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { useTollLogs } from '../../hooks/useTollLogs';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Cell,
  PieChart, Pie, Legend,
} from 'recharts';
import { SafeResponsiveContainer as ResponsiveContainer } from '../ui/SafeResponsiveContainer';
import { format, subMonths, startOfMonth, endOfMonth, eachMonthOfInterval } from 'date-fns';

/** Format a number as Jamaican Dollar currency */
function formatJMD(value: number, decimals = 0): string {
  return new Intl.NumberFormat('en-JM', {
    style: 'currency',
    currency: 'JMD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Colour palette for bar chart cells */
const PLAZA_COLORS = ['#6366f1', '#10b981', '#ec4899', '#f59e0b', '#38bdf8', '#8b5cf6', '#ef4444', '#14b8a6'];

/** Colour map for payment method donut slices */
const PAYMENT_COLORS: Record<string, string> = {
  'E-Tag': '#6366f1',
  'Cash': '#f59e0b',
  'Card': '#38bdf8',
  'Transfer': '#10b981',
  'Other': '#94a3b8',
};
const PAYMENT_FALLBACK_COLOR = '#cbd5e1';

/** Assumed discount rate when switching from Cash to E-Tag */
const TAG_DISCOUNT_RATE = 0.10;

/** Colour map for reconciliation status donut */
const STATUS_COLORS: Record<string, string> = {
  Completed: '#10b981',
  Pending: '#f59e0b',
  Flagged: '#ef4444',
  Reconciled: '#3b82f6',
  Void: '#94a3b8',
  Disputed: '#8b5cf6',
  Unknown: '#cbd5e1',
};

export function TollAnalytics() {
  const { logs, loading, vehicles, drivers, plazas, refresh } = useTollLogs();

  // ── Step 2.1 — Summary statistics ──────────────────────────────────────
  const summaryStats = useMemo(() => {
    const usageLogs = logs.filter(l => l.isUsage);
    const topupLogs = logs.filter(l => !l.isUsage);

    const totalSpend = usageLogs.reduce((sum, l) => sum + l.absAmount, 0);
    const totalTopups = topupLogs.reduce((sum, l) => sum + l.absAmount, 0);
    const usageCount = usageLogs.length;
    const avgCostPerPassage = usageCount > 0 ? totalSpend / usageCount : 0;

    const eTagCount = usageLogs.filter(l => l.paymentMethodDisplay === 'E-Tag').length;
    const eTagRate = usageCount > 0 ? (eTagCount / usageCount) * 100 : 0;

    const netPosition = totalTopups - totalSpend;

    return {
      totalSpend,
      totalTopups,
      totalTransactions: logs.length,
      usageCount,
      avgCostPerPassage,
      eTagCount,
      eTagRate,
      netPosition,
    };
  }, [logs]);

  // ── Step 3.1 — Monthly spend trend (last 6 months) ────────────────────
  const monthlyTrendData = useMemo(() => {
    const sixMonthsAgo = subMonths(new Date(), 6);
    const months = eachMonthOfInterval({
      start: startOfMonth(sixMonthsAgo),
      end: endOfMonth(new Date()),
    });

    return months.map(month => {
      const mStart = startOfMonth(month);
      const mEnd = endOfMonth(month);
      const inMonth = logs.filter(l => {
        const d = new Date(l.date);
        return d >= mStart && d <= mEnd;
      });

      const spend = inMonth.filter(l => l.isUsage).reduce((s, l) => s + l.absAmount, 0);
      const topups = inMonth.filter(l => !l.isUsage).reduce((s, l) => s + l.absAmount, 0);
      const passages = inMonth.filter(l => l.isUsage).length;

      return {
        name: format(month, 'MMM yyyy'),
        spend: Number(spend.toFixed(2)),
        topups: Number(topups.toFixed(2)),
        passages,
      };
    });
  }, [logs]);

  // ── Step 3.2 — Spend by plaza (top 8) ─────────────────────────────────
  const plazaSpendData = useMemo(() => {
    const map: Record<string, { name: string; spend: number; count: number }> = {};
    logs.filter(l => l.isUsage).forEach(l => {
      const key = l.plazaName || 'Unknown Plaza';
      if (!map[key]) map[key] = { name: key, spend: 0, count: 0 };
      map[key].spend += l.absAmount;
      map[key].count += 1;
    });
    return Object.values(map)
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 8)
      .map(p => ({ ...p, spend: Number(p.spend.toFixed(2)) }));
  }, [logs]);

  // ── Step 3.3 — Payment method distribution ───────────────────────────
  const paymentMethodData = useMemo(() => {
    const map: Record<string, number> = {};
    logs.filter(l => l.isUsage).forEach(l => {
      const key = l.paymentMethodDisplay || 'Other';
      if (!map[key]) map[key] = 0;
      map[key] += 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [logs]);

  // ── Step 4 — Vehicle Spend & Payment Method ───────────────────
  const vehicleSpendData = useMemo(() => {
    const map: Record<string, { name: string; spend: number; count: number }> = {};
    logs.filter(l => l.isUsage).forEach(l => {
      const key = l.vehicleId || 'unknown';
      if (!map[key]) map[key] = { name: l.vehicleName || 'Unknown Vehicle', spend: 0, count: 0 };
      map[key].spend += l.absAmount;
      map[key].count += 1;
    });
    return Object.values(map)
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 8)
      .map(v => ({ ...v, spend: Number(v.spend.toFixed(2)) }));
  }, [logs]);

  // ── Step 5.1 — Spend by highway corridor ──────────────────────────────
  const highwaySpendData = useMemo(() => {
    const map: Record<string, { name: string; spend: number; count: number }> = {};
    logs.filter(l => l.isUsage).forEach(l => {
      const key = l.highway || 'Unknown Highway';
      if (!map[key]) map[key] = { name: key, spend: 0, count: 0 };
      map[key].spend += l.absAmount;
      map[key].count += 1;
    });
    return Object.values(map)
      .sort((a, b) => b.spend - a.spend)
      .map(h => ({ ...h, spend: Number(h.spend.toFixed(2)) }));
  }, [logs]);

  // ── Step 5.3 — Spend by driver (top 5) ────────────────────────────────
  const driverSpendData = useMemo(() => {
    const map: Record<string, { name: string; spend: number; flags: number; count: number }> = {};
    logs.filter(l => l.isUsage).forEach(l => {
      const key = l.driverId || 'unassigned';
      if (!map[key]) map[key] = { name: l.driverDisplayName || 'Unassigned', spend: 0, flags: 0, count: 0 };
      map[key].spend += l.absAmount;
      map[key].count += 1;
      if (l.status === 'Flagged') map[key].flags += 1;
    });
    return Object.values(map)
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 5)
      .map(d => ({ ...d, spend: Number(d.spend.toFixed(2)) }));
  }, [logs]);

  // ── Step 6 — Toll Insights Panel ──────────────────────────────
  const insights = useMemo(() => {
    const usageLogs = logs.filter(l => l.isUsage);

    // --- Highest-cost vehicles (top 3) with flag counts ---
    const vehMap: Record<string, { name: string; spend: number; flags: number; count: number }> = {};
    usageLogs.forEach(l => {
      const key = l.vehicleId || 'unknown';
      if (!vehMap[key]) vehMap[key] = { name: l.vehicleName || 'Unknown Vehicle', spend: 0, flags: 0, count: 0 };
      vehMap[key].spend += l.absAmount;
      vehMap[key].count += 1;
      if (l.status === 'Flagged') vehMap[key].flags += 1;
    });
    const topVehicles = Object.values(vehMap)
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 3);

    // --- Cash overpay candidates (vehicles with >30% cash toll passages) ---
    const vehPayMap: Record<string, { name: string; total: number; cashCount: number; cashSpend: number }> = {};
    usageLogs.forEach(l => {
      const key = l.vehicleId || 'unknown';
      if (!vehPayMap[key]) vehPayMap[key] = { name: l.vehicleName || 'Unknown Vehicle', total: 0, cashCount: 0, cashSpend: 0 };
      vehPayMap[key].total += 1;
      if (l.paymentMethodDisplay === 'Cash') {
        vehPayMap[key].cashCount += 1;
        vehPayMap[key].cashSpend += l.absAmount;
      }
    });
    const cashCandidates = Object.values(vehPayMap)
      .filter(v => v.total >= 3 && (v.cashCount / v.total) > 0.30)
      .map(v => ({
        name: v.name,
        cashRate: Math.round((v.cashCount / v.total) * 100),
        cashSpend: v.cashSpend,
        estimatedSavings: Number((v.cashSpend * TAG_DISCOUNT_RATE).toFixed(2)),
      }))
      .sort((a, b) => b.estimatedSavings - a.estimatedSavings)
      .slice(0, 5);

    // --- Flagged transaction summary by plaza ---
    const flaggedByPlaza: Record<string, number> = {};
    usageLogs.filter(l => l.status === 'Flagged').forEach(l => {
      const key = l.plazaName || 'Unknown Plaza';
      flaggedByPlaza[key] = (flaggedByPlaza[key] || 0) + 1;
    });
    const totalFlagged = Object.values(flaggedByPlaza).reduce((s, c) => s + c, 0);

    return { topVehicles, cashCandidates, flaggedByPlaza, totalFlagged };
  }, [logs]);

  // ── Step 7 — Reconciliation Overview + Parish Spend ───────────
  const reconStatusData = useMemo(() => {
    const map: Record<string, number> = {};
    logs.forEach(l => {
      const key = l.statusDisplay || 'Unknown';
      map[key] = (map[key] || 0) + 1;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value, color: STATUS_COLORS[name] || '#cbd5e1' }))
      .sort((a, b) => b.value - a.value);
  }, [logs]);

  const parishSpendData = useMemo(() => {
    const map: Record<string, { parish: string; spend: number; count: number }> = {};
    logs.filter(l => l.isUsage).forEach(l => {
      const key = l.parish || 'Unknown';
      if (!map[key]) map[key] = { parish: key, spend: 0, count: 0 };
      map[key].spend += l.absAmount;
      map[key].count += 1;
    });
    return Object.values(map)
      .sort((a, b) => b.spend - a.spend)
      .map(p => ({
        ...p,
        spend: Number(p.spend.toFixed(2)),
        avg: p.count > 0 ? Number((p.spend / p.count).toFixed(2)) : 0,
      }));
  }, [logs]);

  // ── Loading state ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        <p className="text-sm text-slate-500">Loading toll analytics...</p>
      </div>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────────
  if (!loading && logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center px-4">
        <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-full">
          <Receipt className="h-10 w-10 text-slate-400" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            No toll data yet
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md">
            Import toll transactions from the Imports page or add them via Toll Logs to see analytics here.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>
    );
  }

  // ── Main analytics view ─────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
            <Receipt className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              Toll Analytics
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Comprehensive analysis of your fleet's toll expenditure
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={refresh}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* ── Step 2.6 — KPI Summary Cards ──────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

        {/* Card 1 — Total Toll Spend (dark gradient hero card) */}
        <Card className="bg-gradient-to-br from-slate-900 to-slate-800 text-white border-0 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <TrendingDown className="w-5 h-5 text-rose-400" />
              <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/30">JMD</Badge>
            </div>
            <p className="text-sm font-medium text-slate-400">Total Toll Spend</p>
            <div className="flex items-baseline gap-2">
              <h3 className="text-3xl font-bold">{formatJMD(summaryStats.totalSpend)}</h3>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {summaryStats.usageCount.toLocaleString()} passage{summaryStats.usageCount !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>

        {/* Card 2 — Average Cost per Passage */}
        <Card>
          <CardContent className="p-6 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Avg Cost per Passage</p>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {formatJMD(summaryStats.avgCostPerPassage, 2)}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Per toll transaction</p>
            </div>
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl">
              <Calculator className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        {/* Card 3 — E-Tag Adoption Rate */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">E-Tag Adoption</p>
              <div className="p-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-lg">
                <CreditCard className="w-5 h-5" />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {summaryStats.eTagRate.toFixed(1)}%
            </h3>
            <div className="mt-3 h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-1000"
                style={{ width: `${Math.min(summaryStats.eTagRate, 100)}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              {summaryStats.eTagCount} of {summaryStats.usageCount} passages via E-Tag
            </p>
          </CardContent>
        </Card>

        {/* Card 4 — Net Position (Top-ups minus Spend) */}
        <Card>
          <CardContent className="p-6 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Net Position</p>
              <h3 className={`text-2xl font-bold ${
                summaryStats.netPosition >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}>
                {summaryStats.netPosition >= 0 ? '+' : ''}{formatJMD(summaryStats.netPosition)}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Top-ups minus spend</p>
            </div>
            <div className={`p-3 rounded-xl ${
              summaryStats.netPosition >= 0
                ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
                : 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400'
            }`}>
              {summaryStats.netPosition >= 0
                ? <TrendingUp className="w-6 h-6" />
                : <TrendingDown className="w-6 h-6" />
              }
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Step 3.3 — Trend & Plaza Charts ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Chart 1 — Monthly Spend Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Monthly Toll Spend</CardTitle>
            <CardDescription>Spend vs top-ups over the last 6 months.</CardDescription>
          </CardHeader>
          <CardContent className="min-h-[300px] w-full relative">
            <div className="w-full">
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={monthlyTrendData}>
                  <defs>
                    <linearGradient id="tollSpendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="tollTopupGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: number, name: string) => [formatJMD(value), name]}
                  />
                  <Area type="monotone" dataKey="spend" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#tollSpendGrad)" name="Toll Spend" />
                  <Area type="monotone" dataKey="topups" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#tollTopupGrad)" name="Top-ups" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Chart 2 — Spend by Plaza */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Spend by Plaza</CardTitle>
            <CardDescription>Top toll plazas ranked by total spend.</CardDescription>
          </CardHeader>
          <CardContent className="min-h-[300px] w-full relative">
            <div className="w-full">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={plazaSpendData} layout="vertical" margin={{ left: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" hide />
                  <YAxis
                    dataKey="name"
                    type="category"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fontWeight: 'bold' }}
                    width={100}
                  />
                  <Tooltip
                    cursor={{ fill: 'transparent' }}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: number, name: string) => [formatJMD(value), name]}
                  />
                  <Bar dataKey="spend" radius={[0, 4, 4, 0]} barSize={20} name="Spend">
                    {plazaSpendData.map((_, index) => (
                      <Cell key={`plaza-cell-${index}`} fill={PLAZA_COLORS[index % PLAZA_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Step 4 — Vehicle Spend & Payment Method ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Chart 3 — Spend by Vehicle */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Spend by Vehicle</CardTitle>
            <CardDescription>Top vehicles ranked by total toll spend.</CardDescription>
          </CardHeader>
          <CardContent className="min-h-[300px] w-full relative">
            <div className="w-full">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={vehicleSpendData} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" hide />
                  <YAxis
                    dataKey="name"
                    type="category"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fontWeight: 'bold' }}
                    width={110}
                  />
                  <Tooltip
                    cursor={{ fill: 'transparent' }}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: number, name: string) => [formatJMD(value), name]}
                  />
                  <Bar dataKey="spend" radius={[0, 4, 4, 0]} barSize={20} name="Toll Spend">
                    {vehicleSpendData.map((_, index) => (
                      <Cell key={`veh-cell-${index}`} fill={PLAZA_COLORS[index % PLAZA_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Chart 4 — Payment Method Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Payment Method Distribution</CardTitle>
            <CardDescription>Breakdown of payment methods used for toll passages.</CardDescription>
          </CardHeader>
          <CardContent className="min-h-[300px] w-full relative">
            <div className="w-full">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={paymentMethodData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {paymentMethodData.map((entry, index) => (
                      <Cell key={`pay-cell-${index}`} fill={PAYMENT_COLORS[entry.name] || PAYMENT_FALLBACK_COLOR} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: number, name: string) => [`${value} passages`, name]}
                  />
                  <Legend
                    iconType="circle"
                    iconSize={10}
                    wrapperStyle={{ fontSize: '12px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Step 5 — Highway, Driver, and Insight Charts ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Chart 5 — Spend by Highway */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Spend by Highway</CardTitle>
            <CardDescription>Top highway corridors ranked by total spend.</CardDescription>
          </CardHeader>
          <CardContent className="min-h-[300px] w-full relative">
            <div className="w-full">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={highwaySpendData} layout="vertical" margin={{ left: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" hide />
                  <YAxis
                    dataKey="name"
                    type="category"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fontWeight: 'bold' }}
                    width={100}
                  />
                  <Tooltip
                    cursor={{ fill: 'transparent' }}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: number, name: string) => [formatJMD(value), name]}
                  />
                  <Bar dataKey="spend" radius={[0, 4, 4, 0]} barSize={20} name="Spend">
                    {highwaySpendData.map((_, index) => (
                      <Cell key={`highway-cell-${index}`} fill={PLAZA_COLORS[index % PLAZA_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Chart 6 — Spend by Driver */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-500" />
              Toll Spend by Driver
            </CardTitle>
            <CardDescription>Top 5 drivers by toll cost. Red bars indicate flagged transactions.</CardDescription>
          </CardHeader>
          <CardContent className="min-h-[300px] w-full relative">
            {driverSpendData.length === 0 ? (
              <div className="flex items-center justify-center h-[300px] text-sm text-slate-400">
                No driver data available.
              </div>
            ) : (
            <div className="w-full">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={driverSpendData} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" hide />
                  <YAxis
                    dataKey="name"
                    type="category"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fontWeight: 'bold' }}
                    width={110}
                  />
                  <Tooltip
                    cursor={{ fill: 'transparent' }}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: number, name: string) => [formatJMD(value), name]}
                  />
                  <Bar dataKey="spend" radius={[0, 4, 4, 0]} barSize={20} name="Toll Spend">
                    {driverSpendData.map((entry, index) => (
                      <Cell key={`driver-cell-${index}`} fill={entry.flags > 0 ? '#f43f5e' : '#6366f1'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Step 6 — Toll Insights Panel ────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
              <Zap className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <CardTitle className="text-lg">Toll Insights</CardTitle>
              <CardDescription>Actionable patterns detected from your toll transaction data.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Insight 1 — Highest Toll Spend */}
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-rose-500" />
                <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Highest Toll Spend</h4>
              </div>
              {insights.topVehicles.length === 0 ? (
                <p className="text-xs text-slate-400">All vehicles within normal spend range.</p>
              ) : (
                <div className="space-y-3">
                  {insights.topVehicles.map((v, i) => (
                    <div key={`insight-veh-${i}`} className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-xs font-bold text-indigo-700 dark:text-indigo-300">
                        {v.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{v.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{v.count} passage{v.count !== 1 ? 's' : ''}</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <Badge variant="secondary" className="text-xs">{formatJMD(v.spend)}</Badge>
                        {v.flags > 0 && (
                          <Badge className="bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 border-rose-200 dark:border-rose-800 text-xs">
                            {v.flags} Flag{v.flags !== 1 ? 's' : ''}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Insight 2 — E-Tag Savings Opportunity */}
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-amber-500" />
                <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">E-Tag Savings Opportunity</h4>
              </div>
              {insights.cashCandidates.length === 0 ? (
                <p className="text-xs text-slate-400">All vehicles are using E-Tag efficiently.</p>
              ) : (
                <div className="space-y-3">
                  {insights.cashCandidates.map((c, i) => (
                    <div key={`insight-cash-${i}`} className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-xs font-bold text-amber-700 dark:text-amber-300">
                        {c.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{c.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{c.cashRate}% cash payments</p>
                      </div>
                      <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 text-xs flex-shrink-0">
                        {formatJMD(c.estimatedSavings)} potential savings
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </CardContent>
      </Card>

      {/* ── Step 7 — Reconciliation Overview + Parish Spend ─────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Chart 7 — Reconciliation Status Donut */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-blue-500" />
              Reconciliation Overview
            </CardTitle>
            <CardDescription>Transaction status distribution across all toll records.</CardDescription>
          </CardHeader>
          <CardContent className="min-h-[300px] w-full relative">
            {reconStatusData.length === 0 ? (
              <div className="flex items-center justify-center h-[300px] text-sm text-slate-400">
                No status data available.
              </div>
            ) : (
              <div className="w-full">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={reconStatusData}
                      cx="50%"
                      cy="45%"
                      innerRadius={55}
                      outerRadius={95}
                      paddingAngle={3}
                      dataKey="value"
                      labelLine={false}
                      label={({ cx, cy }) => (
                        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" className="fill-slate-900 dark:fill-slate-100">
                          <tspan x={cx} dy="-0.4em" fontSize="24" fontWeight="bold">
                            {logs.length}
                          </tspan>
                          <tspan x={cx} dy="1.4em" fontSize="11" fill="#64748b">
                            transactions
                          </tspan>
                        </text>
                      )}
                    >
                      {reconStatusData.map((entry, index) => (
                        <Cell key={`recon-cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      formatter={(value: number, name: string) => [`${value} transaction${value !== 1 ? 's' : ''}`, name]}
                    />
                    <Legend
                      iconType="circle"
                      iconSize={10}
                      wrapperStyle={{ fontSize: '12px' }}
                      formatter={(value: string) => {
                        const item = reconStatusData.find(d => d.name === value);
                        return `${value} (${item?.value || 0})`;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Table — Spend by Parish */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MapPin className="w-5 h-5 text-indigo-500" />
              Spend by Parish
            </CardTitle>
            <CardDescription>Toll expenditure grouped by Jamaican parish.</CardDescription>
          </CardHeader>
          <CardContent>
            {parishSpendData.length === 0 ? (
              <div className="flex items-center justify-center h-[250px] text-sm text-slate-400">
                No parish data available.
              </div>
            ) : (
              <div className="max-h-[300px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Parish</TableHead>
                      <TableHead className="text-xs text-right">Transactions</TableHead>
                      <TableHead className="text-xs text-right">Total Spend</TableHead>
                      <TableHead className="text-xs text-right">Avg / Passage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parishSpendData.map((row, i) => (
                      <TableRow
                        key={`parish-row-${i}`}
                        className={i === 0 ? 'bg-indigo-50 dark:bg-indigo-900/10' : ''}
                      >
                        <TableCell className="text-sm font-medium">{row.parish}</TableCell>
                        <TableCell className="text-sm text-right tabular-nums">{row.count}</TableCell>
                        <TableCell className="text-sm text-right tabular-nums">{formatJMD(row.spend)}</TableCell>
                        <TableCell className="text-sm text-right tabular-nums">{formatJMD(row.avg)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Summary footer */}
      <div className="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 text-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {logs.length} toll transaction{logs.length !== 1 ? 's' : ''} loaded
          {' · '}
          {plazas.length} plaza{plazas.length !== 1 ? 's' : ''}
          {' · '}
          {vehicles.length} vehicle{vehicles.length !== 1 ? 's' : ''}
          {' · '}
          {drivers.length} driver{drivers.length !== 1 ? 's' : ''}
          {insights.totalFlagged > 0 && (
            <>
              {' · '}
              <span className="text-rose-500 font-medium">{insights.totalFlagged} flagged</span>
            </>
          )}
        </p>
      </div>
    </div>
  );
}