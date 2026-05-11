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
import { Users, Award, TrendingUp, Zap, Search, User, ChevronLeft, Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { usePerformanceReport } from '../../hooks/usePerformanceReport';
import { api } from '../../services/api';
import { toast } from 'sonner@2.0.3';

interface DriverPerformanceViewProps {
  trips?: Trip[];
  driverMetrics?: DriverMetrics[];
}

export function DriverPerformanceView({ trips: _ignored, driverMetrics = [] }: DriverPerformanceViewProps) {
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  
  // Phase 6.1 & 6.2: Use the hook with summaryOnly and pagination
  const { 
    data: reportData, 
    loading, 
    loadingMore, 
    loadMore, 
    hasMore,
    dateRange
  } = usePerformanceReport({ 
    summaryOnly: true, 
    limit: 20 
  });

  // State for detailed history when a driver is selected
  const [detailedHistory, setDetailedHistory] = useState<{ date: string, val: number }[] | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Fetch details on selection
  React.useEffect(() => {
    if (selectedDriverId) {
        setLoadingDetails(true);
        // Fetch specific trips for this driver to build the history chart
        api.getTripsFiltered({ 
            driverId: selectedDriverId,
            startDate: dateRange.from.toISOString(),
            endDate: dateRange.to.toISOString(),
            limit: 500
        }).then(response => {
             const trips = response.data;
             const dailyMap = new Map<string, number>();
             trips.forEach(t => {
                if (t.status === 'Completed' || t.status === 'completed') {
                    const d = new Date(t.date).toLocaleDateString();
                    dailyMap.set(d, (dailyMap.get(d)||0) + (t.amount || 0));
                }
             });
             const chartData = Array.from(dailyMap.entries())
                .map(([date, val]) => ({ date, val }))
                .sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
             setDetailedHistory(chartData);
        }).catch(err => {
            console.error("Failed to fetch driver details", err);
            toast.error("Could not load driver history");
            setDetailedHistory([]);
        }).finally(() => {
            setLoadingDetails(false);
        });
    } else {
        setDetailedHistory(null);
    }
  }, [selectedDriverId, dateRange]);

  // --- Aggregate Data for Leaderboard (Merged with Metrics for Tier) ---
  const { driverStats, topDriversByRevenue, scatterData } = useMemo(() => {
    const processed = reportData.map(summary => {
        // Find matching metric for Tier info
        const metric = driverMetrics.find(m => m.driverId === summary.driverId);
        
        return {
            id: summary.driverId,
            name: summary.driverName,
            revenue: summary.totalEarnings,
            trips: summary.totalTrips,
            // Cash collected is not in summary, try metric or default 0
            cashCollected: metric?.cashCollected || 0, 
            avgPerTrip: summary.totalTrips > 0 ? summary.totalEarnings / summary.totalTrips : 0,
            tier: metric?.tier || 'Bronze',
            score: summary.successRate, // Use success rate as score for now, or metric.score
            lastActive: new Date(), // We don't have lastActive in summary, assume recent
            successRate: summary.successRate
        };
    });

    // Client-side sort to ensure "Leaderboard" feel even if chunks are random
    processed.sort((a, b) => b.revenue - a.revenue);

    const topByRevenue = processed.slice(0, 5).map(d => ({
        name: d.name || d.id.substring(0, 8),
        revenue: d.revenue
    }));

    const scatter = processed.map(d => ({
        x: d.trips,
        y: d.revenue,
        z: d.avgPerTrip,
        name: d.name || d.id
    }));

    return {
        driverStats: processed,
        topDriversByRevenue: topByRevenue,
        scatterData: scatter
    };
  }, [reportData, driverMetrics]);


  // --- Specific Driver Data ---
  const selectedDriverData = useMemo(() => {
      if (!selectedDriverId) return null;
      const stats = driverStats.find(d => d.id === selectedDriverId);
      if (!stats) return null;

      // Find metric for other fields
      const metrics = driverMetrics.find(d => d.driverId === selectedDriverId);

      return {
          ...stats,
          historyChart: detailedHistory || [],
          acceptance: (metrics?.acceptanceRate || 0) * 100,
          cancellation: (metrics?.cancellationRate || 0) * 100,
          completion: (metrics?.completionRate || 0) * 100,
          rating: metrics?.ratingLast500 || 5.0,
          utilization: metrics?.onlineHours ? ((metrics.onTripHours / metrics.onlineHours) * 100) : 0
      };
  }, [selectedDriverId, driverStats, driverMetrics, detailedHistory]);


  if (selectedDriverId && selectedDriverData) {
      // --- VIEW 2: SINGLE DRIVER PROFILE ---
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
                      Success Rate: {selectedDriverData.score}%
                  </Badge>
              </div>

              {/* Performance Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  <MetricCard title="Acceptance" value={`${selectedDriverData.acceptance.toFixed(0)}%`} icon={<Zap className="h-4 w-4" />} subtext="Target: 85%" />
                  <MetricCard title="Cancellation" value={`${selectedDriverData.cancellation.toFixed(1)}%`} icon={<Users className="h-4 w-4" />} subtext="Target: <5%" />
                  <MetricCard title="Completion" value={`${selectedDriverData.completion.toFixed(0)}%`} icon={<Award className="h-4 w-4" />} subtext="Target: 95%" />
                  <MetricCard title="Rating" value={selectedDriverData.rating.toFixed(2)} icon={<Award className="h-4 w-4" />} subtext="Target: 4.8" />
                  <MetricCard title="Total Earnings" value={`$${selectedDriverData.revenue.toFixed(0)}`} icon={<TrendingUp className="h-4 w-4" />} subtext="Gross Revenue" />
                  <MetricCard title="Cash Exposure" value={`$${selectedDriverData.cashCollected.toFixed(0)}`} icon={<Zap className="h-4 w-4 text-orange-500" />} subtext="Needs Deposit" />
              </div>

              {/* Charts */}
              <Card>
                  <CardHeader>
                      <CardTitle>Performance History</CardTitle>
                      <CardDescription>Daily earnings trend (Last 30 Days)</CardDescription>
                  </CardHeader>
                  <CardContent>
                      <div className="h-[300px] w-full" style={{ minWidth: '300px' }}>
                          {loadingDetails ? (
                              <div className="h-full flex items-center justify-center">
                                  <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                              </div>
                          ) : (
                            <ResponsiveContainer width="100%" height="100%" minWidth={300} minHeight={200}>
                                <AreaChart data={selectedDriverData.historyChart}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="date" fontSize={12} tickLine={false} axisLine={false} />
                                    <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} />
                                    <Tooltip formatter={(v: any) => `$${Number(v).toFixed(2)}`} />
                                    <Area type="monotone" dataKey="val" stroke="#4f46e5" fill="#4f46e5" fillOpacity={0.1} />
                                </AreaChart>
                            </ResponsiveContainer>
                          )}
                      </div>
                  </CardContent>
              </Card>
          </div>
      );
  }

  // --- VIEW 1: FLEET LEADERBOARD ---
  const totalDrivers = driverStats.length;
  const avgRevenuePerDriver = totalDrivers > 0 
    ? driverStats.reduce((acc, d) => acc + d.revenue, 0) / totalDrivers 
    : 0;
  
  const efficientDriver = driverStats.length > 0 
    ? [...driverStats].sort((a, b) => b.avgPerTrip - a.avgPerTrip)[0]
    : null;

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
                             {d.name || d.id} ({d.tier})
                         </SelectItem>
                     ))}
                 </SelectContent>
             </Select>
          </div>
      </div>

      {loading && driverStats.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-500">
              <Loader2 className="h-8 w-8 animate-spin mb-4" />
              <p>Generating Performance Report...</p>
          </div>
      ) : (
        <>
            {/* Metrics Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard 
                title="Active Drivers"
                value={totalDrivers.toString()}
                icon={<Users className="h-4 w-4 text-indigo-600" />}
                subtext="In current report view"
                />
                <MetricCard 
                title="Avg Revenue"
                value={`$${avgRevenuePerDriver.toFixed(2)}`}
                icon={<TrendingUp className="h-4 w-4 text-emerald-600" />}
                subtext="Per driver (loaded)"
                />
                <MetricCard 
                title="Top Performer"
                value={driverStats[0]?.name || driverStats[0]?.id.substring(0,8) || 'N/A'}
                icon={<Award className="h-4 w-4 text-amber-500" />}
                subtext={`$${driverStats[0]?.revenue.toFixed(2) || 0}`}
                />
                <MetricCard 
                title="Most Efficient"
                value={efficientDriver?.name || efficientDriver?.id.substring(0,8) || 'N/A'}
                icon={<Zap className="h-4 w-4 text-blue-500" />}
                subtext={`Avg $${efficientDriver?.avgPerTrip.toFixed(2) || 0} / trip`}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top 5 Drivers Chart */}
                <Card>
                <CardHeader>
                    <CardTitle>Top Drivers by Revenue</CardTitle>
                    <CardDescription>Highest earning drivers (from loaded data)</CardDescription>
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
                    <CardTitle>Efficiency Matrix</CardTitle>
                    <CardDescription>Revenue vs. Trip Count</CardDescription>
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
                <CardTitle>Driver Performance</CardTitle>
                <CardDescription>Metrics for {driverStats.length} loaded drivers.</CardDescription>
                </CardHeader>
                <CardContent>
                <div className="rounded-md border mb-4">
                    <Table>
                    <TableHeader>
                        <TableRow>
                        <TableHead className="w-[100px]">Driver</TableHead>
                        <TableHead>Total Revenue</TableHead>
                        <TableHead>Cash Held</TableHead>
                        <TableHead>Trips</TableHead>
                        <TableHead>Avg / Trip</TableHead>
                        <TableHead>Tier</TableHead>
                        <TableHead className="text-right">Success Rate</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {driverStats.map((driver) => (
                        <TableRow key={driver.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setSelectedDriverId(driver.id)}>
                            <TableCell className="font-medium flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                                <AvatarFallback className="text-[10px] bg-indigo-100 text-indigo-700">
                                    {(driver.name || driver.id).substring(0, 2).toUpperCase()}
                                </AvatarFallback>
                                </Avatar>
                                <span className="truncate max-w-[120px]" title={driver.name || driver.id}>{driver.name || driver.id}</span>
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
                            <TableCell className="text-right text-xs">
                            <span className={driver.successRate >= 80 ? "text-emerald-600 font-bold" : "text-yellow-600"}>
                                {driver.successRate}%
                            </span>
                            </TableCell>
                        </TableRow>
                        ))}
                    </TableBody>
                    </Table>
                </div>
                
                {hasMore && (
                    <div className="flex justify-center pt-2">
                        <Button 
                            variant="outline" 
                            onClick={loadMore} 
                            disabled={loadingMore}
                            className="min-w-[150px]"
                        >
                            {loadingMore ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Loading...
                                </>
                            ) : (
                                "Load More Drivers"
                            )}
                        </Button>
                    </div>
                )}
                </CardContent>
            </Card>
        </>
      )}
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
