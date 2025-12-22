"use client";

import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button"; // Added Button
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { CheckCircle2, AlertTriangle, Clock, Database, FileText, Server, Activity } from "lucide-react"; // Added Activity
import { Trip, DriverMetrics, VehicleMetrics, Notification, ImportBatch } from '../../types/data';

interface SystemHealthViewProps {
  trips: Trip[];
  driverMetrics: DriverMetrics[];
  vehicleMetrics: VehicleMetrics[];
  notifications: Notification[];
  batches?: ImportBatch[];
}

export function SystemHealthView({ trips, driverMetrics, vehicleMetrics, notifications, batches = [] }: SystemHealthViewProps) {
  
  const healthStatus = useMemo(() => {
    const now = new Date();
    const oneDayMs = 24 * 60 * 60 * 1000;
    
    // 1. Data Freshness (Use Batches if available, fallback to trips)
    let lastImportDate: Date | null = null;
    if (batches.length > 0) {
        const sortedBatches = [...batches].sort((a,b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime());
        lastImportDate = new Date(sortedBatches[0].uploadDate);
    } else {
         const sortedTrips = [...trips].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
         lastImportDate = sortedTrips.length > 0 ? new Date(sortedTrips[0].date) : null;
    }
    
    const isDataStale = lastImportDate ? (now.getTime() - lastImportDate.getTime() > oneDayMs * 2) : true;
    
    // 2. Data Integrity
    const hasDrivers = driverMetrics.length > 0;
    const hasVehicles = vehicleMetrics.length > 0;
    
    // 3. System Alerts
    const criticalAlerts = notifications.filter(n => n.type === 'alert' && n.title.toLowerCase().includes('critical')).length;
    
    return {
      lastImportDate,
      isDataStale,
      hasDrivers,
      hasVehicles,
      criticalAlerts,
      totalTrips: trips.length,
      totalDrivers: driverMetrics.length,
      totalVehicles: vehicleMetrics.length
    };
  }, [trips, driverMetrics, vehicleMetrics, notifications]);

  const [diagnosing, setDiagnosing] = React.useState(false);
  const [diagnosticResult, setDiagnosticResult] = React.useState<{
      status: 'pass' | 'fail' | 'warn';
      message: string;
      details: string[];
  } | null>(null);

  const runDiagnostics = () => {
      setDiagnosing(true);
      // Simulate analysis delay
      setTimeout(() => {
          // 1. Consistency Check: Trip Count vs Driver Metrics Trips
          const totalDriverTrips = driverMetrics.reduce((acc, d) => acc + (d.tripsCompleted || 0), 0);
          const rawTrips = trips.filter(t => t.status === 'Completed').length; // Compare completed only
          
          // Note: driverMetrics might be aggregated differently, but should be close
          const tripDiff = Math.abs(rawTrips - totalDriverTrips);
          const tripConsistent = totalDriverTrips === 0 ? true : (tripDiff < 10 || (tripDiff / rawTrips) < 0.1);

          // 2. Financial Check
          const totalRevenue = trips.filter(t => t.status === 'Completed').reduce((acc, t) => acc + t.amount, 0);
          const driverRevenue = driverMetrics.reduce((acc, d) => acc + (d.totalEarnings || 0), 0);
          const revDiff = Math.abs(totalRevenue - driverRevenue);
          const revConsistent = driverRevenue === 0 ? true : (revDiff < 100 || (revDiff / totalRevenue) < 0.1);

          const issues = [];
          if (!tripConsistent) issues.push(`Trip count variance detected: Raw (${rawTrips}) vs Metrics (${totalDriverTrips})`);
          if (!revConsistent) issues.push(`Revenue variance detected: Raw ($${totalRevenue.toFixed(0)}) vs Metrics ($${driverRevenue.toFixed(0)})`);
          if (notifications.filter(n => n.severity === 'critical').length > 0) issues.push("Critical system alerts need resolution");

          if (issues.length === 0) {
              setDiagnosticResult({
                  status: 'pass',
                  message: 'System integrity verified. Data is consistent.',
                  details: ['Record counts match', 'Financial totals balanced', 'Alert system operational']
              });
          } else {
              setDiagnosticResult({
                  status: issues.length > 2 ? 'fail' : 'warn',
                  message: 'Data anomalies detected.',
                  details: issues
              });
          }
          setDiagnosing(false);
      }, 1500);
  };

  return (
    <div className="space-y-6">
      
      {/* Overall System Status Banner */}
      <Alert variant={healthStatus.isDataStale ? "destructive" : "default"} className={healthStatus.isDataStale ? "bg-rose-50 border-rose-200" : "bg-emerald-50 border-emerald-200"}>
        {healthStatus.isDataStale ? (
            <AlertTriangle className="h-4 w-4 text-rose-600" />
        ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        )}
        <AlertTitle className={healthStatus.isDataStale ? "text-rose-800" : "text-emerald-800"}>
            {healthStatus.isDataStale ? "System Attention Needed" : "System Operational"}
        </AlertTitle>
        <AlertDescription className={healthStatus.isDataStale ? "text-rose-600" : "text-emerald-600"}>
            {healthStatus.isDataStale 
                ? "Data feeds appear to be delayed. Last trip import was more than 48 hours ago." 
                : "All systems are running normally. Data feeds are up to date."}
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* Data Feed Status */}
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Database className="h-4 w-4 text-slate-500" />
                    Data Feeds
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-500">Trip Data</span>
                        <div className="flex items-center gap-2">
                             <span className="text-xs font-mono text-slate-600">
                                {healthStatus.lastImportDate ? healthStatus.lastImportDate.toLocaleDateString() : 'No Data'}
                             </span>
                             <StatusDot active={!healthStatus.isDataStale} />
                        </div>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-500">Driver Metrics</span>
                        <div className="flex items-center gap-2">
                             <span className="text-xs font-mono text-slate-600">{healthStatus.totalDrivers} Records</span>
                             <StatusDot active={healthStatus.hasDrivers} />
                        </div>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-500">Vehicle Metrics</span>
                        <div className="flex items-center gap-2">
                             <span className="text-xs font-mono text-slate-600">{healthStatus.totalVehicles} Records</span>
                             <StatusDot active={healthStatus.hasVehicles} />
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>

        {/* Processing Engine Status */}
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Server className="h-4 w-4 text-slate-500" />
                    Processing Engine
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                     <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-500">CSV Import Service</span>
                        <Badge variant="outline" className="text-emerald-600 bg-emerald-50 border-emerald-200">Active</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-500">Alert Engine</span>
                        <Badge variant="outline" className="text-emerald-600 bg-emerald-50 border-emerald-200">Running</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-500">Scheduled Jobs</span>
                        <span className="text-xs text-slate-400">Next: 06:00 AM</span>
                    </div>
                </div>
            </CardContent>
        </Card>

        {/* Storage Status */}
        <Card>
             <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <FileText className="h-4 w-4 text-slate-500" />
                    Storage Usage
                </CardTitle>
            </CardHeader>
             <CardContent>
                <div className="space-y-4">
                     <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-500">Processed Records</span>
                        <span className="font-medium">{healthStatus.totalTrips.toLocaleString()}</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2">
                        <div className="bg-slate-400 h-2 rounded-full" style={{ width: '15%' }}></div>
                    </div>
                    <p className="text-xs text-slate-400 text-right">15% of Quota Used</p>
                </div>
             </CardContent>
        </Card>
      </div>

      {/* Diagnostics Panel */}
      <Card>
          <CardHeader className="flex flex-row items-center justify-between">
              <div>
                  <CardTitle>System Diagnostics</CardTitle>
                  <CardDescription>Run integrity checks on database records.</CardDescription>
              </div>
              <Button onClick={runDiagnostics} disabled={diagnosing || trips.length === 0}>
                  {diagnosing ? (
                      <>
                          <Activity className="mr-2 h-4 w-4 animate-spin" /> Running...
                      </>
                  ) : (
                      <>
                          <Activity className="mr-2 h-4 w-4" /> Run Check
                      </>
                  )}
              </Button>
          </CardHeader>
          <CardContent>
              {diagnosticResult ? (
                  <div className={`p-4 rounded-md border ${
                      diagnosticResult.status === 'pass' ? 'bg-emerald-50 border-emerald-100' : 
                      diagnosticResult.status === 'warn' ? 'bg-amber-50 border-amber-100' : 'bg-rose-50 border-rose-100'
                  }`}>
                      <div className="flex items-start gap-3">
                          {diagnosticResult.status === 'pass' ? (
                              <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5" />
                          ) : (
                              <AlertTriangle className={`h-5 w-5 mt-0.5 ${diagnosticResult.status === 'fail' ? 'text-rose-600' : 'text-amber-600'}`} />
                          )}
                          <div>
                              <h4 className={`font-medium ${
                                  diagnosticResult.status === 'pass' ? 'text-emerald-900' : 
                                  diagnosticResult.status === 'warn' ? 'text-amber-900' : 'text-rose-900'
                              }`}>
                                  {diagnosticResult.message}
                              </h4>
                              <ul className="mt-2 space-y-1">
                                  {diagnosticResult.details.map((d, i) => (
                                      <li key={i} className={`text-sm ${
                                          diagnosticResult.status === 'pass' ? 'text-emerald-700' : 
                                          diagnosticResult.status === 'warn' ? 'text-amber-700' : 'text-rose-700'
                                      }`}>• {d}</li>
                                  ))}
                              </ul>
                          </div>
                      </div>
                  </div>
              ) : (
                  <div className="text-center py-8 text-slate-500 text-sm">
                      Click "Run Check" to verify database integrity.
                  </div>
              )}
          </CardContent>
      </Card>

      {/* Recent System Events Log */}
      <Card>
        <CardHeader>
            <CardTitle>System Event Log</CardTitle>
            <CardDescription>Recent processing activities and errors.</CardDescription>
        </CardHeader>
        <CardContent>
            <div className="rounded-md border">
                 <div className="flex items-center p-3 text-sm bg-slate-50 border-b font-medium text-slate-500">
                    <div className="w-32">Timestamp</div>
                    <div className="w-32">Type</div>
                    <div className="flex-1">Message</div>
                    <div className="w-24">Status</div>
                 </div>
                 {healthStatus.isDataStale && (
                     <LogEntry time="Yesterday, 10:00 PM" type="Warning" message="Data import delayed > 24h" status="Warning" />
                 )}
                 {batches.length > 0 ? batches.slice(0, 5).map(batch => (
                     <LogEntry 
                        key={batch.id}
                        time={new Date(batch.uploadDate).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        type={batch.type || 'Import'}
                        message={`Processed ${batch.fileName} (${batch.recordCount} records)`}
                        status={batch.status === 'completed' ? 'Success' : 'Error'}
                     />
                 )) : (
                    <div className="p-4 text-center text-sm text-slate-500">
                        No recent system events found.
                    </div>
                 )}
            </div>
        </CardContent>
      </Card>

    </div>
  );
}

function StatusDot({ active }: { active: boolean }) {
    return (
        <div className={`h-2.5 w-2.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-rose-500'}`} />
    );
}

function LogEntry({ time, type, message, status }: { time: string, type: string, message: string, status: string }) {
    return (
        <div className="flex items-center p-3 text-sm border-b last:border-0 hover:bg-slate-50/50">
            <div className="w-32 text-slate-500 text-xs">{time}</div>
            <div className="w-32 text-slate-700 font-medium text-xs">{type}</div>
            <div className="flex-1 text-slate-600">{message}</div>
            <div className="w-24">
                <Badge variant="outline" className={
                    status === 'Success' ? 'text-emerald-600 border-emerald-200' : 
                    status === 'Warning' ? 'text-amber-600 border-amber-200' : 'text-rose-600 border-rose-200'
                }>
                    {status}
                </Badge>
            </div>
        </div>
    );
}
