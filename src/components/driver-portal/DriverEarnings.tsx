import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { BarChart, Bar, XAxis, Tooltip } from 'recharts';
import { SafeResponsiveContainer as ResponsiveContainer } from '../ui/SafeResponsiveContainer';
import { 
  DollarSign, 
  TrendingUp, 
  ChevronRight, 
  Download, 
  Loader2,
  Calendar as CalendarIcon,
  Trophy
} from "lucide-react";
import { useAuth } from '../auth/AuthContext';
import { useCurrentDriver } from '../../hooks/useCurrentDriver';
import { projectId, publicAnonKey } from '../../utils/supabase/info';
import { Trip, TierConfig, FinancialTransaction } from '../../types/data';
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar } from "../ui/calendar";
import { cn } from "../ui/utils";
import { DateRange } from "react-day-picker";
import { startOfDay, endOfDay, format, subDays, differenceInDays } from "date-fns";
import { tierService } from '../../services/tierService';
import { TierCalculations } from '../../utils/tierCalculations';
import { api } from '../../services/api';

export function DriverEarnings() {
  const { user } = useAuth();
  const { driverRecord, loading: driverLoading } = useCurrentDriver();
  const [loading, setLoading] = useState(true);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [filteredTrips, setFilteredTrips] = useState<Trip[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<FinancialTransaction[]>([]);
  const [date, setDate] = useState<DateRange | undefined>(undefined);
  const [weeklyData, setWeeklyData] = useState<{ day: string; amount: number }[]>([]);
  const [stats, setStats] = useState({
    totalBalance: 0,
    tripFares: 0,
    tips: 0,
    promotions: 0,
    tolls: 0,
    cashCollected: 0,
    reimbursements: 0,
    expenses: 0,
    trend: null as number | null
  });

  const [tierState, setTierState] = useState<{
    current: TierConfig | null;
    cumulativeBefore: number;
    thisWeek: number;
    newCumulative: number;
    projectedPayout: number;
  }>({
    current: null,
    cumulativeBefore: 0,
    thisWeek: 0,
    newCumulative: 0,
    projectedPayout: 0
  });

  useEffect(() => {
    if (!user || driverLoading) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        const headers = {
             'Content-Type': 'application/json',
             'Authorization': `Bearer ${publicAnonKey}`
        };

        const [tripsRes, txData] = await Promise.all([
             fetch(`https://${projectId}.supabase.co/functions/v1/make-server-37f42386/trips`, { headers }),
             api.getTransactions()
        ]);

        if (tripsRes.ok) {
            const allTrips: Trip[] = await tripsRes.json();
            const myTrips = allTrips.filter(t => 
                t.driverId === user.id || 
                (driverRecord?.id && t.driverId === driverRecord.id) ||
                (driverRecord?.driverId && t.driverId === driverRecord.driverId)
            );
            setTrips(myTrips);
            setFilteredTrips(myTrips);
        }

        if (txData) {
            const myTx = txData.filter((t: FinancialTransaction) => 
                t.driverId === user.id || 
                (driverRecord?.id && t.driverId === driverRecord.id) || 
                (driverRecord?.driverId && t.driverId === driverRecord.driverId)
            );
            setTransactions(myTx);
            setFilteredTransactions(myTx);
        }

      } catch (error) {
        console.error("Error fetching earnings:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user?.id, driverRecord?.id, driverLoading]);

  // Handle Date Filter
  useEffect(() => {
    let filtered = trips;
    let filteredTx = transactions;

    // Calculate Tier Info based on the "Filtered" period representing "This Week/Period"
    calculateTierInfo(trips, filtered);

    if (date?.from) {
        const from = startOfDay(date.from);
        const to = date.to ? endOfDay(date.to) : endOfDay(date.from);
        
        filtered = filtered.filter(t => {
            const tripDate = new Date(t.date);
            return tripDate >= from && tripDate <= to;
        });
        
        filteredTx = filteredTx.filter(t => {
            const txDate = new Date(t.date);
            return txDate >= from && txDate <= to;
        });
    }

    setFilteredTrips(filtered);
    setFilteredTransactions(filteredTx);
    processEarnings(filtered, filteredTx);
  }, [date, trips, transactions]);

  const calculateTierInfo = async (allTrips: Trip[], currentPeriodTrips: Trip[]) => {
      // 1. Total Cumulative Earnings (All Time)
      const totalCumulative = allTrips.reduce((sum, t) => sum + (t.amount || 0), 0);
      
      // 2. Earnings for the displayed period
      const periodEarnings = currentPeriodTrips.reduce((sum, t) => sum + (t.amount || 0), 0);
      
      // 3. Earnings BEFORE this period
      const beforeEarnings = totalCumulative - periodEarnings;
      
      // 4. Get Tier
      const tiers = await tierService.getTiers();
      const currentTier = TierCalculations.getTierForEarnings(totalCumulative, tiers);
      
      // 5. Calculate Payout (Simplistic: Period Earnings * Share %)
      // Note: In reality, if they cross a threshold mid-week, the split might change.
      // For Phase 2, we use the CURRENT tier for the whole calculation or just estimation.
      const payout = periodEarnings * (currentTier.sharePercentage / 100);

      setTierState({
          current: currentTier,
          cumulativeBefore: beforeEarnings,
          thisWeek: periodEarnings,
          newCumulative: totalCumulative,
          projectedPayout: payout
      });
  };

  const processEarnings = (currentTrips: Trip[], currentTx: FinancialTransaction[]) => {
      // 1. Calculate Stats
      const tripNet = currentTrips.reduce((sum, t) => sum + (t.netPayout || t.amount || 0), 0);
      const fares = currentTrips.reduce((sum, t) => sum + (t.amount || 0), 0);
      
      const tips = currentTrips.reduce((sum, t) => sum + (t.fareBreakdown?.tips || 0), 0);
      const tolls = currentTrips.reduce((sum, t) => sum + (t.tollCharges || 0), 0);
      const promotions = currentTrips.reduce((sum, t) => sum + (t.fareBreakdown?.surge || 0), 0);
      const cash = currentTrips.reduce((sum, t) => sum + (t.cashCollected || 0), 0);

      // Financial Transactions: 
      // Reimbursements (Adjustment/Revenue with positive amount)
      // Expenses (Expense with negative amount - usually doesn't impact "Payout Balance" unless paid by wallet)
      // For now, let's treat "Reimbursements" as pure additions to Payout.
      const reimbursements = currentTx
        .filter(t => (t.type === 'Adjustment' || t.category === 'Fuel Reimbursement') && t.amount > 0)
        .reduce((sum, t) => sum + t.amount, 0);

      const expenseTotal = currentTx
        .filter(t => t.type === 'Expense' && t.amount < 0)
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
      
      const totalBalance = tripNet + reimbursements;
      
      let trendValue: number | null = null;
      
      if (date?.from && date?.to) {
          const duration = differenceInDays(date.to, date.from) + 1;
          const prevFrom = startOfDay(subDays(date.from, duration));
          const prevTo = endOfDay(subDays(date.to, duration));
          
          const prevTrips = trips.filter(t => {
              const d = new Date(t.date);
              return d >= prevFrom && d <= prevTo;
          });
          
          const prevFares = prevTrips.reduce((sum, t) => sum + (t.amount || 0), 0);
          
          if (prevFares > 0) {
              trendValue = ((fares - prevFares) / prevFares) * 100;
          } else if (fares > 0) {
              trendValue = 100;
          } else {
              trendValue = 0;
          }
      }

      setStats({
          totalBalance: totalBalance,
          tripFares: fares,
          tips: tips, 
          promotions: promotions,
          tolls: tolls,
          cashCollected: cash,
          reimbursements: reimbursements,
          expenses: expenseTotal,
          trend: trendValue
      });

      // 2. Weekly Chart Data (Dynamic based on filter?)
      // If a date range is selected, the chart should probably just show the data for that period,
      // but for simplicity and to match the label "Weekly Summary", we might want to keep it as
      // "Last 7 Days" OR adapt it. 
      // The prompt asks for a calendar. Usually if I pick a date, the whole dashboard reflects that date.
      
      // Let's make the chart reflect the filtered data.
      // If range is large, maybe group by week? If small, group by day?
      // For now, let's stick to the existing logic but using the filtered trips if they exist within the window,
      // OR better: Just map the filtered trips to days.
      
      // EXISTING LOGIC was: fixed "This Week" (Mon-Sun) or "Last 7 Days".
      // Let's adapt: Group filtered trips by day.
      
      const dayMap = new Map<string, number>();
      
      currentTrips.forEach(t => {
          const d = new Date(t.date);
          const key = d.toLocaleDateString('en-US', { weekday: 'short' }); // Mon, Tue...
          // Warning: This simple key merges "Mon" from different weeks. 
          // If the user selects a month, all Mondays are summed. This might be confusing.
          // BUT, the chart XAxis uses "Mon, Tue...".
          
          // Better approach for the chart:
          // If no date filter -> Show current week (Mon-Sun).
          // If date filter -> Show that period grouped by day (if <= 7 days) or simply aggregated?
          
          // Let's stick to the previous "Current Week" logic for the DEFAULT view,
          // but if filtered, we might just show the aggregation of the filtered result.
          
          // Actually, let's stick to "Mon-Sun" buckets for simplicity as per the UI screenshot.
          // It looks like a standard weekly view.
      });

      // Let's reconstruct the original logic but apply it to the filtered dataset?
      // No, if I filter for "Last Month", a 7-day chart doesn't make sense.
      // However, the prompt just says "add a calendar".
      // I will keep the chart as "Weekly Summary" relative to the *end date* of the selection, 
      // or just the standard "Current Week" if no selection.
      
      // Let's do this:
      // If date is selected, use that range for the "Total Earnings" and "Breakdown".
      // For the Chart, if the range is small (<= 7 days), show those days.
      // If not, maybe just show the last 7 days of the selection?
      
      // Let's stick to the original implementation for the chart which was "This Week" (Mon-Sun),
      // BUT calculated from the filtered trips? No, that would hide trips outside this week.
      
      // New Strategy:
      // 1. "Total Earnings" and "Breakdown" -> Strict reflection of `filteredTrips`.
      // 2. "Weekly Summary" Chart -> Always shows the days involved in `filteredTrips`?
      //    Or just keeps showing the current week?
      //    The user provided an image of "Earnings" with "Weekly Summary".
      //    Usually "Weekly Summary" implies a specific week.
      
      // Let's default to:
      // If no filter -> Show Current Week (Mon-Sun) trips.
      // Wait, the previous code filtered `trips` by `monday`...`sunday` loop.
      
      // Let's rewrite the chart logic to be dynamic.
      // Create a map of Date -> Amount.
      // If range <= 7 days, show each day.
      // If range > 7 days, maybe show start-end or just first 7 days?
      // Let's simplify: The chart always shows "Mon" through "Sun" of the *current week* 
      // UNLESS a filter is applied, in which case it attempts to plot the data provided.
      
      // Actually, looking at the previous code:
      // It generated `chartData` for the CURRENT WEEK (Mon-Sun) regardless of the data.
      // `const dailySum = trips.filter(...)` -> This `trips` was ALL trips.
      
      // I will preserve this behavior for the chart (showing current week context),
      // UNLESS the user explicitly filters.
      // If user filters, I should probably update the chart to show that data distribution.
      
      // Let's stick to the "Current Week" logic for the chart for now to minimize regression,
      // but ensure "Total Earnings" respects the filter.
      // Actually, if I filter for "Last Month", showing "Current Week" chart is weird.
      
      // Let's make the chart data reflect the `currentTrips`.
      // We will create buckets for Mon-Sun based on the trips found.
      // If the trips span multiple weeks, this bar chart (Mon-Sun) will sum up all Mondays, etc.
      // This is a common pattern in simple dashboards.
      
      const chartData = [];
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const daySums = { 'Mon': 0, 'Tue': 0, 'Wed': 0, 'Thu': 0, 'Fri': 0, 'Sat': 0, 'Sun': 0 };

      currentTrips.forEach(t => {
          const d = new Date(t.date);
          const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
          if (daySums[dayName as keyof typeof daySums] !== undefined) {
              daySums[dayName as keyof typeof daySums] += (t.netPayout || 0);
          }
      });

      // Transform to array
      days.forEach(day => {
          chartData.push({
              day,
              amount: daySums[day as keyof typeof daySums]
          });
      });
      
      setWeeklyData(chartData);
  };

  if (loading) {
      return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Earnings</h2>
        <div className="flex items-center gap-2">
           <Popover>
              <PopoverTrigger asChild>
                  <Button 
                      variant="outline" 
                      className={cn(
                          "h-9 w-9 p-0 shrink-0", 
                          date?.from && "bg-indigo-50 border-indigo-200 text-indigo-600 hover:bg-indigo-100"
                      )}
                  >
                      <CalendarIcon className="h-4 w-4" />
                  </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                      mode="range"
                      defaultMonth={date?.from}
                      selected={date}
                      onSelect={setDate}
                      initialFocus
                      numberOfMonths={1}
                  />
                  {date?.from && (
                      <div className="p-2 border-t border-slate-100">
                          <Button 
                              variant="ghost" 
                              className="w-full text-xs h-8 text-slate-500 hover:text-slate-900"
                              onClick={() => setDate(undefined)}
                          >
                              Clear Filter
                          </Button>
                      </div>
                  )}
              </PopoverContent>
           </Popover>
           <Button variant="outline" size="sm">
             <Download className="h-4 w-4 mr-2" />
             Statement
           </Button>
        </div>
      </div>

      <Card className="bg-slate-900 text-white border-slate-800">
         <CardContent className="p-6">
            <span className="text-slate-400 text-sm">
                {date?.from ? `Total Earnings (${format(date.from, 'MMM d')}${date.to ? ` - ${format(date.to, 'MMM d')}` : ''})` : 'Total Earnings (All Time)'}
            </span>
            <div className="flex items-end justify-between mt-1 mb-6">
               <h1 className="text-4xl font-bold">${stats.tripFares.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h1>
               {stats.trend !== null && (
                   <div className={cn("flex items-center text-sm font-medium mb-1", stats.trend >= 0 ? "text-emerald-400" : "text-rose-400")}>
                      <TrendingUp className={cn("h-4 w-4 mr-1", stats.trend < 0 && "rotate-180")} />
                      {stats.trend > 0 ? '+' : ''}{stats.trend.toFixed(1)}%
                   </div>
               )}
            </div>
         </CardContent>
      </Card>

      <Card>
         <CardHeader>
            <CardTitle className="text-base">Weekly Summary</CardTitle>
         </CardHeader>
         <CardContent>
            <div className="h-[200px] w-full">
               <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyData}>
                     <XAxis 
                        dataKey="day" 
                        fontSize={12} 
                        tickLine={false} 
                        axisLine={false}
                        stroke="#888888"
                     />
                     <Tooltip 
                        cursor={{ fill: 'transparent' }}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        formatter={(value: number) => [`$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Earnings']}
                     />
                     <Bar dataKey="amount" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                  </BarChart>
               </ResponsiveContainer>
            </div>
         </CardContent>
      </Card>

      {tierState.current && (
         <Card className="border-indigo-100 bg-indigo-50/50">
             <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-indigo-600" />
                    <CardTitle className="text-base text-indigo-900">Tier Calculation</CardTitle>
                </div>
                <CardDescription>
                    Payout based on {tierState.current.name} Tier ({tierState.current.sharePercentage}%)
                </CardDescription>
             </CardHeader>
             <CardContent className="space-y-3">
                 <div className="flex justify-between text-sm">
                     <span className="text-slate-500">Cumulative (Before)</span>
                     <span className="font-mono text-slate-700">${tierState.cumulativeBefore.toLocaleString()}</span>
                 </div>
                 <div className="flex justify-between text-sm">
                     <span className="text-slate-500">This Period</span>
                     <span className="font-mono text-slate-700">+ ${tierState.thisWeek.toLocaleString()}</span>
                 </div>
                 <div className="h-px bg-indigo-200" />
                 <div className="flex justify-between text-sm font-medium">
                     <span className="text-indigo-900">New Cumulative</span>
                     <span className="font-mono text-indigo-900">${tierState.newCumulative.toLocaleString()}</span>
                 </div>
                 <div className="mt-4 pt-3 border-t border-indigo-200 flex justify-between items-center">
                     <span className="font-semibold text-indigo-900">Estimated Payout</span>
                     <span className="text-xl font-bold text-indigo-700">
                         ${tierState.projectedPayout.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                     </span>
                 </div>
             </CardContent>
         </Card>
      )}

      <Card>
         <CardHeader>
            <CardTitle className="text-base">Breakdown</CardTitle>
         </CardHeader>
         <CardContent className="space-y-4">
            <Row label="Gross Fares" value={`$${stats.tripFares.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
            <Row label="Tips" value={`$${stats.tips.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
            <Row label="Surge" value={`$${stats.promotions.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
            <Row label="Tolls & Fees" value={`$${stats.tolls.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
            <Row label="Reimbursements" value={`$${stats.reimbursements.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
            <Row label="Cash Collected" value={`$${stats.cashCollected.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
            <div className="h-px bg-slate-100 dark:bg-slate-800 my-2" />
            <Row label="Net Earnings" value={`$${stats.totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} bold />
         </CardContent>
      </Card>

      {/* Placeholder for payouts */}
      <div className="space-y-2">
         <h3 className="font-semibold text-slate-900 dark:text-slate-100 px-1">Recent Payouts</h3>
         <div className="bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
             <div className="p-4 text-center text-sm text-slate-500">
                 No payout history available yet.
             </div>
         </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold = false }: { label: string, value: string, bold?: boolean }) {
   return (
      <div className="flex justify-between items-center">
         <span className={`text-sm ${bold ? 'font-semibold text-slate-900' : 'text-slate-500'}`}>{label}</span>
         <span className={`text-sm ${bold ? 'font-bold text-slate-900' : 'text-slate-900'}`}>{value}</span>
      </div>
   )
}
