import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ScatterChart,
  Scatter,
  ZAxis,
  AreaChart,
  Area
} from 'recharts';
import { SafeResponsiveContainer as ResponsiveContainer } from '../ui/SafeResponsiveContainer';
import { Trip, DriverMetrics } from '../../types/data';
import { Users, Award, TrendingUp, Zap, Search, User, ChevronLeft } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";

interface DriverPerformanceViewProps {
  trips: Trip[];
  driverMetrics?: DriverMetrics[];
}

export function DriverPerformanceView({ trips, driverMetrics = [] }: DriverPerformanceViewProps) {
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);

  // --- Aggregate Data for Leaderboard ---
  const { driverStats, topDriversByRevenue, scatterData } = useMemo(() => {
    const stats: Record<string, { 
      id: string, 
      revenue: number, 
      cashCollected: number,
      trips: number, 
      platforms: Set<string>,
      lastActive: Date,
      score: number,
      tier: string
    }> = {};

    // 1. Init from Metrics if available (for score/tier)
    driverMetrics.forEach(dm => {
        stats[dm.driverId] = {
            id: dm.driverId,
            revenue: dm.totalEarnings || 0,
            cashCollected: dm.cashCollected || 0,
            trips: dm.tripsCompleted || 0,
            platforms: new Set(),
            lastActive: new Date(dm.periodEnd || 0),
            score: dm.score || 0,
            tier: dm.tier || 'Bronze'
        };
    });

    // 2. Supplement with Trip Data (for granular revenue/trips if metrics not fresh)
    trips.forEach(t => {
      if (t.status !== 'Completed') return;
      
      if (!stats[t.driverId]) {
        stats[t.driverId] = { 
          id: t.driverId, 
          revenue: 0, 
          cashCollected: 0,
          trips: 0, 
          platforms: new Set(),
          lastActive: new Date(0),
          score: 0,
          tier: 'Bronze'
        };
      }
      
      const driver = stats[t.driverId];
      driver.revenue += t.amount; // Cumulative logic might double count if metrics already has it. 
      // Assumption: metrics are pre-calculated period summaries. trips are raw. 
      // If we have metrics, use them? Or use trips for "real-time"?
      // For simplicity, let's use Trips for revenue/counts if metrics are empty, or override.
      // Actually, let's stick to Trips for the leaderboard to be dynamic.
      
      // Override revenue calc from trips to be safe
      if (driverMetrics.length === 0) {
          driver.revenue += t.amount;
          driver.cashCollected += (t.cashCollected || 0);
          driver.trips += 1;
      }
      
      driver.platforms.add(t.platform);
      
      const tripDate = new Date(t.date);
      if (tripDate > driver.lastActive) {
        driver.lastActive = tripDate;
      }
    });

    const driverArray = Object.values(stats).map(d => ({
      ...d,
      avgPerTrip: d.trips > 0 ? d.revenue / d.trips : 0,
      platformCount: d.platforms.size,
    }));

    // Sort by revenue
    const topByRevenue = [...driverArray]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
      .map(d => ({
        name: d.id.substring(0, 8),
        revenue: d.revenue
      }));

    // Scatter
    const scatter = driverArray.map(d => ({
      x: d.trips,
      y: d.revenue,
      z: d.avgPerTrip,
      name: d.id
    }));

    return {
      driverStats: driverArray.sort((a, b) => b.revenue - a.revenue),
      topDriversByRevenue: topByRevenue,
      scatterData: scatter
    };
  }, [trips, driverMetrics]);


  // --- Specific Driver Data ---
  const selectedDriverData = useMemo(() => {
      if (!selectedDriverId) return null;
      
      const metrics = driverMetrics.find(d => d.driverId === selectedDriverId);
      const driverTrips = trips.filter(t => t.driverId === selectedDriverId).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      // Calculate daily earnings for chart
      const dailyMap = new Map<string, number>();
      driverTrips.forEach(t => {
          if (t.status === 'Completed') {
              const d = new Date(t.date).toLocaleDateString();
              dailyMap.set(d, (dailyMap.get(d)||0) + t.amount);
          }
      });
      const historyChart = Array.from(dailyMap.entries()).map(([date, val]) => ({ date, val }));

      // Fallback calculations if metrics missing
      const earnings = metrics?.totalEarnings ?? driverTrips.reduce((acc, t) => acc + (t.status === 'Completed' ? t.amount : 0), 0);
      const cashCollected = metrics?.cashCollected ?? driverTrips.reduce((acc, t) => acc + (t.status === 'Completed' ? (t.cashCollected || 0) : 0), 0);
      const tripsCount = metrics?.tripsCompleted ?? driverTrips.length;
      
      return {
          id: selectedDriverId,
          name: metrics?.driverName || selectedDriverId,
          tier: metrics?.tier || 'Bronze',
          score: metrics?.score || 0,
          earnings,
          cashCollected,
          tripsCount,
          historyChart,
          acceptance: (metrics?.acceptanceRate || 0) * 100,
          cancellation: (metrics?.cancellationRate || 0) * 100,
          completion: (metrics?.completionRate || 0) * 100,
          rating: metrics?.ratingLast500 || 5.0,
          utilization: metrics?.onlineHours ? ((metrics.onTripHours / metrics.onlineHours) * 100) : 0
      };
  }, [selectedDriverId, driverMetrics, trips]);


  if (selectedDriverId && selectedDriverData) {
      // --- VIEW 2: SINGLE DRIVER PROFILE (Phase 7.2) ---
      return (
          <div className="space-y-6">
              <div className="flex items-center gap-4">
                  <Button variant="outline" size="icon" onClick={() => setSelectedDriverId(null)}>
                      <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <h2 className="text-2xl font-bold text-slate-900">{selectedDriverData.name}</h2>
                  <Badge variant="outline" className={`
                    ${selectedDriverData.tier === 'Platinum' ? 'bg-slate-100 text-slate-800 border-slate-300' : 
                      selectedDriverData.tier === 'Gold' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      selectedDriverData.tier === 'Silver' ? 'bg-slate-50 text-slate-600 border-slate-200' :
                      'bg-orange-50 text-orange-800 border-orange-200'}
                  `}>
                      {selectedDriverData.tier} Tier
                  </Badge>
                  <Badge className={selectedDriverData.score >= 80 ? 'bg-emerald-100 text-emerald-800' : 'bg-yellow-100 text-yellow-800'}>
                      Score: {selectedDriverData.score}
                  </Badge>
              </div>

              {/* Performance Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  <MetricCard title="Acceptance" value={`${selectedDriverData.acceptance.toFixed(0)}%`} icon={<Zap className="h-4 w-4" />} subtext="Target: 85%" />
                  <MetricCard title="Cancellation" value={`${selectedDriverData.cancellation.toFixed(1)}%`} icon={<Users className="h-4 w-4" />} subtext="Target: <5%" />
                  <MetricCard title="Completion" value={`${selectedDriverData.completion.toFixed(0)}%`} icon={<Award className="h-4 w-4" />} subtext="Target: 95%" />
                  <MetricCard title="Rating" value={selectedDriverData.rating.toFixed(2)} icon={<Award className="h-4 w-4" />} subtext="Target: 4.8" />
                  <MetricCard title="Total Earnings" value={`$${selectedDriverData.earnings.toFixed(0)}`} icon={<TrendingUp className="h-4 w-4" />} subtext="Gross Revenue" />
                  <MetricCard title="Cash Exposure" value={`$${selectedDriverData.cashCollected.toFixed(0)}`} icon={<Zap className="h-4 w-4 text-orange-500" />} subtext="Needs Deposit" />
                  <MetricCard title="Utilization" value={`${selectedDriverData.utilization.toFixed(0)}%`} icon={<Zap className="h-4 w-4" />} subtext="Target: 60%" />
              </div>

              {/* Charts */}
              <Card>
                  <CardHeader>
                      <CardTitle>Performance History</CardTitle>
                      <CardDescription>Daily earnings trend (Last 30 Days)</CardDescription>
                  </CardHeader>
                  <CardContent>
                      <div className="h-[300px] w-full" style={{ minWidth: '300px' }}>
                          <ResponsiveContainer width="100%" height="100%" minWidth={300} minHeight={200}>
                              <AreaChart data={selectedDriverData.historyChart}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                  <XAxis dataKey="date" fontSize={12} tickLine={false} axisLine={false} />
                                  <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} />
                                  <Tooltip formatter={v => `$${Number(v).toFixed(2)}`} />
                                  <Area type="monotone" dataKey="val" stroke="#4f46e5" fill="#4f46e5" fillOpacity={0.1} />
                              </AreaChart>
                          </ResponsiveContainer>
                      </div>
                  </CardContent>
              </Card>
          </div>
      );
  }

  // --- VIEW 1: FLEET LEADERBOARD (Original + Select) ---
  const totalDrivers = driverStats.length;
  const avgRevenuePerDriver = totalDrivers > 0 
    ? driverStats.reduce((acc, d) => acc + d.revenue, 0) / totalDrivers 
    : 0;
  
  const efficientDriver = driverStats
    .filter(d => d.trips > 5)
    .sort((a, b) => b.avgPerTrip - a.avgPerTrip)[0];

  return (
    <div className="space-y-6">
      
      {/* Driver Selection Header */}
      <div className="flex justify-between items-center bg-slate-50 p-4 rounded-lg border border-slate-200">
          <div>
              <h3 className="font-medium text-slate-900">Driver Lookup</h3>
              <p className="text-sm text-slate-500">View detailed scorecard for any driver</p>
          </div>
          <div className="w-[300px]">
             <Select onValueChange={setSelectedDriverId}>
                 <SelectTrigger>
                     <SelectValue placeholder="Select a driver..." />
                 </SelectTrigger>
                 <SelectContent>
                     {driverStats.map(d => (
                         <SelectItem key={d.id} value={d.id}>
                             {d.id} ({d.tier})
                         </SelectItem>
                     ))}
                 </SelectContent>
             </Select>
          </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard 
          title="Total Active Drivers"
          value={totalDrivers.toString()}
          icon={<Users className="h-4 w-4 text-indigo-600" />}
          subtext="Drivers with completed trips"
        />
        <MetricCard 
          title="Avg Revenue / Driver"
          value={`$${avgRevenuePerDriver.toFixed(2)}`}
          icon={<TrendingUp className="h-4 w-4 text-emerald-600" />}
          subtext="Per active driver period"
        />
        <MetricCard 
          title="Top Performer"
          value={driverStats[0]?.id.substring(0,8) || 'N/A'}
          icon={<Award className="h-4 w-4 text-amber-500" />}
          subtext={`Generated $${driverStats[0]?.revenue.toFixed(2) || 0}`}
        />
        <MetricCard 
          title="Most Efficient"
          value={efficientDriver?.id.substring(0,8) || 'N/A'}
          icon={<Zap className="h-4 w-4 text-blue-500" />}
          subtext={`Avg $${efficientDriver?.avgPerTrip.toFixed(2) || 0} / trip`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 5 Drivers Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Top 5 Drivers by Revenue</CardTitle>
            <CardDescription>Highest earning drivers for the selected period.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full overflow-x-auto flex justify-center">
              {topDriversByRevenue.length > 0 ? (
                <div style={{ minWidth: '400px' }}>
                  <BarChart width={500} height={300} data={topDriversByRevenue} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" hide />
                    <YAxis 
                      dataKey="name" 
                      type="category" 
                      width={100} 
                      tick={{ fontSize: 12 }} 
                      interval={0}
                    />
                    <Tooltip 
                      cursor={{ fill: 'transparent' }}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      formatter={(value: number) => [`$${value.toFixed(2)}`, 'Revenue']}
                    />
                    <Bar dataKey="revenue" fill="#4f46e5" radius={[0, 4, 4, 0]} barSize={30} />
                  </BarChart>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400">
                  No driver data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Efficiency Scatter Plot */}
        <Card>
          <CardHeader>
            <CardTitle>Driver Efficiency Matrix</CardTitle>
            <CardDescription>Revenue vs. Trip Count distribution.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full overflow-x-auto flex justify-center">
              {scatterData.length > 0 ? (
                 <div style={{ minWidth: '400px' }}>
                  <ScatterChart width={500} height={300} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis 
                      type="number" 
                      dataKey="x" 
                      name="Trips" 
                      unit=" rides" 
                      stroke="#888888" 
                      fontSize={12}
                    />
                    <YAxis 
                      type="number" 
                      dataKey="y" 
                      name="Revenue" 
                      unit="$" 
                      stroke="#888888" 
                      fontSize={12}
                    />
                    <ZAxis type="number" dataKey="z" range={[50, 400]} name="Avg/Trip" unit="$" />
                    <Tooltip 
                      cursor={{ strokeDasharray: '3 3' }} 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-white p-2 border rounded shadow-md text-xs">
                              <p className="font-bold">{data.name}</p>
                              <p>Revenue: ${data.y.toFixed(2)}</p>
                              <p>Trips: {data.x}</p>
                              <p>Avg: ${data.z.toFixed(2)}</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Scatter name="Drivers" data={scatterData} fill="#8884d8" />
                  </ScatterChart>
                 </div>
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400">
                  No driver data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Driver Leaderboard Table */}
      <Card>
        <CardHeader>
          <CardTitle>Driver Leaderboard</CardTitle>
          <CardDescription>Detailed performance metrics for all active drivers.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Driver</TableHead>
                  <TableHead>Total Revenue</TableHead>
                  <TableHead>Cash Held</TableHead>
                  <TableHead>Trips</TableHead>
                  <TableHead>Avg / Trip</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead className="text-right">Last Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {driverStats.slice(0, 10).map((driver) => (
                  <TableRow key={driver.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setSelectedDriverId(driver.id)}>
                    <TableCell className="font-medium flex items-center gap-2">
                       <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-[10px] bg-indigo-100 text-indigo-700">
                            {driver.id.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate max-w-[120px]" title={driver.id}>{driver.id}</span>
                    </TableCell>
                    <TableCell>${driver.revenue.toFixed(2)}</TableCell>
                    <TableCell className={driver.cashCollected > 100 ? "text-orange-600 font-medium" : ""}>
                        ${driver.cashCollected.toFixed(2)}
                    </TableCell>
                    <TableCell>{driver.trips}</TableCell>
                    <TableCell>${driver.avgPerTrip.toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">{driver.tier}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs text-slate-500">
                      {driver.lastActive.toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ title, value, icon, subtext }: { title: string, value: string, icon: React.ReactNode, subtext: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
          {title}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 truncate" title={value}>{value}</div>
        <p className="text-xs text-slate-500 mt-1">
          {subtext}
        </p>
      </CardContent>
    </Card>
  );
}
