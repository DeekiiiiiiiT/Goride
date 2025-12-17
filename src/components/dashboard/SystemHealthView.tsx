"use client";

import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { CheckCircle2, AlertTriangle, Clock, Database, FileText, Server } from "lucide-react";
import { Trip, DriverMetrics, VehicleMetrics, Notification } from '../../types/data';

interface SystemHealthViewProps {
  trips: Trip[];
  driverMetrics: DriverMetrics[];
  vehicleMetrics: VehicleMetrics[];
  notifications: Notification[];
}

export function SystemHealthView({ trips, driverMetrics, vehicleMetrics, notifications }: SystemHealthViewProps) {
  
  const healthStatus = useMemo(() => {
    const now = new Date();
    const oneDayMs = 24 * 60 * 60 * 1000;
    
    // 1. Data Freshness
    const sortedTrips = [...trips].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const lastTripDate = sortedTrips.length > 0 ? new Date(sortedTrips[0].date) : null;
    
    const isDataStale = lastTripDate ? (now.getTime() - lastTripDate.getTime() > oneDayMs * 2) : true; // Warning if > 2 days old
    
    // 2. Data Integrity
    const hasDrivers = driverMetrics.length > 0;
    const hasVehicles = vehicleMetrics.length > 0;
    
    // 3. System Alerts
    const criticalAlerts = notifications.filter(n => n.type === 'alert' && n.title.toLowerCase().includes('critical')).length;
    
    return {
      lastTripDate,
      isDataStale,
      hasDrivers,
      hasVehicles,
      criticalAlerts,
      totalTrips: trips.length,
      totalDrivers: driverMetrics.length,
      totalVehicles: vehicleMetrics.length
    };
  }, [trips, driverMetrics, vehicleMetrics, notifications]);

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
                                {healthStatus.lastTripDate ? healthStatus.lastTripDate.toLocaleDateString() : 'No Data'}
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
                 {/* Mock Logs - In real app, fetch from Supabase Logs */}
                 <LogEntry time="Today, 06:00 AM" type="Scheduled Job" message="Daily Report Generation" status="Success" />
                 <LogEntry time="Today, 05:45 AM" type="Data Import" message="Processed Payment_Order.csv (45 records)" status="Success" />
                 <LogEntry time="Yesterday, 06:00 AM" type="Scheduled Job" message="Daily Report Generation" status="Success" />
                 <LogEntry time="Yesterday, 05:30 AM" type="Data Import" message="Processed Driver_Quality.csv" status="Success" />
                 {healthStatus.isDataStale && (
                     <LogEntry time="Yesterday, 10:00 PM" type="Warning" message="Data import delayed > 24h" status="Warning" />
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
