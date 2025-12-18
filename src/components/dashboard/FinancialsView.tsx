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
import { Trip, Budget } from '../../types/data';
import { api } from '../../services/api';
import { DollarSign, TrendingUp, Wallet, CreditCard, PiggyBank, Receipt, Loader2 } from "lucide-react";

interface FinancialsViewProps {
  trips: Trip[];
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

export function FinancialsView({ trips }: FinancialsViewProps) {
  const [budgets, setBudgets] = React.useState<Budget[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
      const loadBudgets = async () => {
          try {
              const data = await api.getBudgets();
              if (data && data.length > 0) {
                  setBudgets(data);
              } else {
                  // Initialize default budgets if none exist
                  const defaults = [
                      { month: '2025-12', category: 'Fuel', limit: 500 },
                      { month: '2025-12', category: 'Maintenance', limit: 300 },
                      { month: '2025-12', category: 'Insurance', limit: 80 },
                      { month: '2025-12', category: 'Fleet Cleaning', limit: 120 }
                  ];
                  // Save them
                  for (const d of defaults) {
                      await api.saveBudget(d);
                  }
                  // Fetch again (simplified)
                  setBudgets(await api.getBudgets());
              }
          } catch (e) {
              console.error("Failed to load budgets", e);
          } finally {
              setLoading(false);
          }
      };
      loadBudgets();
  }, []);

