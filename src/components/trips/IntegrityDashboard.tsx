import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Trip } from '../../types/data';
import { calculateAccuracyMetrics, IntegrityMetrics } from '../../utils/analytics/integrityAnalytics';
import { CheckCircle2, AlertTriangle, Zap, UserCog, Clock, MapPin } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';

import { DeadZoneMap } from './DeadZoneMap';
import { ErrorDiagnosticsTable } from './ErrorDiagnosticsTable';
import { Button } from '../ui/button';
import { Download } from 'lucide-react';
import { generateIntegrityCSV } from '../../utils/analytics/integrityAnalytics';

interface IntegrityDashboardProps {
  trips: Trip[];
}

export function IntegrityDashboard({ trips }: IntegrityDashboardProps) {
  const metrics = useMemo(() => calculateAccuracyMetrics(trips), [trips]);

  const handleExport = () => {
    const csvContent = generateIntegrityCSV(trips);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `data_integrity_report_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const chartData = useMemo(() => [
    { name: 'Instant', value: metrics.resolutionDistribution.instant, color: '#10b981' }, // Emerald-500
    { name: 'Auto-Healed', value: metrics.resolutionDistribution.background, color: '#6366f1' }, // Indigo-500
    { name: 'Manual', value: metrics.resolutionDistribution.manual, color: '#f59e0b' }, // Amber-500
    { name: 'Pending/Failed', value: metrics.resolutionDistribution.pending, color: '#f43f5e' }, // Rose-500
  ], [metrics]);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
            <Download className="h-4 w-4" />
            Export Data Report
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Instant Success */}
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Instant Success</p>
              <h3 className="text-2xl font-bold text-emerald-600">
                {metrics.instantSuccessRate.toFixed(1)}%
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {metrics.resolutionDistribution.instant} trips
              </p>
            </div>
            <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
              <Zap className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Auto-Healed */}
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Auto-Healed</p>
              <h3 className="text-2xl font-bold text-indigo-600">
                {metrics.autoHealedRate.toFixed(1)}%
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {metrics.resolutionDistribution.background} trips
              </p>
            </div>
            <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Manual Override */}
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Manual Entry</p>
              <h3 className="text-2xl font-bold text-amber-600">
                {metrics.manualOverrideRate.toFixed(1)}%
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {metrics.resolutionDistribution.manual} trips
              </p>
            </div>
            <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
              <UserCog className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Active Failures */}
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Pending / Failed</p>
              <h3 className="text-2xl font-bold text-rose-600">
                {metrics.totalFailures}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {metrics.failureRate.toFixed(1)}% Rate
              </p>
            </div>
            <div className="h-10 w-10 rounded-full bg-rose-100 flex items-center justify-center text-rose-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Success Distribution Chart */}
        <Card className="min-h-[300px]">
           <CardHeader>
               <CardTitle>Resolution Distribution</CardTitle>
               <CardDescription>Method of address capture across fleet</CardDescription>
           </CardHeader>
           <CardContent className="p-0">
             <div className="h-[300px] w-full flex items-center justify-center">
               <PieChart width={300} height={300}>
                 <Pie
                   data={chartData}
                   cx="50%"
                   cy="50%"
                   innerRadius={60}
                   outerRadius={80}
                   paddingAngle={5}
                   dataKey="value"
                 >
                   {chartData.map((entry, index) => (
                     <Cell key={`cell-${index}`} fill={entry.color} />
                   ))}
                 </Pie>
                 <Tooltip 
                    formatter={(value: number) => [`${value} trips`, 'Count']}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                 />
                 <Legend verticalAlign="bottom" height={36}/>
               </PieChart>
             </div>
           </CardContent>
        </Card>

        {/* Dead Zone Map */}
        <Card className="min-h-[300px]">
           <CardHeader>
               <CardTitle>Dead Zone Heatmap</CardTitle>
               <CardDescription>Geographic clustering of resolution failures</CardDescription>
           </CardHeader>
           <CardContent className="p-0 sm:p-6">
               <DeadZoneMap trips={trips} height="300px" />
           </CardContent>
        </Card>
      </div>
      
      {/* Detailed Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
            <CardHeader>
                <CardTitle>Error Diagnostics</CardTitle>
                <CardDescription>Trips requiring manual review or retry</CardDescription>
            </CardHeader>
            <CardContent>
                <ErrorDiagnosticsTable trips={trips} />
            </CardContent>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle>Integrity Detail Report</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    <div className="flex justify-between items-center py-2 border-b border-slate-100">
                        <span className="text-sm font-medium text-slate-600">Avg. Resolution Latency</span>
                        <span className="font-mono text-slate-900">{metrics.avgResolutionLatency.toFixed(2)}s</span>
                    </div>
                     <div className="flex justify-between items-center py-2 border-b border-slate-100">
                        <span className="text-sm font-medium text-slate-600">Total Trips Analyzed</span>
                        <span className="font-mono text-slate-900">{metrics.totalTrips}</span>
                    </div>
                </div>
            </CardContent>
        </Card>
      </div>
    </div>
  );
}
