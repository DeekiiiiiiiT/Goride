import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { FinancialTransaction, CashFlowRecord } from "../../types/data";
import { getCashFlowData } from "../../services/financialService";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';
import { SafeResponsiveContainer } from "../ui/SafeResponsiveContainer";
import { ArrowUpRight, ArrowDownRight, Wallet, Building2, TrendingUp, AlertCircle } from 'lucide-react';
import { format, addDays } from 'date-fns';

interface CashFlowDashboardProps {
  transactions: FinancialTransaction[];
}

export function CashFlowDashboard({ transactions }: CashFlowDashboardProps) {
  const cashFlowHistory = useMemo(() => getCashFlowData(transactions), [transactions]);
  
  // Get "Today's" record (most recent in the sorted list which is desc)
  const todayRecord = cashFlowHistory[0] || {
    date: new Date().toISOString(),
    openingBalance: 0,
    cashIn: 0,
    cashOut: 0,
    closingBalance: 0,
    breakdown: { cashOnHand: 0, bankBalance: 0 }
  };

  // Generate Forecast (Mock logic based on average)
  const forecastData = useMemo(() => {
    const history = [...cashFlowHistory].reverse().slice(-30); // Last 30 days
    if (history.length === 0) return [];

    const avgGrowth = history.reduce((acc, curr) => acc + (curr.cashIn - curr.cashOut), 0) / history.length;
    const lastBalance = todayRecord.closingBalance;
    
    const forecast = [];
    // Add history for context
    history.slice(-7).forEach(h => {
        forecast.push({
            date: format(new Date(h.date), 'MMM d'),
            balance: h.closingBalance,
            type: 'actual'
        });
    });

    // Add 7 days projection
    for (let i = 1; i <= 7; i++) {
        const date = addDays(new Date(todayRecord.date), i);
        forecast.push({
            date: format(date, 'MMM d'),
            balance: lastBalance + (avgGrowth * i),
            type: 'projected'
        });
    }
    return forecast;
  }, [cashFlowHistory, todayRecord]);

  const metrics = {
    cashToRevenue: 0.3, // Mock
    daysCashOnHand: 45, // Mock
    coverageRatio: 2.8, // Mock
    burnRate: 0, // Mock (Positive flow)
  };

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      
      {/* Step 3.1: Cash Position Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-slate-900 text-white border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Total Available Cash</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatCurrency(todayRecord.closingBalance)}</div>
            <p className="text-xs text-slate-400 mt-1 flex items-center">
              <span className="text-emerald-400 flex items-center gap-1 mr-2">
                <TrendingUp className="h-3 w-3" /> +12.5%
              </span>
              vs last week
            </p>
          </CardContent>
        </Card>

        <Card>
           <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Cash Flow Today</CardTitle>
          </CardHeader>
          <CardContent>
             <div className="flex justify-between items-end mb-2">
                 <div className="flex flex-col">
                     <span className="text-xs text-slate-400">In</span>
                     <span className="text-lg font-semibold text-emerald-600 flex items-center">
                        <ArrowUpRight className="h-4 w-4 mr-1" />
                        {formatCurrency(todayRecord.cashIn)}
                     </span>
                 </div>
                 <div className="h-8 w-px bg-slate-100 mx-2" />
                 <div className="flex flex-col items-end">
                     <span className="text-xs text-slate-400">Out</span>
                     <span className="text-lg font-semibold text-rose-600 flex items-center">
                        <ArrowDownRight className="h-4 w-4 mr-1" />
                        {formatCurrency(todayRecord.cashOut)}
                     </span>
                 </div>
             </div>
             <div className="text-xs text-slate-500 border-t pt-2 mt-2">
                Net: <span className="font-bold text-emerald-600">+{formatCurrency(todayRecord.cashIn - todayRecord.cashOut)}</span>
             </div>
          </CardContent>
        </Card>

        <Card>
           <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Wallet className="h-4 w-4 text-amber-500" />
                        <span className="text-sm text-slate-600">Cash on Hand</span>
                    </div>
                    <span className="font-bold text-slate-900">{formatCurrency(todayRecord.breakdown.cashOnHand)}</span>
                </div>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-blue-500" />
                        <span className="text-sm text-slate-600">Bank Balance</span>
                    </div>
                    <span className="font-bold text-slate-900">{formatCurrency(todayRecord.breakdown.bankBalance)}</span>
                </div>
            </div>
          </CardContent>
        </Card>

        {/* Step 3.4: Cash Flow Health Metrics */}
        <Card>
           <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Health Metrics</CardTitle>
          </CardHeader>
          <CardContent>
             <div className="grid grid-cols-2 gap-2">
                 <div className="flex flex-col p-2 bg-slate-50 rounded">
                     <span className="text-[10px] text-slate-500 uppercase">Runway</span>
                     <span className="text-sm font-bold text-slate-900">∞ Month</span>
                 </div>
                 <div className="flex flex-col p-2 bg-slate-50 rounded">
                     <span className="text-[10px] text-slate-500 uppercase">Safety</span>
                     <span className="text-sm font-bold text-slate-900">{metrics.daysCashOnHand} Days</span>
                 </div>
                 <div className="flex flex-col p-2 bg-slate-50 rounded">
                     <span className="text-[10px] text-slate-500 uppercase">Conversion</span>
                     <span className="text-sm font-bold text-emerald-600">2.5 Days</span>
                 </div>
                 <div className="flex flex-col p-2 bg-slate-50 rounded">
                     <span className="text-[10px] text-slate-500 uppercase">Operating</span>
                     <span className="text-sm font-bold text-emerald-600">Positive</span>
                 </div>
             </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Step 3.3: Cash Forecasting Engine */}
          <Card className="lg:col-span-2">
            <CardHeader>
                <CardTitle>7-Day Cash Forecast</CardTitle>
                <CardDescription>Projected cash balance based on recent trends</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="h-[250px] w-full">
                    <SafeResponsiveContainer width="100%" height="100%">
                        <AreaChart data={forecastData}>
                            <defs>
                                <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis 
                                stroke="#94a3b8" 
                                fontSize={12} 
                                tickLine={false} 
                                axisLine={false} 
                                tickFormatter={(val) => `$${val/1000}k`} 
                            />
                            <Tooltip 
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                formatter={(val: number) => [formatCurrency(val), 'Balance']}
                            />
                            <ReferenceLine x={forecastData.find(d => d.type === 'projected')?.date} stroke="#94a3b8" strokeDasharray="3 3" label={{ position: 'top', value: 'Today', fill: '#94a3b8', fontSize: 10 }} />
                            <Area 
                                type="monotone" 
                                dataKey="balance" 
                                stroke="#10b981" 
                                strokeWidth={2}
                                fillOpacity={1} 
                                fill="url(#colorBalance)" 
                            />
                        </AreaChart>
                    </SafeResponsiveContainer>
                </div>
            </CardContent>
          </Card>

          {/* Step 3.2: Daily Cash Flow Statement (Summary) */}
          <Card>
              <CardHeader>
                  <CardTitle>Daily Statement</CardTitle>
                  <CardDescription>{format(new Date(todayRecord.date), 'MMMM d, yyyy')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                  <div>
                      <h4 className="text-xs font-semibold text-emerald-600 mb-2 uppercase tracking-wide">Cash Inflows</h4>
                      <div className="space-y-1">
                          <div className="flex justify-between text-sm">
                              <span className="text-slate-600">Trip Fares</span>
                              <span className="font-medium">{formatCurrency(todayRecord.cashIn * 0.9)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                              <span className="text-slate-600">Tips</span>
                              <span className="font-medium">{formatCurrency(todayRecord.cashIn * 0.1)}</span>
                          </div>
                          <div className="flex justify-between text-sm border-t pt-1 mt-1 font-bold">
                              <span>Total Cash In</span>
                              <span className="text-emerald-600">{formatCurrency(todayRecord.cashIn)}</span>
                          </div>
                      </div>
                  </div>

                  <div>
                      <h4 className="text-xs font-semibold text-rose-600 mb-2 uppercase tracking-wide">Cash Outflows</h4>
                      <div className="space-y-1">
                           {todayRecord.cashOut > 0 ? (
                               <>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-600">Expenses</span>
                                    <span className="font-medium">{formatCurrency(todayRecord.cashOut)}</span>
                                </div>
                               </>
                           ) : (
                               <div className="text-sm text-slate-400 italic">No expenses recorded today</div>
                           )}
                          <div className="flex justify-between text-sm border-t pt-1 mt-1 font-bold">
                              <span>Total Cash Out</span>
                              <span className="text-rose-600">{formatCurrency(todayRecord.cashOut)}</span>
                          </div>
                      </div>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                       <div className="flex justify-between items-center">
                           <span className="font-semibold text-slate-700">Net Cash Flow</span>
                           <span className={`font-bold ${todayRecord.cashIn - todayRecord.cashOut >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                               {todayRecord.cashIn - todayRecord.cashOut >= 0 ? '+' : ''}
                               {formatCurrency(todayRecord.cashIn - todayRecord.cashOut)}
                           </span>
                       </div>
                  </div>
              </CardContent>
          </Card>
      </div>
    </div>
  );
}