  // Financial Metrics Calculation
  const metrics = useMemo(() => {
    let totalRevenue = 0;
    let totalCash = 0;
    let totalRefunds = 0;
    let totalTips = 0;
    
    // Revenue Breakdown by Type
    const revenueByType = {
        'Fare': 0,
        'Tip': 0,
        'Promotion': 0,
        'Other': 0
    };

    const completedTrips = trips.filter(t => t.status === 'Completed' || t.transactionType);
    
    completedTrips.forEach(t => {
        const amt = t.amount || 0;
        
        // 1. Total Revenue
        if (amt > 0) totalRevenue += amt;
        
        // 2. Cash Collected
        if (t.cashCollected) totalCash += t.cashCollected;
        
        // 3. Refunds/Expenses (Negative amounts usually)
        if (amt < 0) totalRefunds += Math.abs(amt);

        // 4. Breakdown
        const type = t.transactionType || 'Fare'; // Default to Fare
        if (type.includes('Tip')) {
            revenueByType['Tip'] += amt;
            totalTips += amt;
        } else if (type.includes('Promo') || type.includes('Incentive')) {
            revenueByType['Promotion'] += amt;
        } else if (type.includes('Fare') || type === 'Completed Trip') {
            revenueByType['Fare'] += amt;
        } else {
            revenueByType['Other'] += amt;
        }
    });

    const avgRevenuePerTrip = completedTrips.length > 0 ? totalRevenue / completedTrips.length : 0;
    const expenseRatio = totalRevenue > 0 ? (totalRefunds / totalRevenue) * 100 : 0;
    const cashPercentage = totalRevenue > 0 ? (totalCash / totalRevenue) * 100 : 0;

    // Platform Grouping (Keep existing logic)
    const platformStats: Record<string, { revenue: number, count: number }> = {};
    trips.forEach(t => {
      if (t.status !== 'Completed') return;
      if (!platformStats[t.platform]) platformStats[t.platform] = { revenue: 0, count: 0 };
      platformStats[t.platform].revenue += t.amount;
      platformStats[t.platform].count += 1;
    });
    
    // Find best platform
    let bestPlatform = 'N/A';
    let maxRev = 0;
    Object.entries(platformStats).forEach(([p, stats]) => {
      if (stats.revenue > maxRev) {
        maxRev = stats.revenue;
        bestPlatform = p;
      }
    });

    const pieData = Object.entries(revenueByType)
        .filter(([_, val]) => val > 0)
        .map(([name, value]) => ({ name, value }));

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
      pieData
    };
  }, [trips]);

  // Budget Analysis Calculation
  const budgetAnalysis = useMemo(() => {
      const actuals: Record<string, number> = {};
      
      trips.forEach(t => {
          // Check for expenses (negative amount)
          if (t.amount < 0) {
              const note = (t.notes || t.transactionType || '').toLowerCase();
              const amt = Math.abs(t.amount);
              
              if (note.includes('fuel') || note.includes('gas')) {
                  actuals['Fuel'] = (actuals['Fuel'] || 0) + amt;
              } else if (note.includes('maint') || note.includes('repair') || note.includes('service')) {
                  actuals['Maintenance'] = (actuals['Maintenance'] || 0) + amt;
              } else if (note.includes('insur')) {
                  actuals['Insurance'] = (actuals['Insurance'] || 0) + amt;
              } else if (note.includes('clean') || note.includes('wash')) {
                  actuals['Fleet Cleaning'] = (actuals['Fleet Cleaning'] || 0) + amt;
              }
          }
      });

      let totalVariance = 0;

      const rows = budgets.map(b => {
          const actual = actuals[b.category] || 0;
          const variance = b.limit - actual;
          totalVariance += variance;
          
          return {
              ...b,
              actual,
              variance
          };
      });

      return { rows, totalVariance };
  }, [trips, budgets]);

  // Daily Revenue & Trip Count Data for Composed Chart
  const chartData = useMemo(() => {
    const dailyMap = new Map<string, { date: string, revenue: number, trips: number }>();
    
    // Sort trips chronologically
    const sorted = [...trips].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    sorted.forEach(t => {
      if (t.status !== 'Completed') return;
      const dateStr = new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
      if (!dailyMap.has(dateStr)) {
        dailyMap.set(dateStr, { date: dateStr, revenue: 0, trips: 0 });
      }
      const entry = dailyMap.get(dateStr)!;
      entry.revenue += t.amount;
      entry.trips += 1;
    });

    // Take last 14 days if available, or all
    return Array.from(dailyMap.values()).slice(-14);
  }, [trips]);

  return (
    <div className="space-y-6">
      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard 
          title="Total Earnings"
          value={`$${metrics.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
          icon={<DollarSign className="h-4 w-4 text-emerald-600" />}
          subtext="Gross Revenue"
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
        {/* Monthly Budget vs Actual (Phase 7.2) */}
        <Card className="lg:col-span-1">
            <CardHeader>
                <CardTitle className="text-lg">Monthly Budget vs Actual</CardTitle>
                <CardDescription>Target vs Realized expenses.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                        </div>
                    ) : budgetAnalysis.rows.length > 0 ? (
                        <>
                            {budgetAnalysis.rows.map(row => (
                                <BudgetRow 
                                    key={row.id} 
                                    label={row.category} 
                                    budget={row.limit} 
                                    actual={row.actual} 
                                />
                            ))}
                            
                            <div className="pt-4 border-t mt-4">
                                <div className="flex justify-between items-center font-bold">
                                    <span>Total Variance</span>
                                    <span className={budgetAnalysis.totalVariance >= 0 ? "text-emerald-600" : "text-rose-600"}>
                                        {budgetAnalysis.totalVariance >= 0 ? '+' : '-'}${Math.abs(budgetAnalysis.totalVariance).toFixed(2)}
                                    </span>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="text-center text-slate-500 py-8">No budget data available</div>
                    )}
                </div>
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

function MetricCard({ title, value, icon, subtext }: { title: string, value: string, icon: React.ReactNode, subtext: string }) {
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
      </CardContent>
    </Card>
  );
}

function BudgetRow({ label, budget, actual }: { label: string, budget: number, actual: number }) {
    const variance = budget - actual;
    const isOver = variance < 0;
    
    return (
        <div className="space-y-1">
            <div className="flex justify-between text-sm">
                <span className="font-medium text-slate-700">{label}</span>
                <span className={isOver ? "text-rose-600 font-bold" : "text-emerald-600 font-bold"}>
                    {isOver ? '-' : '+'}${Math.abs(variance).toFixed(2)}
                </span>
            </div>
            <div className="flex justify-between text-xs text-slate-500">
                <span>Budget: ${budget}</span>
                <span>Actual: ${actual}</span>
            </div>
            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <div 
                    className={`h-full ${isOver ? 'bg-rose-500' : 'bg-emerald-500'}`} 
                    style={{ width: `${Math.min((actual/budget)*100, 100)}%` }}
                ></div>
            </div>
        </div>
    )
}