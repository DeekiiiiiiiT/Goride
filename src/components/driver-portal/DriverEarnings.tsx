// cache-bust: force recompile — 2026-02-10
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { 
  DollarSign, 
  TrendingUp, 
  ChevronRight, 
  ChevronDown,
  Download, 
  Loader2,
  Calendar as CalendarIcon,
  Trophy,
  Wallet,
  Info
} from "lucide-react";
import { useAuth } from '../auth/AuthContext';
import { useCurrentDriver } from '../../hooks/useCurrentDriver';
import { projectId, publicAnonKey } from '../../utils/supabase/info';
import { Trip, TierConfig, FinancialTransaction, DriverMetrics } from '../../types/data';
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";
import { Calendar } from "../ui/calendar";
import { cn } from "../ui/utils";
import { DateRange } from "react-day-picker";
import { startOfDay, endOfDay, format, subDays, differenceInDays } from "date-fns";
import { tierService } from '../../services/tierService';
import { TierCalculations } from '../../utils/tierCalculations';
import { api } from '../../services/api';
import { WeeklySettlementView } from '../drivers/WeeklySettlementView';
import { TransactionLedgerView } from '../drivers/TransactionLedgerView';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../ui/sheet";
import { DriverHistory } from './DriverHistory';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
import { MonthlyPerformance } from '../../types/data';

