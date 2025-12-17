import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Badge } from "../ui/badge";
import { 
  Users, 
  DollarSign, 
  Car, 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle,
  Award,
  Clock,
  MapPin,
  XCircle
} from "lucide-react";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  PieChart, 
  Pie, 
  Cell, 
  Legend,
  BarChart,
  Bar
} from 'recharts';
import { 
    Trip, 
    DriverMetrics, 
    VehicleMetrics, 
    OrganizationMetrics, 
    TripAnalytics, 
    Notification
} from '../../types/data';
import { SafeResponsiveContainer as ResponsiveContainer } from '../ui/SafeResponsiveContainer';

interface ExecutiveDashboardProps {
  trips: Trip[];
  driverMetrics: DriverMetrics[];
  vehicleMetrics: VehicleMetrics[];
  organizationMetrics: OrganizationMetrics[];
  tripAnalytics?: TripAnalytics;
  notifications?: Notification[];
  periodLabel?: string; // e.g., "Today", "Last 7 Days"
}

const COLORS = {
  platinum: '#e5e4e2', // Platinum
  gold: '#fbbf24',     // Gold
  silver: '#94a3b8',   // Silver
  bronze: '#78350f',    // Bronze
  primary: '#4f46e5',
  success: '#10b981',
  danger: '#f43f5e',
  warning: '#f59e0b'
};

