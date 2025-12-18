import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { AlertCircle, CheckCircle2, XCircle, ChevronRight, User } from "lucide-react";
import { DashboardAlert, DashboardMetrics, DriverMetrics } from '../../types/data';

interface FleetAlertsPanelProps {
  alerts: DashboardAlert[];
  metrics: DashboardMetrics;
  driverMetrics?: DriverMetrics[];
  onNavigate: (page: string) => void;
}

export function FleetAlertsPanel({ alerts, metrics, driverMetrics = [], onNavigate }: FleetAlertsPanelProps) {
  
  const { topPerformers, needsAttention } = useMemo(() => {
      // Top Performers: Sorted by total earnings
      const sortedByEarnings = [...driverMetrics].sort((a, b) => (b.totalEarnings || 0) - (a.totalEarnings || 0));
      const top = sortedByEarnings.slice(0, 3);

      // Needs Attention: Low acceptance (< 60%) or high cancellation (> 10%)
      const attention = driverMetrics.filter(d => (d.acceptanceRate < 0.6) || (d.cancellationRate > 0.1));
      
      return { topPerformers: top, needsAttention: attention.slice(0, 3) };
  }, [driverMetrics]);

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* 1. Critical Alerts Panel */}
      <Card className="border-l-4 border-l-red-500 shadow-sm">
        <CardHeader className="py-3 px-4 border-b bg-red-50/50 flex flex-row items-center justify-between">
           <div className="flex items-center gap-2 text-red-700">
               <AlertCircle className="h-4 w-4" />
               <CardTitle className="text-sm font-bold">CRITICAL ALERTS ({alerts.length})</CardTitle>
           </div>
           <Button variant="ghost" size="sm" className="h-6 text-xs text-red-600 hover:text-red-800 hover:bg-red-100">
               View All
           </Button>
        </CardHeader>
        <CardContent className="p-0 max-h-[300px] overflow-y-auto">
            {alerts.length > 0 ? (
                <div className="divide-y divide-slate-100">
                    {alerts.map((alert) => (
                        <div key={alert.id} className="p-3 hover:bg-slate-50 transition-colors flex gap-3 items-start group">
                             <div className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${
                                 alert.severity === 'critical' ? 'bg-red-500 animate-pulse' : 
                                 alert.severity === 'high' ? 'bg-orange-500' : 'bg-yellow-500'
                             }`} />
                             <div className="flex-1 space-y-1">
                                 <p className="text-sm font-medium text-slate-900 leading-none">{alert.title}</p>
                                 <p className="text-xs text-slate-500">{alert.description}</p>
                                 <div className="flex items-center gap-2 pt-1">
                                     <span className="text-[10px] text-slate-400">2 min ago</span>
                                     <Button variant="outline" size="sm" className="h-5 text-[10px] px-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                         Act
                                     </Button>
                                 </div>
                             </div>
                             <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-300 hover:text-slate-500">
                                 <XCircle className="h-4 w-4" />
                             </Button>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="p-4 text-center text-sm text-slate-500">
                    No active alerts.
                </div>
            )}
        </CardContent>
      </Card>

      {/* 2. Leaderboards */}
      <Card className="flex-1 flex flex-col">
        <CardHeader className="py-3 px-4 border-b bg-slate-50">
            <CardTitle className="text-sm font-medium">Performance Leaderboard</CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-6 flex-1 overflow-auto">
            
            {/* Top Performers */}
            <div className="space-y-3">
                <h4 className="text-xs font-semibold text-emerald-600 uppercase tracking-wider flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Top Performers (Live)
                </h4>
                
                {topPerformers.length > 0 ? topPerformers.map((driver, index) => (
                    <div 
                        key={driver.id}
                        className="flex items-center justify-between p-2 rounded bg-emerald-50/50 border border-emerald-100 cursor-pointer hover:bg-emerald-50"
                        onClick={() => onNavigate('drivers')}
                    >
                        <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-xs">
                                {index + 1}
                            </div>
                            <div>
                                <p className="text-sm font-medium text-slate-900">{driver.driverName}</p>
                                <div className="flex text-xs text-yellow-500">
                                    ★★★★★
                                </div>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-sm font-bold text-slate-900">${(driver.totalEarnings || 0).toLocaleString()}</p>
                            <p className="text-[10px] text-slate-500">Today</p>
                        </div>
                    </div>
                )) : (
                    <div className="text-xs text-slate-500 italic">No data available</div>
                )}
            </div>

            <div className="h-px bg-slate-100" />

            {/* Needs Attention */}
            <div className="space-y-3">
                <h4 className="text-xs font-semibold text-amber-600 uppercase tracking-wider flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> Needs Attention
                </h4>
                
                {needsAttention.length > 0 ? needsAttention.map((driver) => (
                    <div 
                        key={driver.id}
                        className="flex items-center justify-between p-2 rounded bg-amber-50/50 border border-amber-100 cursor-pointer hover:bg-amber-50"
                        onClick={() => onNavigate('drivers')}
                    >
                         <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-700">
                                <User className="h-4 w-4" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-slate-900">{driver.driverName}</p>
                                <Badge variant="outline" className="text-[10px] h-4 px-1 border-amber-200 text-amber-700 bg-white">
                                    {driver.acceptanceRate < 0.6 ? 'Low Acceptance' : 'High Cancellation'}
                                </Badge>
                            </div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                            <ChevronRight className="h-4 w-4 text-slate-400" />
                        </Button>
                    </div>
                )) : (
                    <div className="text-xs text-slate-500 italic">No issues detected</div>
                )}
            </div>

        </CardContent>
      </Card>
    </div>
  );
}