export function DriverEarnings() {
  const { user } = useAuth();
  const { driverRecord, loading: driverLoading } = useCurrentDriver();
  const [loading, setLoading] = useState(true);
  const [cashWalletView, setCashWalletView] = useState<'settlements' | 'ledger'>('settlements');
  const [trips, setTrips] = useState<Trip[]>([]);
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [metrics, setMetrics] = useState<DriverMetrics[]>([]);
  const [filteredTrips, setFilteredTrips] = useState<Trip[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<FinancialTransaction[]>([]);
  const [date, setDate] = useState<DateRange | undefined>(undefined);
  const [tiers, setTiers] = useState<TierConfig[]>([]);
  const [history, setHistory] = useState<MonthlyPerformance[]>([]);
  const [stats, setStats] = useState({
    totalBalance: 0,
    tripFares: 0,
    tips: 0,
    promotions: 0,
    tolls: 0,
    cashCollected: 0,
    reimbursements: 0,
    pendingReimbursements: 0,
    reimbursementBreakdown: [] as { label: string; amount: number }[],
    expenses: 0,
    expenseDetailed: {
      tolls: 0,
      fuel: {
        total: 0,
        breakdown: [] as { label: string; amount: number }[]
      },
      other: 0,
      total: 0
    },
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

        // Helper to fetch trips specifically for this driver (User ID + Legacy ID)
        const fetchDriverTrips = async () => {
             const limit = 1000; // Increase limit to ensure full month coverage for Tier Calculation
             const p1 = api.getTripsFiltered({ driverId: user.id, limit }).then(r => r.data).catch(() => []);
             const promises = [p1];
             
             // If legacy ID exists and is different
             if (driverRecord?.driverId && driverRecord.driverId !== user.id) {
                 promises.push(api.getTripsFiltered({ driverId: driverRecord.driverId, limit }).then(r => r.data).catch(() => []));
             }
             
             const results = await Promise.all(promises);
             const combined = results.flat();
             // Dedup by ID
             return Array.from(new Map(combined.map(t => [t.id, t])).values());
        };

        const [myTrips, txData, metricsData, tiersData] = await Promise.all([
             fetchDriverTrips(),
             // Pass all relevant IDs
             api.getTransactions([user?.id, driverRecord?.id, driverRecord?.driverId].filter(Boolean) as string[]),
             api.getDriverMetrics(),
             tierService.getTiers()
        ]);
        
        if (tiersData) setTiers(tiersData);

        if (myTrips) {
            setTrips(myTrips);
            setFilteredTrips(myTrips);
        }

        if (txData) {
            // Server-side filtered by user.id
            const myTx = txData;
            setTransactions(myTx);
            setFilteredTransactions(myTx);
        }

        if (metricsData) {
            // Filter metrics for this driver
            // Assuming metrics have driverId which links to... something.
            // Usually internal ID or UUID.
            const myMetrics = metricsData.filter((m: any) => 
                 m.driverId === user.id || 
                 (driverRecord?.id && m.driverId === driverRecord.id) ||
                 (driverRecord?.driverId && m.driverId === driverRecord.driverId)
            );
            setMetrics(myMetrics);
        }

      } catch (error) {
        console.error("Error fetching earnings:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user?.id, driverRecord?.id, driverLoading]);

  useEffect(() => {
    if (trips.length > 0 && tiers.length > 0) {
        const h = TierCalculations.getMonthlyHistory(trips, tiers);
        setHistory(h);
    }
  }, [trips, tiers]);

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

  // Phase 5: Net Payout Calculation
  // We start with the Projected Payout (Tier Share of Fares)
  // + Reimbursements (Tolls + Adjustments)
  // - Expenses (Tolls + Fuel + Other)
  const netPayout = tierState.projectedPayout + stats.reimbursements - stats.expenses;

  // Calculate Net Outstanding (Lifetime)
  const netOutstanding = React.useMemo(() => {
      let totalCash = trips.reduce((sum, t) => sum + (Math.abs(t.cashCollected || 0)), 0);
      
      const latestMetric = [...metrics]
          .sort((a, b) => new Date(b.periodEnd).getTime() - new Date(a.periodEnd).getTime())
          .find(m => m.cashCollected !== undefined);
          
      if (latestMetric?.cashCollected && latestMetric.cashCollected > totalCash) {
          totalCash = latestMetric.cashCollected;
      }

      const totalTolls = trips.reduce((sum, t) => {
          if (t.tollCharges && !t.cashCollected) return sum + t.tollCharges;
          return sum;
      }, 0);

      const totalPaid = transactions.reduce((sum, t) => sum + (t.amount || 0), 0);
      
      return (totalCash - totalPaid) + totalTolls;
  }, [trips, transactions, metrics]);

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
      
      const txReimbursements = currentTx.filter(t => {
          if (t.amount <= 0) return false;
          
          // Phase 4: Reimbursement Workflow - Only show if Approved
          if (t.type === 'Reimbursement') {
              return t.status === 'Approved';
          }
          
          // Legacy or other adjustments
          if (t.type === 'Adjustment') {
              return true;
          }
          
          // Fallback based on category string
          if (t.category === 'Fuel Reimbursement' || (t.category && typeof t.category === 'string' && t.category.includes('Reimbursement'))) {
              return t.status !== 'Pending';
          }
          
          return false;
      });

      const reimbursementBreakdown: { label: string; amount: number }[] = [];
      
      // Add Tolls to breakdown if > 0 (as requested by user to be under Reimbursements)
      if (tolls > 0) {
          reimbursementBreakdown.push({ label: 'Tolls', amount: tolls });
      }

      // Group Transactions
      const txBreakdown: Record<string, number> = {};
      txReimbursements.forEach(t => {
          const label = typeof t.category === 'string' ? t.category : (t.description || 'Other Adjustment');
          txBreakdown[label] = (txBreakdown[label] || 0) + t.amount;
      });
      
      Object.entries(txBreakdown).forEach(([label, amount]) => {
          reimbursementBreakdown.push({ label, amount });
      });

      const txReimbursementTotal = txReimbursements.reduce((sum, t) => sum + t.amount, 0);
      const displayReimbursementsTotal = tolls + txReimbursementTotal;

      // Calculate Pending Reimbursements (for display only)
      const pendingReimbursementsTx = currentTx.filter(t => 
          (t.type === 'Reimbursement' || t.category === 'Fuel Reimbursement') && 
          t.amount > 0 && 
          t.status === 'Pending'
      );
      const pendingReimbursementsTotal = pendingReimbursementsTx.reduce((sum, t) => sum + t.amount, 0);

      // Phase 1: Expense Categorization Logic
      const expenseTx = currentTx.filter(t => t.type === 'Expense');

      // 1. Tolls (Driver Charged - Expenses)
      const tollExpensesTx = expenseTx.filter(t => t.category === 'Tolls' || t.category === 'Toll Charge');
      const tollExpensesTotal = tollExpensesTx.reduce((sum, t) => sum + Math.abs(t.amount), 0);

      // 2. Fuel Expenses
      const fuelExpensesTx = expenseTx.filter(t => t.category === 'Fuel');
      const fuelExpensesTotal = fuelExpensesTx.reduce((sum, t) => sum + Math.abs(t.amount), 0);

      // 2.1 Fuel Breakdown by subType or description
      const fuelBreakdownMap: Record<string, number> = {};
      fuelExpensesTx.forEach(t => {
          const label = t.subType || t.description || 'Fuel';
          fuelBreakdownMap[label] = (fuelBreakdownMap[label] || 0) + Math.abs(t.amount);
      });
      const fuelBreakdown = Object.entries(fuelBreakdownMap).map(([label, amount]) => ({ label, amount }));

      // 3. Other Expenses
      const otherExpensesTx = expenseTx.filter(t => 
          t.category !== 'Tolls' && 
          t.category !== 'Toll Charge' && 
          t.category !== 'Fuel'
      );
      const otherExpensesTotal = otherExpensesTx.reduce((sum, t) => sum + Math.abs(t.amount), 0);
      
      const totalExpenses = tollExpensesTotal + fuelExpensesTotal + otherExpensesTotal;
      
      const totalBalance = tripNet + txReimbursementTotal - totalExpenses; // Deduct expenses from payout balance
      
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
          reimbursements: displayReimbursementsTotal,
          pendingReimbursements: pendingReimbursementsTotal,
          reimbursementBreakdown: reimbursementBreakdown,
          expenses: totalExpenses,
          expenseDetailed: {
              tolls: tollExpensesTotal,
              fuel: {
                  total: fuelExpensesTotal,
                  breakdown: fuelBreakdown
              },
              other: otherExpensesTotal,
              total: totalExpenses
          },
          trend: trendValue
      });

  };

  const paymentTransactions = React.useMemo(() => transactions.filter(t => {
      // Strict Safety: Never show Tag Balance operations in Payment Log
      if (t.paymentMethod === 'Tag Balance') return false;
      if (t.description?.toLowerCase().includes('top-up')) return false;

      // Exclude tolls
      const isToll = t.category === 'Toll Usage' || t.category === 'Toll' || t.category === 'Tolls';
      if (isToll) return false;

      // Exclude fuel
      const isFuel = (t.category || '').toLowerCase().includes('fuel') || (t.description || '').toLowerCase().includes('fuel');
      if (isFuel) return false;

      // Strict Payment Logic: Focus on Cash Collections (Money from Driver)
      const isPayment = t.category === 'Cash Collection' || t.type === 'Payment_Received';
      return isPayment && t.amount > 0;
  }), [transactions]);

  if (loading) {
      return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>;
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Earnings</h2>
        <div className="flex items-center gap-2">
            <Sheet>
                <SheetTrigger asChild>
                    <Button 
                        size="sm" 
                        className="gap-2 bg-gradient-to-r from-orange-400 to-amber-600 text-white hover:from-orange-500 hover:to-amber-700 shadow-md border-0"
                    >
                        <Wallet className="h-4 w-4" />
                        Cash Wallet
                    </Button>
                </SheetTrigger>
                <SheetContent side="bottom" className="h-[85vh] sm:h-[90vh] flex flex-col gap-0 p-0">
                    <SheetHeader className="px-6 py-4 border-b bg-background z-10">
                        <SheetTitle>Cash Wallet</SheetTitle>
                        <SheetDescription>
                            Review your cash collection history and outstanding balance.
                        </SheetDescription>
                        <div className="flex items-center p-1 bg-slate-100 rounded-lg w-fit mt-4">
                            <button 
                                onClick={() => setCashWalletView('settlements')} 
                                className={cn(
                                    "px-4 py-1.5 text-sm font-medium rounded-md transition-all", 
                                    cashWalletView === 'settlements' ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-900"
                                )}
                            >
                                Weekly Settlements
                            </button>
                            <button 
                                onClick={() => setCashWalletView('ledger')} 
                                className={cn(
                                    "px-4 py-1.5 text-sm font-medium rounded-md transition-all", 
                                    cashWalletView === 'ledger' ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-900"
                                )}
                            >
                                Your Payments
                            </button>
                        </div>
                    </SheetHeader>
                    <div className="flex-1 overflow-y-auto p-6">
                        {cashWalletView === 'settlements' ? (
                            <WeeklySettlementView 
                                trips={trips}
                                transactions={transactions}
                                csvMetrics={metrics}
                                readOnly={true}
                            />
                        ) : (
                            <TransactionLedgerView 
                                transactions={paymentTransactions}
                            />
                        )}
                    </div>
                </SheetContent>
            </Sheet>

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
        </div>
      </div>

      <Card className="bg-slate-900 text-white border-slate-800 overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2 sm:divide-x sm:divide-slate-800">
            {/* Left: Estimated Payout */}
            <div className="p-6 flex flex-col items-center justify-center text-center">
                <span className="text-slate-400 text-sm block mb-1">
                    {date?.from ? `Estimated Payout (${format(date.from, 'MMM d')}${date.to ? ` - ${format(date.to, 'MMM d')}` : ''})` : 'Estimated Payout (All Time)'}
                </span>
                <div className="flex flex-col items-center mt-2">
                    <h1 className="text-4xl font-bold tracking-tight">${netPayout.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h1>
                    {stats.trend !== null && (
                        <div className={cn("flex items-center text-sm font-medium mt-1", stats.trend >= 0 ? "text-emerald-400" : "text-rose-400")}>
                            <TrendingUp className={cn("h-4 w-4 mr-1", stats.trend < 0 && "rotate-180")} />
                            {stats.trend > 0 ? '+' : ''}{stats.trend.toFixed(1)}%
                        </div>
                    )}
                </div>
            </div>

            {/* Right: Cash Owed */}
            <div className="p-6 border-t border-slate-800 sm:border-t-0 flex flex-col items-center justify-center text-center">
                <div className="flex items-center gap-2 mb-1 justify-center">
                    <span className="text-slate-400 text-sm">Cash Owed</span>
                    <Popover>
                        <PopoverTrigger>
                            <Info className="h-3.5 w-3.5 text-slate-500 hover:text-slate-300 transition-colors" />
                        </PopoverTrigger>
                        <PopoverContent className="w-64 text-xs bg-slate-800 border-slate-700 text-slate-200">
                            Total amount owed to the platform from cash trips and tolls, minus payments made.
                        </PopoverContent>
                    </Popover>
                </div>
                <div className="flex flex-col items-center mt-2">
                    <h1 className="text-4xl font-bold tracking-tight text-orange-500">
                        ${netOutstanding.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </h1>
                </div>
            </div>
        </div>
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
                 <div className="flex justify-between items-center">
                     <span className="font-semibold text-indigo-900">Estimated Payout</span>
                     <span className="text-xl font-bold text-indigo-700">
                         ${tierState.projectedPayout.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                     </span>
                 </div>
             </CardContent>
         </Card>
      )}

      <Card>
         <Collapsible>
             <CardHeader className="py-4">
                <CollapsibleTrigger className="flex items-center justify-between w-full group">
                    <CardTitle className="text-base">Breakdown</CardTitle>
                    <ChevronDown className="h-4 w-4 text-slate-500 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </CollapsibleTrigger>
             </CardHeader>
             <CollapsibleContent>
                 <CardContent className="space-y-4 pt-0">
                    <Row label="Tips" value={`$${stats.tips.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                    
                    <Collapsible>
                        <CollapsibleTrigger className="flex justify-between items-center w-full group py-1">
                            <div className="flex items-center gap-1">
                               <span className="text-sm text-slate-500">Reimbursements</span>
                               <ChevronDown className="h-3 w-3 text-slate-400 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                            </div>
                            <span className="text-sm text-slate-900">${stats.reimbursements.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-2 mt-2 pl-3 border-l-2 border-slate-100 ml-1.5">
                            {stats.pendingReimbursements > 0 && (
                                <div className="flex justify-between items-center text-amber-600 bg-amber-50 px-2 py-1 rounded text-xs mb-2">
                                    <span className="flex items-center gap-1">Pending Approval <Info className="h-3 w-3" /></span>
                                    <span>${stats.pendingReimbursements.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                            )}
                            {stats.reimbursementBreakdown.length > 0 ? (
                                stats.reimbursementBreakdown.map((item, index) => (
                                    <Row key={index} label={item.label} value={`$${item.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                                ))
                            ) : (
                                <div className="text-xs text-slate-400 italic py-1">No detailed records</div>
                            )}
                        </CollapsibleContent>
                    </Collapsible>

                    <Collapsible>
                        <CollapsibleTrigger className="flex justify-between items-center w-full group py-1">
                            <div className="flex items-center gap-1">
                                <span className="text-sm text-slate-500">Expenses</span>
                                <ChevronDown className="h-3 w-3 text-slate-400 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                            </div>
                            <span className="text-sm text-slate-900">-${stats.expenses.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-2 mt-2 pl-3 border-l-2 border-slate-100 ml-1.5">
                            <Row label="Tolls" value={`-$${stats.expenseDetailed.tolls.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                            
                            <Collapsible>
                                <CollapsibleTrigger className="flex justify-between items-center w-full group/fuel py-1">
                                    <div className="flex items-center gap-1">
                                        <span className="text-sm text-slate-500">Fuel</span>
                                        <ChevronDown className="h-3 w-3 text-slate-400 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                                    </div>
                                    <span className="text-sm text-slate-900">-${stats.expenseDetailed.fuel.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </CollapsibleTrigger>
                                <CollapsibleContent className="space-y-1 mt-1 pl-3 border-l-2 border-slate-100 ml-1.5">
                                    {stats.expenseDetailed.fuel.breakdown.length > 0 ? (
                                        stats.expenseDetailed.fuel.breakdown.map((item, index) => (
                                            <Row key={index} label={item.label} value={`-$${item.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                                        ))
                                    ) : (
                                        <div className="text-xs text-slate-400 italic py-1">No fuel records</div>
                                    )}
                                </CollapsibleContent>
                            </Collapsible>

                            <Row label="Other" value={`-$${stats.expenseDetailed.other.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                        </CollapsibleContent>
                    </Collapsible>

                    <Row label="Cash Collected" value={`$${stats.cashCollected.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                 </CardContent>
             </CollapsibleContent>
         </Collapsible>
      </Card>

      <Card>
         <Collapsible>
             <CardHeader className="py-4">
                <CollapsibleTrigger className="flex items-center justify-between w-full group">
                    <CardTitle className="text-base">Recent Payouts</CardTitle>
                    <ChevronDown className="h-4 w-4 text-slate-500 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </CollapsibleTrigger>
             </CardHeader>
             <CollapsibleContent>
                 <CardContent className="pt-0 text-center pb-6">
                     <p className="text-sm text-slate-500">No payout history available yet.</p>
                 </CardContent>
             </CollapsibleContent>
         </Collapsible>
      </Card>
        </TabsContent>

        <TabsContent value="history">
          <DriverHistory history={history} loading={loading} />
        </TabsContent>
      </Tabs>
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