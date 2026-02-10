import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { AlertCircle, CheckCircle2, XCircle, ChevronRight, User, Sparkles, TrendingUp, AlertTriangle } from "lucide-react";
import { DashboardAlert, DashboardMetrics, DriverMetrics } from '../../types/data';

interface FleetAlertsPanelProps {
  alerts: DashboardAlert[];
  metrics: DashboardMetrics;
  driverMetrics?: DriverMetrics[];
  onNavigate: (page: string) => void;
  onReview?: (checkInId: string) => void;
}

export function FleetAlertsPanel({ alerts, metrics, driverMetrics = [], onNavigate, onReview }: FleetAlertsPanelProps) {
  
  const { topPerformers, needsAttention, aiInsights, operationalAlerts } = useMemo(() => {
      // Phase 5: Safety Net - Exclude known Fleet Owner names if they slipped through CSV parsing
      // This applies to BOTH "Top Performers" and "Needs Attention" lists
      const filteredDriverMetrics = driverMetrics.filter(d => {
          const name = (d.driverName || '').toUpperCase();
          return !name.includes('SADIKI ABAYOMI THOMAS') && !name.includes('UBER B.V.');
      });

      // Top Performers: Sorted by total earnings
      const sortedByEarnings = [...filteredDriverMetrics].sort((a, b) => (b.totalEarnings || 0) - (a.totalEarnings || 0));
      const top = sortedByEarnings.slice(0, 3);

      // Needs Attention: Low acceptance (< 60%) or high cancellation (> 10%)
      const attention = filteredDriverMetrics.filter(d => (d.acceptanceRate < 0.6) || (d.cancellationRate > 0.1));
      
      // Split Alerts
      const ai = alerts.filter(a => a.definitionId === 'ai_insight');
      const ops = alerts.filter(a => a.definitionId !== 'ai_insight');

      return { 
          topPerformers: top, 
          needsAttention: attention.slice(0, 3),
          aiInsights: ai,
          operationalAlerts: ops
      };
  }, [driverMetrics, alerts]);

  return (
    <div className="space-y-4 h-full flex flex-col">
      
      {/* 1. AI Insights Panel (New Phase 8) */}
      {aiInsights.length > 0 && (
          <Card className="border-l-4 border-l-indigo-500 shadow-sm bg-indigo-50/20">
            <CardHeader className="py-3 px-4 border-b bg-indigo-50/50 flex flex-row items-center justify-between">
               <div className="flex items-center gap-2 text-indigo-700">
                   <Sparkles className="h-4 w-4" />
                   <CardTitle className="text-sm font-bold">AI INSIGHTS & TRENDS</CardTitle>
               </div>
               <Badge variant="secondary" className="bg-white text-indigo-700 hover:bg-white text-[10px] h-5 border-indigo-200">
                   {aiInsights.length} New
               </Badge>
            </CardHeader>
            <CardContent className="p-0 max-h-[200px] overflow-y-auto">
                <div className="divide-y divide-indigo-100/50">
                    {aiInsights.map((alert, index) => (
                        <div key={`${alert.id}-${index}`} className="p-3 hover:bg-indigo-50/40 transition-colors flex gap-3 items-start group">
                             <div className="mt-0.5 rounded-full p-1 bg-white border border-indigo-100 shrink-0">
                                {alert.title.toLowerCase().includes('trend') ? (
                                    <TrendingUp className="h-3 w-3 text-emerald-600" />
                                ) : (
                                    <AlertTriangle className="h-3 w-3 text-amber-600" />
                                )}
                             </div>
                             <div className="flex-1 space-y-1">
                                 <div className="flex items-center gap-2">
                                     <p className="text-sm font-semibold text-slate-800 leading-none">{alert.title}</p>
                                 </div>
                                 <p className="text-xs text-slate-600 leading-relaxed">{alert.description}</p>
                                 <div className="flex items-center gap-2 pt-1">
                                     <span className="text-[10px] text-slate-400">Just now</span>
                                 </div>
                             </div>
                        </div>
                    ))}
                </div>
            </CardContent>
          </Card>
      )}

      {/* 2. Operational Alerts Panel */}
      <Card className="border-l-4 border-l-red-500 shadow-sm flex-1 max-h-[300px]">
        <CardHeader className="py-3 px-4 border-b bg-red-50/50 flex flex-row items-center justify-between">
           <div className="flex items-center gap-2 text-red-700">
               <AlertCircle className="h-4 w-4" />
               <CardTitle className="text-sm font-bold">FLEET ALERTS</CardTitle>
           </div>
           {operationalAlerts.length > 0 && (
               <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200 text-[10px] h-5">
                   {operationalAlerts.length}
               </Badge>
           )}
        </CardHeader>
        <CardContent className="p-0 overflow-y-auto h-full">
            {operationalAlerts.length > 0 ? (
                <div className="divide-y divide-slate-100">
                    {operationalAlerts.map((alert, index) => (
                        <div key={`${alert.id}-${index}`} className="p-3 hover:bg-slate-50 transition-colors flex gap-3 items-start group">
                             <div className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${
                                 alert.severity === 'critical' ? 'bg-red-500 animate-pulse' : 
                                 alert.severity === 'high' ? 'bg-orange-500' : 'bg-yellow-500'
                             }`} />
                             <div className="flex-1 space-y-1">
                                 <div className="flex items-center gap-2">
                                     <p className="text-sm font-medium text-slate-900 leading-none">{alert.title}</p>
                                 </div>
                                 <p className="text-xs text-slate-500">{alert.description}</p>
                                 <div className="flex items-center gap-2 pt-1">
                                     <span className="text-[10px] text-slate-400">2 min ago</span>
                                     <Button 
                                         variant="outline" 
                                         size="sm" 
                                         className="h-5 text-[10px] px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                         onClick={() => {
                                             if (alert.definitionId === 'def-manual-odometer') {
                                                 if (onReview && alert.metadata?.checkInId) {
                                                     onReview(alert.metadata.checkInId);
                                                 }
                                             } else if (alert.definitionId === 'def-maintenance-due') {
                                                 onNavigate('vehicles');
                                             } else {
                                                 // Default action
                                                 console.log("Action triggered for", alert.definitionId);
                                             }
                                         }}
                                     >
                                         {alert.definitionId === 'def-manual-odometer' ? 'Review' : 'View'}
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

      {/* 3. Leaderboards */}
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
                        key={`${driver.id}-${index}`}
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
                
                {needsAttention.length > 0 ? needsAttention.map((driver, index) => (
                    <div 
                        key={`${driver.id}-${index}`}
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
