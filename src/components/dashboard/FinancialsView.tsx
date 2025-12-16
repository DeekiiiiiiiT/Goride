import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  Line,
  ComposedChart
} from 'recharts';
import { Trip } from '../../types/data';
import { DollarSign, TrendingUp, Wallet } from "lucide-react";

interface FinancialsViewProps {
  trips: Trip[];
}

export function FinancialsView({ trips }: FinancialsViewProps) {
  // Financial Metrics Calculation
  const metrics = useMemo(() => {
    const totalRevenue = trips.reduce((sum, t) => sum + (t.status === 'Completed' ? t.amount : 0), 0);
    const completedTrips = trips.filter(t => t.status === 'Completed');
    const avgRevenuePerTrip = completedTrips.length > 0 ? totalRevenue / completedTrips.length : 0;
    
    // Group by Platform
    const platformStats: Record<string, { revenue: number, count: number }> = {};
    trips.forEach(t => {
      if (t.status !== 'Completed') return;
      if (!platformStats[t.platform]) platformStats[t.platform] = { revenue: 0, count: 0 };
      platformStats[t.platform].revenue += t.amount;
      platformStats[t.platform].count += 1;
    });

    // Find best platform
    let bestPlatform = 'N/A';
    let maxRev = 0;
    Object.entries(platformStats).forEach(([p, stats]) => {
      if (stats.revenue > maxRev) {
        maxRev = stats.revenue;
        bestPlatform = p;
      }
    });

    return {
      totalRevenue,
      avgRevenuePerTrip,
      bestPlatform,
      platformStats
    };
  }, [trips]);

  // Daily Revenue & Trip Count Data for Composed Chart
  const chartData = useMemo(() => {
    const dailyMap = new Map<string, { date: string, revenue: number, trips: number }>();
    
    // Sort trips chronologically
    const sorted = [...trips].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    sorted.forEach(t => {
      if (t.status !== 'Completed') return;
      const dateStr = new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
      if (!dailyMap.has(dateStr)) {
        dailyMap.set(dateStr, { date: dateStr, revenue: 0, trips: 0 });
      }
      const entry = dailyMap.get(dateStr)!;
      entry.revenue += t.amount;
      entry.trips += 1;
    });

    // Take last 14 days if available, or all
    return Array.from(dailyMap.values()).slice(-14);
  }, [trips]);

  return (
    <div className="space-y-6">
      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard 
          title="Total Earnings"
          value={`$${metrics.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          icon={<DollarSign className="h-4 w-4 text-emerald-600" />}
          subtext="Gross revenue across all platforms"
        />
        <MetricCard 
          title="Avg. Trip Fare"
          value={`$${metrics.avgRevenuePerTrip.toFixed(2)}`}
          icon={<Wallet className="h-4 w-4 text-indigo-600" />}
          subtext="Average earnings per completed ride"
        />
        <MetricCard 
          title="Top Platform"
          value={metrics.bestPlatform}
          icon={<TrendingUp className="h-4 w-4 text-blue-600" />}
          subtext="Highest revenue source"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart: Revenue vs Volume */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Revenue vs. Trip Volume</CardTitle>
            <CardDescription>
              Daily comparison of gross revenue and number of trips (Last 14 Days).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[350px] w-full overflow-x-auto flex justify-center">
              {chartData.length > 0 ? (
                <div style={{ minWidth: '600px' }}>
                  <ComposedChart width={700} height={350} data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis 
                      dataKey="date" 
                      stroke="#64748b" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false} 
                    />
                    <YAxis 
                      yAxisId="left" 
                      stroke="#64748b" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false} 
                      tickFormatter={(value) => `$${value}`}
                    />
                    <YAxis 
                      yAxisId="right" 
                      orientation="right" 
                      stroke="#64748b" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false}
                    />
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Legend verticalAlign="top" height={36}/>
                    <Bar yAxisId="left" dataKey="revenue" name="Revenue" fill="#4f46e5" radius={[4, 4, 0, 0]} barSize={30} />
                    <Line yAxisId="right" type="monotone" dataKey="trips" name="Trip Count" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} />
                  </ComposedChart>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400">
                  No data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Platform Breakdown */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Platform Performance</CardTitle>
            <CardDescription>Revenue share by provider.</CardDescription>
          </CardHeader>
          <CardContent>
             <div className="space-y-6">
               {Object.entries(metrics.platformStats).map(([platform, stats]) => (
                 <div key={platform} className="space-y-2">
                   <div className="flex items-center justify-between text-sm">
                     <span className="font-medium text-slate-700 dark:text-slate-300">{platform}</span>
                     <span className="text-slate-900 dark:text-slate-100 font-bold">${stats.revenue.toFixed(2)}</span>
                   </div>
                   <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                     <div 
                        className={`h-full rounded-full ${
                          platform === 'Uber' ? 'bg-black' : 
                          platform === 'Lyft' ? 'bg-pink-500' : 
                          'bg-indigo-500'
                        }`} 
                        style={{ width: `${(stats.revenue / metrics.totalRevenue) * 100}%` }} 
                     />
                   </div>
                   <div className="flex justify-between text-xs text-slate-500">
                     <span>{stats.count} trips</span>
                     <span>{((stats.revenue / metrics.totalRevenue) * 100).toFixed(1)}%</span>
                   </div>
                 </div>
               ))}
               {Object.keys(metrics.platformStats).length === 0 && (
                 <div className="text-center text-slate-400 py-8">No platform data</div>
               )}
             </div>
          </CardContent>
        </Card>
      </div>
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
        <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</div>
        <p className="text-xs text-slate-500 mt-1">
          {subtext}
        </p>
      </CardContent>
    </Card>
  );
}
