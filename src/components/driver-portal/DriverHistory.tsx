import React, { useMemo } from 'react';
import { MonthlyPerformance } from '../../types/data';
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { TierCalculations } from '../../utils/tierCalculations';
import { Calendar, Trophy, Car, TrendingUp, Loader2 } from "lucide-react";
import { cn } from "../ui/utils";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { SafeResponsiveContainer } from "../ui/SafeResponsiveContainer";

interface DriverHistoryProps {
  history: MonthlyPerformance[];
  loading?: boolean;
}

export function DriverHistory({ history, loading }: DriverHistoryProps) {
  const chartData = useMemo(() => {
     return [...history].reverse().slice(-6); // Last 6 months
  }, [history]);

  if (loading) {
      return (
          <div className="flex justify-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          </div>
      );
  }

  if (!history || history.length === 0) {
      return (
          <Card className="bg-slate-50 border-dashed">
              <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                  <div className="h-12 w-12 rounded-full bg-slate-200 flex items-center justify-center mb-4">
                      <Calendar className="h-6 w-6 text-slate-500" />
                  </div>
                  <h3 className="text-lg font-medium text-slate-900">No History Yet</h3>
                  <p className="text-sm text-slate-500 mt-1 max-w-xs">
                      Complete trips this month to start building your tier history.
                  </p>
              </CardContent>
          </Card>
      );
  }

  const getTierBadgeColor = (tierName: string) => {
      const name = tierName.toLowerCase();
      if (name.includes('platinum')) return "bg-violet-100 text-violet-700 hover:bg-violet-200 border-violet-200";
      if (name.includes('gold')) return "bg-amber-100 text-amber-700 hover:bg-amber-200 border-amber-200";
      if (name.includes('silver')) return "bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200";
      return "bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-indigo-200";
  };

  return (
    <div className="space-y-6">
       {/* Earnings Trend Chart */}
       {history.length > 0 && (
          <Card>
              <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500 uppercase tracking-wider">Earnings Trend (Last 6 Months)</CardTitle>
              </CardHeader>
              <CardContent>
                  <div className="h-[200px] w-full">
                      <SafeResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                              <XAxis 
                                dataKey="monthLabel" 
                                tickFormatter={(val) => val.split(' ')[0]} 
                                tick={{fontSize: 12, fill: '#64748b'}} 
                                axisLine={false}
                                tickLine={false}
                              />
                              <YAxis 
                                tickFormatter={(val) => `$${val}`} 
                                tick={{fontSize: 12, fill: '#64748b'}} 
                                axisLine={false}
                                tickLine={false}
                              />
                              <Tooltip 
                                formatter={(value: number) => TierCalculations.formatCurrency(value)}
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                              />
                              <Bar 
                                dataKey="earnings" 
                                fill="#6366f1" 
                                radius={[4, 4, 0, 0]} 
                                barSize={40}
                              />
                          </BarChart>
                      </SafeResponsiveContainer>
                  </div>
              </CardContent>
          </Card>
       )}

       {/* Summary Cards */}
       <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
           <Card>
               <CardContent className="p-4 pt-5">
                   <div className="flex justify-between items-start">
                       <div className="space-y-1">
                           <p className="text-xs text-slate-500 font-medium uppercase">Best Month</p>
                           <p className="text-lg font-bold text-slate-900">
                               {history.length > 0 ? history[0].monthLabel : '-'}
                           </p>
                       </div>
                       <Trophy className="h-4 w-4 text-amber-500" />
                   </div>
               </CardContent>
           </Card>
           <Card>
               <CardContent className="p-4 pt-5">
                   <div className="flex justify-between items-start">
                       <div className="space-y-1">
                           <p className="text-xs text-slate-500 font-medium uppercase">Total Earnings</p>
                           <p className="text-lg font-bold text-emerald-600">
                               {TierCalculations.formatCurrency(history.reduce((acc, curr) => acc + curr.earnings, 0))}
                           </p>
                       </div>
                       <TrendingUp className="h-4 w-4 text-emerald-500" />
                   </div>
               </CardContent>
           </Card>
       </div>

       <div className="border rounded-lg bg-white overflow-hidden shadow-sm">
           <div className="p-4 border-b bg-slate-50/50 flex items-center gap-2">
               <Calendar className="h-4 w-4 text-slate-500" />
               <h3 className="font-semibold text-slate-700">Monthly Performance</h3>
           </div>
           
           {/* Desktop Table */}
           <div className="hidden md:block">
               <Table>
                   <TableHeader>
                       <TableRow>
                           <TableHead>Month</TableHead>
                           <TableHead>Tier Status</TableHead>
                           <TableHead className="text-right">Trips</TableHead>
                           <TableHead className="text-right">Earnings</TableHead>
                           <TableHead className="text-right">Goal Status</TableHead>
                       </TableRow>
                   </TableHeader>
                   <TableBody>
                       {history.map((item) => (
                           <TableRow key={item.monthKey} className={item.isCurrentMonth ? "bg-indigo-50/30" : ""}>
                               <TableCell className="font-medium">
                                   <div className="flex flex-col">
                                       <span>{item.monthLabel}</span>
                                       {item.isCurrentMonth && <span className="text-[10px] text-indigo-600 font-bold uppercase tracking-wide">Current</span>}
                                   </div>
                               </TableCell>
                               <TableCell>
                                   <Badge variant="outline" className={cn("font-bold border shadow-sm", getTierBadgeColor(item.tier.name))}>
                                       {item.tier.name}
                                   </Badge>
                               </TableCell>
                               <TableCell className="text-right font-mono text-slate-600">
                                   {item.tripCount}
                               </TableCell>
                               <TableCell className="text-right font-bold text-slate-900 font-mono">
                                   {TierCalculations.formatCurrency(item.earnings)}
                               </TableCell>
                               <TableCell className="text-right">
                                   {item.tier.maxEarnings === null ? (
                                       <span className="text-xs font-bold text-amber-600 flex items-center justify-end gap-1">
                                           <Trophy className="h-3 w-3" /> Max Level
                                       </span>
                                   ) : (
                                       <span className="text-xs text-slate-500">
                                            {((item.earnings / (item.tier.maxEarnings || 1)) * 100).toFixed(0)}% to Next
                                       </span>
                                   )}
                               </TableCell>
                           </TableRow>
                       ))}
                   </TableBody>
               </Table>
           </div>

           {/* Mobile List View */}
           <div className="md:hidden divide-y divide-slate-100">
               {history.map((item) => (
                   <div key={item.monthKey} className={cn("p-4 flex flex-col gap-3", item.isCurrentMonth ? "bg-indigo-50/30" : "bg-white")}>
                       <div className="flex justify-between items-center">
                           <div className="flex flex-col">
                               <span className="font-bold text-slate-900">{item.monthLabel}</span>
                               {item.isCurrentMonth && <span className="text-[10px] text-indigo-600 font-bold uppercase">Current Month</span>}
                           </div>
                           <Badge variant="outline" className={cn("font-bold border shadow-sm", getTierBadgeColor(item.tier.name))}>
                               {item.tier.name}
                           </Badge>
                       </div>
                       
                       <div className="flex items-center justify-between text-sm">
                           <div className="flex items-center gap-2 text-slate-500">
                               <Car className="h-4 w-4" />
                               <span>{item.tripCount} Trips</span>
                           </div>
                           <div className="flex items-center gap-2">
                               <span className="font-mono font-bold text-slate-900">
                                   {TierCalculations.formatCurrency(item.earnings)}
                               </span>
                           </div>
                       </div>
                       
                       {/* Mini Progress Bar for visual flair */}
                       {item.tier.maxEarnings && (
                           <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mt-1">
                               <div 
                                   className="bg-slate-300 h-full rounded-full" 
                                   style={{ width: `${Math.min(100, (item.earnings / item.tier.maxEarnings) * 100)}%` }}
                               />
                           </div>
                       )}
                   </div>
               ))}
           </div>
       </div>
    </div>
  );
}