import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";
import { Button } from "../ui/button";
import { Trip } from '../../types/data';
import { normalizePlatform } from '../../utils/normalizePlatform';
import { 
  Activity, 
  Wifi, 
  WifiOff, 
  CheckCircle2, 
  XCircle, 
  RefreshCw,
  Zap
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Cell
} from 'recharts';

interface RealTimeViewProps {
  trips: Trip[];
}

export function RealTimeView({ trips }: RealTimeViewProps) {
  const [isLive, setIsLive] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [simulatedRecentTrips, setSimulatedRecentTrips] = useState<Trip[]>([]);

  // Effect to update "current time" clock
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Compute "Recent" activity based on the actual latest date in the dataset
  // Since data might be historical, we treat "Now" as the time of the latest trip + some buffer, 
  // or we just show the absolute latest trips.
  const latestTrips = useMemo(() => {
    return [...trips]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 50);
  }, [trips]);

  // Stats for the "Live" view (taking the top 20 latest trips as a proxy for "current activity")
  const recentStats = useMemo(() => {
    const subset = latestTrips.slice(0, 20);
    const activeDrivers = new Set(subset.map(t => t.driverId)).size;
    const revenue = subset.reduce((acc, t) => acc + (t.status === 'Completed' ? t.amount : 0), 0);
    const completed = subset.filter(t => t.status === 'Completed').length;
    
    return {
      activeDrivers,
      revenue,
      completed,
      total: subset.length
    };
  }, [latestTrips]);

  // Platform activity from recent trips
  const platformActivity = useMemo(() => {
    const counts: Record<string, number> = { Uber: 0, Lyft: 0, Bolt: 0, Other: 0 };
    latestTrips.slice(0, 50).forEach(t => {
      const p = t.platform || 'Other';
      if (counts[p] !== undefined) counts[p]++;
      else counts['Other']++;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [latestTrips]);

  return (
    <div className="space-y-6">
      {/* Live Status Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-slate-900 text-slate-50 p-6 rounded-xl shadow-lg">
        <div>
           <div className="flex items-center gap-2 mb-1">
             <div className="relative flex h-3 w-3">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isLive ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
                <span className={`relative inline-flex rounded-full h-3 w-3 ${isLive ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
             </div>
             <h2 className="text-lg font-semibold tracking-tight">Fleet Operations Center</h2>
           </div>
           <p className="text-slate-400 text-sm">
             System Status: <span className="text-emerald-400 font-medium">Operational</span> • {currentTime.toLocaleTimeString()}
           </p>
        </div>
        
        <div className="flex items-center gap-6">
           <div className="text-center">
             <div className="text-2xl font-bold font-mono">{recentStats.activeDrivers}</div>
             <div className="text-xs text-slate-400 uppercase tracking-wider">Active Drivers</div>
           </div>
           <div className="h-8 w-px bg-slate-700"></div>
           <div className="text-center">
             <div className="text-2xl font-bold font-mono text-emerald-400">${recentStats.revenue.toFixed(0)}</div>
             <div className="text-xs text-slate-400 uppercase tracking-wider">Live Revenue</div>
           </div>
           <div className="h-8 w-px bg-slate-700"></div>
           <Button 
             variant={isLive ? "secondary" : "default"} 
             size="sm"
             onClick={() => setIsLive(!isLive)}
           >
             {isLive ? <Wifi className="mr-2 h-4 w-4" /> : <WifiOff className="mr-2 h-4 w-4" />}
             {isLive ? "Connected" : "Paused"}
           </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Live Feed Column */}
        <Card className="lg:col-span-2 flex flex-col h-[600px]">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-500" />
                Live Trip Feed
              </CardTitle>
              <CardDescription>Real-time incoming trip data stream</CardDescription>
            </div>
            <Button variant="ghost" size="icon">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 pt-0">
            <div className="rounded-md border h-full overflow-hidden flex flex-col">
              <div className="bg-slate-50 dark:bg-slate-900 border-b p-3 grid grid-cols-12 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                 <div className="col-span-2">Time</div>
                 <div className="col-span-2">Platform</div>
                 <div className="col-span-3">Driver ID</div>
                 <div className="col-span-2 text-right">Amount</div>
                 <div className="col-span-3 text-center">Status</div>
              </div>
              <ScrollArea className="flex-1">
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {latestTrips.map((trip) => (
                    <div key={trip.id} className="p-3 grid grid-cols-12 items-center text-sm hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors">
                       <div className="col-span-2 font-mono text-xs text-slate-500">
                         {new Date(trip.date).toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' })}
                       </div>
                       <div className="col-span-2">
                          <Badge variant="outline" className={`
                            ${trip.platform === 'Uber' ? 'border-slate-800 text-slate-800' : 
                              trip.platform === 'Lyft' ? 'border-pink-500 text-pink-600' : 
                              'border-indigo-500 text-indigo-600'}
                          `}>
                            {normalizePlatform(trip.platform)}
                          </Badge>
                       </div>
                       <div className="col-span-3 font-medium truncate pr-2" title={trip.driverId}>
                         {trip.driverId}
                       </div>
                       <div className="col-span-2 text-right font-mono font-medium">
                         ${trip.amount.toFixed(2)}
                       </div>
                       <div className="col-span-3 flex justify-center">
                         {trip.status === 'Completed' ? (
                           <span className="flex items-center text-emerald-600 text-xs font-medium">
                             <CheckCircle2 className="h-3 w-3 mr-1" /> Done
                           </span>
                         ) : trip.status === 'Cancelled' ? (
                           <span className="flex items-center text-rose-600 text-xs font-medium">
                             <XCircle className="h-3 w-3 mr-1" /> Cancelled
                           </span>
                         ) : (
                           <span className="flex items-center text-amber-600 text-xs font-medium">
                             <Activity className="h-3 w-3 mr-1" /> Active
                           </span>
                         )}
                       </div>
                    </div>
                  ))}
                  {latestTrips.length === 0 && (
                    <div className="p-8 text-center text-slate-400">
                      No live data available. Import trips to see activity.
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </CardContent>
        </Card>

        {/* Right Column: Health & Activity */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Platform Activity</CardTitle>
              <CardDescription>Live volume by provider</CardDescription>
            </CardHeader>
            <CardContent>
               <div className="h-[200px] flex justify-center overflow-x-auto">
                 <div style={{ minWidth: '300px' }}>
                   <BarChart width={300} height={200} data={platformActivity}>
                     <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                     <YAxis hide />
                     <Tooltip 
                       cursor={{ fill: 'transparent' }}
                       contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                     />
                     <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {platformActivity.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={
                            entry.name === 'Uber' ? '#1f2937' : 
                            entry.name === 'Lyft' ? '#ec4899' : 
                            '#6366f1'
                          } />
                        ))}
                     </Bar>
                   </BarChart>
                 </div>
               </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}