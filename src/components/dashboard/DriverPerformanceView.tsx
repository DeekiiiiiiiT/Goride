import React, { useMemo } from 'react';
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
  ZAxis
} from 'recharts';
import { Trip } from '../../types/data';
import { Users, Award, TrendingUp, Zap } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Avatar, AvatarFallback } from "../ui/avatar";

interface DriverPerformanceViewProps {
  trips: Trip[];
}

export function DriverPerformanceView({ trips }: DriverPerformanceViewProps) {
  // Driver Metrics Calculation
  const { driverStats, topDriversByRevenue, scatterData } = useMemo(() => {
    const stats: Record<string, { 
      id: string, 
      revenue: number, 
      trips: number, 
      platforms: Set<string>,
      lastActive: Date
    }> = {};

    trips.forEach(t => {
      if (t.status !== 'Completed') return;
      
      if (!stats[t.driverId]) {
        stats[t.driverId] = { 
          id: t.driverId, 
          revenue: 0, 
          trips: 0, 
          platforms: new Set(),
          lastActive: new Date(0)
        };
      }
      
      const driver = stats[t.driverId];
      driver.revenue += t.amount;
      driver.trips += 1;
      driver.platforms.add(t.platform);
      
      const tripDate = new Date(t.date);
      if (tripDate > driver.lastActive) {
        driver.lastActive = tripDate;
      }
    });

    const driverArray = Object.values(stats).map(d => ({
      ...d,
      avgPerTrip: d.revenue / d.trips,
      platformCount: d.platforms.size,
      topPlatform: Array.from(d.platforms)[0] // Simplified
    }));

    // Sort by revenue for top drivers
    const topByRevenue = [...driverArray]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
      .map(d => ({
        name: d.id, // Using ID as name since we don't have names
        revenue: d.revenue
      }));

    // Scatter plot data: x=trips, y=revenue, z=avgPerTrip
    const scatter = driverArray.map(d => ({
      x: d.trips,
      y: d.revenue,
      z: d.avgPerTrip,
      name: d.id
    }));

    return {
      driverStats: driverArray.sort((a, b) => b.revenue - a.revenue), // Default sort by revenue for table
      topDriversByRevenue: topByRevenue,
      scatterData: scatter
    };
  }, [trips]);

  const totalDrivers = driverStats.length;
  const avgRevenuePerDriver = totalDrivers > 0 
    ? driverStats.reduce((acc, d) => acc + d.revenue, 0) / totalDrivers 
    : 0;
  
  // Find "Most Efficient" driver (highest avg per trip with min 5 trips)
  const efficientDriver = driverStats
    .filter(d => d.trips > 5)
    .sort((a, b) => b.avgPerTrip - a.avgPerTrip)[0];

  return (
    <div className="space-y-6">
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
          value={driverStats[0]?.id || 'N/A'}
          icon={<Award className="h-4 w-4 text-amber-500" />}
          subtext={`Generated $${driverStats[0]?.revenue.toFixed(2) || 0}`}
        />
        <MetricCard 
          title="Most Efficient"
          value={efficientDriver?.id || 'N/A'}
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
                  <TableHead>Trips</TableHead>
                  <TableHead>Avg / Trip</TableHead>
                  <TableHead>Platforms</TableHead>
                  <TableHead className="text-right">Last Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {driverStats.slice(0, 10).map((driver) => (
                  <TableRow key={driver.id}>
                    <TableCell className="font-medium flex items-center gap-2">
                       <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-[10px] bg-indigo-100 text-indigo-700">
                            {driver.id.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate max-w-[120px]" title={driver.id}>{driver.id}</span>
                    </TableCell>
                    <TableCell>${driver.revenue.toFixed(2)}</TableCell>
                    <TableCell>{driver.trips}</TableCell>
                    <TableCell>${driver.avgPerTrip.toFixed(2)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {Array.from(driver.platforms).map(p => (
                          <span key={p} className="text-[10px] px-1.5 py-0.5 bg-slate-100 rounded text-slate-600 border border-slate-200">
                            {p}
                          </span>
                        ))}
                      </div>
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
