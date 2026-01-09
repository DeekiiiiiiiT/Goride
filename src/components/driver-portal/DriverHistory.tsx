import React from 'react';
import { MonthlyPerformance } from '../../types/data';
import { Card, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";
import { TierCalculations } from '../../utils/tierCalculations';
import { Calendar, Trophy, Car, TrendingUp, Loader2, ChevronDown } from "lucide-react";
import { cn } from "../ui/utils";

interface DriverHistoryProps {
  history: MonthlyPerformance[];
  loading?: boolean;
}

export function DriverHistory({ history, loading }: DriverHistoryProps) {
  const currentMonthData = history.find(h => h.isCurrentMonth);
  const pastMonthsData = history.filter(h => !h.isCurrentMonth);

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
                           <TableHead className="w-[200px]">Month</TableHead>
                           <TableHead className="w-[120px]">Tier Status</TableHead>
                           <TableHead className="text-right w-[100px]">Trips</TableHead>
                           <TableHead className="text-right w-[120px]">Earnings</TableHead>
                           <TableHead className="text-right">Goal Status</TableHead>
                       </TableRow>
                   </TableHeader>
                   <TableBody>
                        {currentMonthData ? (
                            <TableRow key={currentMonthData.monthKey} className="bg-indigo-50/30">
                                <TableCell className="font-medium">
                                   <div className="flex flex-col">
                                       <span>{currentMonthData.monthLabel}</span>
                                       <span className="text-[10px] text-indigo-600 font-bold uppercase tracking-wide">Current</span>
                                   </div>
                               </TableCell>
                               <TableCell>
                                   <Badge variant="outline" className={cn("font-bold border shadow-sm", getTierBadgeColor(currentMonthData.tier.name))}>
                                       {currentMonthData.tier.name}
                                   </Badge>
                               </TableCell>
                               <TableCell className="text-right font-mono text-slate-600">
                                   {currentMonthData.tripCount}
                               </TableCell>
                               <TableCell className="text-right font-bold text-slate-900 font-mono">
                                   {TierCalculations.formatCurrency(currentMonthData.earnings)}
                               </TableCell>
                               <TableCell className="text-right">
                                   {currentMonthData.tier.maxEarnings === null ? (
                                       <span className="text-xs font-bold text-amber-600 flex items-center justify-end gap-1">
                                           <Trophy className="h-3 w-3" /> Max Level
                                       </span>
                                   ) : (
                                       <span className="text-xs text-slate-500">
                                            {((currentMonthData.earnings / (currentMonthData.tier.maxEarnings || 1)) * 100).toFixed(0)}% to Next
                                       </span>
                                   )}
                               </TableCell>
                            </TableRow>
                        ) : (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center py-4 text-slate-500">No current month data available</TableCell>
                            </TableRow>
                        )}
                   </TableBody>
               </Table>

               {pastMonthsData.length > 0 && (
                   <Collapsible>
                       <CollapsibleTrigger className="flex w-full items-center justify-between p-2 px-4 bg-slate-50 hover:bg-slate-100 transition-colors border-t border-b text-sm text-slate-500 group">
                           <span>Past Months ({pastMonthsData.length})</span>
                           <ChevronDown className="h-4 w-4 text-slate-500 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                       </CollapsibleTrigger>
                       <CollapsibleContent>
                           <Table>
                               <TableBody>
                                   {pastMonthsData.map(item => (
                                       <TableRow key={item.monthKey}>
                                            <TableCell className="font-medium w-[200px]">
                                               <span>{item.monthLabel}</span>
                                           </TableCell>
                                           <TableCell className="w-[120px]">
                                               <Badge variant="outline" className={cn("font-bold border shadow-sm", getTierBadgeColor(item.tier.name))}>
                                                   {item.tier.name}
                                               </Badge>
                                           </TableCell>
                                           <TableCell className="text-right font-mono text-slate-600 w-[100px]">
                                               {item.tripCount}
                                           </TableCell>
                                           <TableCell className="text-right font-bold text-slate-900 font-mono w-[120px]">
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
                       </CollapsibleContent>
                   </Collapsible>
               )}
           </div>

           {/* Mobile List View */}
           <div className="md:hidden">
                {currentMonthData && (
                    <div className="p-4 flex flex-col gap-3 bg-indigo-50/30 border-b border-slate-100">
                        <div className="flex justify-between items-center">
                            <div className="flex flex-col">
                                <span className="font-bold text-slate-900">{currentMonthData.monthLabel}</span>
                                <span className="text-[10px] text-indigo-600 font-bold uppercase">Current Month</span>
                            </div>
                            <Badge variant="outline" className={cn("font-bold border shadow-sm", getTierBadgeColor(currentMonthData.tier.name))}>
                                {currentMonthData.tier.name}
                            </Badge>
                        </div>
                        
                        <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2 text-slate-500">
                                <Car className="h-4 w-4" />
                                <span>{currentMonthData.tripCount} Trips</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-slate-900">
                                    {TierCalculations.formatCurrency(currentMonthData.earnings)}
                                </span>
                            </div>
                        </div>
                        
                        {currentMonthData.tier.maxEarnings && (
                            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mt-1">
                                <div 
                                    className="bg-slate-300 h-full rounded-full" 
                                    style={{ width: `${Math.min(100, (currentMonthData.earnings / currentMonthData.tier.maxEarnings) * 100)}%` }}
                                />
                            </div>
                        )}
                    </div>
                )}

                {pastMonthsData.length > 0 && (
                   <Collapsible>
                       <CollapsibleTrigger className="flex w-full items-center justify-between p-4 bg-white hover:bg-slate-50 transition-colors text-sm text-slate-500 group border-b border-slate-100">
                           <span className="font-medium text-slate-900">Past Months</span>
                           <ChevronDown className="h-4 w-4 text-slate-400 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                       </CollapsibleTrigger>
                       <CollapsibleContent className="divide-y divide-slate-100">
                           {pastMonthsData.map(item => (
                               <div key={item.monthKey} className="p-4 flex flex-col gap-3 bg-white">
                                   <div className="flex justify-between items-center">
                                       <div className="flex flex-col">
                                           <span className="font-bold text-slate-900">{item.monthLabel}</span>
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
                       </CollapsibleContent>
                   </Collapsible>
                )}
           </div>
       </div>
    </div>
  );
}