export function ExecutiveDashboard({
  trips,
  driverMetrics,
  vehicleMetrics,
  organizationMetrics,
  tripAnalytics,
  notifications = [],
  periodLabel = "Today"
}: ExecutiveDashboardProps) {

  // --- 1. Top Row Metrics Calculation ---
  const kpi = useMemo(() => {
    // Fallback if organizationMetrics is empty
    const totalEarnings = organizationMetrics[0]?.totalEarnings ?? trips.reduce((sum, t) => sum + (t.amount || 0), 0);
    const activeDrivers = organizationMetrics[0]?.activeDrivers ?? new Set(trips.map(t => t.driverId)).size;
    const totalTrips = organizationMetrics[0]?.totalTrips ?? trips.length;
    
    // Calculate Fleet Score Average from DriverMetrics
    const totalScore = driverMetrics.reduce((sum, d) => sum + (d.score || 0), 0);
    const avgScore = driverMetrics.length > 0 ? (totalScore / driverMetrics.length) : 0;

    return { totalEarnings, activeDrivers, totalTrips, avgScore };
  }, [organizationMetrics, trips, driverMetrics]);

  // --- 2. Middle Row Charts Data ---
  
  // A. Driver Tiers Distribution (Pie)
  const tierData = useMemo(() => {
      const counts = { Platinum: 0, Gold: 0, Silver: 0, Bronze: 0 };
      driverMetrics.forEach(d => {
          if (d.tier && counts[d.tier] !== undefined) counts[d.tier]++;
          else counts.Bronze++; // Default
      });
      return [
          { name: 'Platinum', value: counts.Platinum, color: COLORS.platinum },
          { name: 'Gold', value: counts.Gold, color: COLORS.gold },
          { name: 'Silver', value: counts.Silver, color: COLORS.silver },
          { name: 'Bronze', value: counts.Bronze, color: COLORS.bronze },
      ].filter(d => d.value > 0);
  }, [driverMetrics]);

  // B. Daily Earnings Trend (Line)
  const earningsTrend = useMemo(() => {
      const dailyMap = new Map<string, number>();
      // Sort trips by date
      const sorted = [...trips].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      sorted.forEach(t => {
          const d = new Date(t.date).toLocaleDateString('en-US', { weekday: 'short' }); // e.g. "Mon"
          dailyMap.set(d, (dailyMap.get(d) || 0) + (t.amount || 0));
      });
      
      return Array.from(dailyMap.entries()).map(([name, value]) => ({ name, value }));
  }, [trips]);

  // C. Top 5 Drivers (Bar)
  const topDrivers = useMemo(() => {
      // Use driverMetrics if available (pre-aggregated), else aggregate from trips
      if (driverMetrics.length > 0) {
          return [...driverMetrics]
              .sort((a, b) => (b.totalEarnings || 0) - (a.totalEarnings || 0))
              .slice(0, 5)
              .map(d => ({
                  name: d.driverName.split(' ')[0], // First name only for space
                  earnings: d.totalEarnings || 0
              }));
      } else {
          const map = new Map<string, number>();
           trips.forEach(t => {
               map.set(t.driverId, (map.get(t.driverId) || 0) + (t.amount || 0));
           });
           return Array.from(map.entries())
               .sort((a, b) => b[1] - a[1])
               .slice(0, 5)
               .map(([id, earnings]) => ({ name: id.substring(0,6), earnings }));
      }
  }, [driverMetrics, trips]);


  // --- 3. Bottom Row Lists ---
  const lowPerformers = useMemo(() => {
      return driverMetrics
        .filter(d => (d.score || 0) < 70) // Below Silver
        .sort((a, b) => (a.score || 0) - (b.score || 0))
        .slice(0, 5);
  }, [driverMetrics]);

  return (
    <div className="space-y-6">
      
      {/* --- TOP ROW: KPI CARDS --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard 
            title="Total Earnings" 
            value={`$${kpi.totalEarnings.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
            icon={<DollarSign className="h-4 w-4 text-emerald-600" />}
            subtitle={periodLabel}
            trend="+12% vs last period" // Placeholder for now
            trendUp={true}
        />
        <KpiCard 
            title="Active Drivers" 
            value={kpi.activeDrivers.toString()}
            icon={<Users className="h-4 w-4 text-indigo-600" />}
            subtitle="Currently Online"
        />
        <KpiCard 
            title="Trips Completed" 
            value={kpi.totalTrips.toString()}
            icon={<Car className="h-4 w-4 text-blue-600" />}
            subtitle={periodLabel}
        />
        <KpiCard 
            title="Fleet Score Avg" 
            value={kpi.avgScore.toFixed(1)}
            icon={<Award className="h-4 w-4 text-amber-600" />}
            subtitle="Target: 85.0"
            trend={kpi.avgScore > 80 ? "Good" : "Needs Attention"}
            trendUp={kpi.avgScore > 80}
        />
      </div>

      {/* --- MIDDLE ROW: CHARTS --- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Driver Distribution (Pie) - 3 Cols */}
          <Card className="lg:col-span-3">
              <CardHeader>
                  <CardTitle className="text-sm font-medium">Driver Tiers</CardTitle>
              </CardHeader>
              <CardContent className="flex justify-center">
                  <div className="h-[200px] w-full" style={{ minWidth: '200px' }}>
                    <ResponsiveContainer width="100%" height="100%" minWidth={200} minHeight={200}>
                        <PieChart>
                            <Pie
                                data={tierData}
                                cx="50%"
                                cy="50%"
                                innerRadius={40}
                                outerRadius={60}
                                paddingAngle={5}
                                dataKey="value"
                            >
                                {tierData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Pie>
                            <Tooltip />
                            <Legend verticalAlign="bottom" height={36} iconSize={8} />
                        </PieChart>
                    </ResponsiveContainer>
                  </div>
              </CardContent>
          </Card>

          {/* Daily Earnings (Area) - 6 Cols */}
          <Card className="lg:col-span-6">
              <CardHeader>
                  <CardTitle className="text-sm font-medium">Daily Revenue Trend</CardTitle>
                  <CardDescription>Last 7 Days Performance</CardDescription>
              </CardHeader>
              <CardContent>
                  <div className="h-[200px] w-full" style={{ minWidth: '300px' }}>
                    <ResponsiveContainer width="100%" height="100%" minWidth={300} minHeight={200}>
                        <AreaChart data={earningsTrend}>
                            <defs>
                                <linearGradient id="colorEarn" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={12} />
                            <YAxis axisLine={false} tickLine={false} fontSize={12} tickFormatter={(v) => `$${v}`} />
                            <Tooltip formatter={(v) => `$${Number(v).toFixed(0)}`} />
                            <Area type="monotone" dataKey="value" stroke={COLORS.primary} fillOpacity={1} fill="url(#colorEarn)" />
                        </AreaChart>
                    </ResponsiveContainer>
                  </div>
              </CardContent>
          </Card>

          {/* Top Drivers (Bar) - 3 Cols */}
          <Card className="lg:col-span-3">
              <CardHeader>
                  <CardTitle className="text-sm font-medium">Top Earners</CardTitle>
              </CardHeader>
              <CardContent>
                  <div className="h-[200px] w-full" style={{ minWidth: '200px' }}>
                      <ResponsiveContainer width="100%" height="100%" minWidth={200} minHeight={200}>
                          <BarChart data={topDrivers} layout="vertical" margin={{ left: 0 }}>
                              <XAxis type="number" hide />
                              <YAxis dataKey="name" type="category" width={50} tick={{fontSize: 11}} axisLine={false} tickLine={false} />
                              <Tooltip cursor={{fill: 'transparent'}} formatter={(v) => `$${v}`} />
                              <Bar dataKey="earnings" fill={COLORS.success} radius={[0, 4, 4, 0]} barSize={20} />
                          </BarChart>
                      </ResponsiveContainer>
                  </div>
              </CardContent>
          </Card>
      </div>

      {/* --- BOTTOM ROW: ALERTS & LISTS --- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* 1. Alerts List */}
          <Card>
              <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      Priority Alerts
                  </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                  {notifications.filter(n => n.type === 'alert').length > 0 ? (
                      notifications.filter(n => n.type === 'alert').slice(0, 3).map(n => (
                          <div key={n.id} className="flex gap-3 items-start p-2 rounded bg-amber-50 text-amber-900 border border-amber-100">
                              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                              <div>
                                  <p className="text-sm font-semibold">{n.title}</p>
                                  <p className="text-xs opacity-90">{n.message}</p>
                              </div>
                          </div>
                      ))
                  ) : (
                      <div className="text-center py-6 text-slate-400 text-sm">No active alerts</div>
                  )}
              </CardContent>
          </Card>

          {/* 2. Cancellations (or Trip Analysis) */}
          <Card>
              <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-rose-500" />
                      Cancellation Issues
                  </CardTitle>
              </CardHeader>
              <CardContent>
                  {tripAnalytics?.cancellations?.byHour && tripAnalytics.cancellations.byHour.length > 0 ? (
                      <div className="space-y-3">
                          <div className="flex justify-between text-sm text-slate-500 mb-2">
                              <span>Total Rate</span>
                              <span className="font-bold text-rose-600">{tripAnalytics.cancellations.rate.toFixed(1)}%</span>
                          </div>
                          <p className="text-xs font-medium text-slate-700">Worst Hours (Freq):</p>
                          <div className="space-y-2">
                              {tripAnalytics.cancellations.byHour.slice(0, 3).map(h => (
                                  <div key={h.hour} className="flex items-center justify-between text-sm">
                                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {h.hour}:00 - {h.hour+1}:00</span>
                                      <Badge variant="outline" className="text-rose-600 border-rose-200">{h.count} cancelled</Badge>
                                  </div>
                              ))}
                          </div>
                      </div>
                  ) : (
                      <div className="text-center py-6 text-slate-400 text-sm">No data available</div>
                  )}
              </CardContent>
          </Card>

           {/* 3. Low Performers */}
           <Card>
              <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-slate-500" />
                      Needs Attention
                  </CardTitle>
              </CardHeader>
              <CardContent>
                  {lowPerformers.length > 0 ? (
                      <div className="space-y-3">
                          {lowPerformers.map(d => (
                              <div key={d.id} className="flex justify-between items-center border-b last:border-0 pb-2 last:pb-0">
                                  <div>
                                      <p className="text-sm font-medium">{d.driverName}</p>
                                      <p className="text-xs text-slate-500">Tier: {d.tier || 'N/A'}</p>
                                  </div>
                                  <div className="text-right">
                                      <span className={`text-sm font-bold ${
                                          (d.score || 0) < 50 ? 'text-rose-600' : 'text-amber-600'
                                      }`}>
                                          {d.score}
                                      </span>
                                      <p className="text-[10px] text-slate-400">Score</p>
                                  </div>
                              </div>
                          ))}
                      </div>
                  ) : (
                      <div className="text-center py-6 text-slate-400 text-sm">All drivers performing well!</div>
                  )}
              </CardContent>
          </Card>
      </div>
    </div>
  );
}

function KpiCard({ title, value, icon, subtitle, trend, trendUp }: any) {
    return (
        <Card>
            <CardContent className="p-6">
                <div className="flex items-center justify-between space-y-0 pb-2">
                    <p className="text-sm font-medium text-slate-500">{title}</p>
                    {icon}
                </div>
                <div className="flex items-baseline justify-between pt-1">
                    <h3 className="text-2xl font-bold text-slate-900">{value}</h3>
                </div>
                <div className="mt-2 flex items-center text-xs">
                    {trend && (
                        <span className={`flex items-center font-medium ${trendUp ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {trendUp ? <TrendingUp className="mr-1 h-3 w-3" /> : <TrendingDown className="mr-1 h-3 w-3" />}
                            {trend}
                        </span>
                    )}
                    <span className={`text-slate-500 ${trend ? 'ml-2' : ''}`}>{subtitle}</span>
                </div>
            </CardContent>
        </Card>
    )
}
