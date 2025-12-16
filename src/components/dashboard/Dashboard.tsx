import React, { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { 
  Users, 
  DollarSign, 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  Car, 
  AlertCircle, 
  Calendar,
  Download,
  Loader2
} from "lucide-react";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "../ui/dropdown-menu";
import { api } from '../../services/api';
import { Trip, Notification } from '../../types/data';
import { exportToCSV } from '../../utils/csvHelpers';
import { FinancialsView } from './FinancialsView';
import { DriverPerformanceView } from './DriverPerformanceView';
import { RealTimeView } from './RealTimeView';

const COLORS = ['#4f46e5', '#818cf8', '#fbbf24', '#cbd5e1'];

export function Dashboard() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch trips independently
        try {
            const tripsData = await api.getTrips();
            setTrips(tripsData);
        } catch (tripErr: any) {
            console.error("Failed to load trips", tripErr);
            setError("Failed to load trips data");
        }

        // Fetch notifications independently so it doesn't block the dashboard
        try {
            const notificationsData = await api.getNotifications();
            setNotifications(notificationsData);
        } catch (notifErr: any) {
            console.error("Failed to load notifications", notifErr);
            // Don't set main error state, just log it. 
            // Or maybe show a toast? For now, we just let notifications be empty.
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const stats = useMemo(() => {
    const totalRevenue = trips.reduce((acc, t) => acc + (t.status === 'Completed' ? t.amount : 0), 0);
    const totalTrips = trips.length;
    const activeDrivers = new Set(trips.map(t => t.driverId)).size;
    
    // Calculate simple trends (mock logic for demo purposes as we don't have historical snapshots)
    const revenueTrend = "+12.5%"; 
    const tripsTrend = "+5.2%";
    const driversTrend = "+3.1%";

    return {
      totalRevenue,
      totalTrips,
      activeDrivers,
      revenueTrend,
      tripsTrend,
      driversTrend
    };
  }, [trips]);

  const earningsData = useMemo(() => {
    const dailyMap = new Map<string, number>();
    
    // Sort trips by date first
    const sortedTrips = [...trips].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    sortedTrips.forEach(t => {
      if (t.status !== 'Completed') return;
      const dateStr = new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      dailyMap.set(dateStr, (dailyMap.get(dateStr) || 0) + t.amount);
    });

    // If no data, return empty or last 7 days of 0
    if (dailyMap.size === 0) return [];

    // Return last 7 entries for the chart if we have enough data
    return Array.from(dailyMap.entries())
      .map(([name, revenue]) => ({ name, revenue }))
      .slice(-7);
  }, [trips]);

  const platformData = useMemo(() => {
    const counts: Record<string, number> = {};
    trips.forEach(t => {
      counts[t.platform] = (counts[t.platform] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [trips]);

  const handleExport = (type: 'trips' | 'financials' | 'drivers') => {
    if (type === 'trips') {
      exportToCSV(trips, `trips_export_${new Date().toISOString().split('T')[0]}`);
    } else if (type === 'financials') {
      const dailyMap = new Map<string, number>();
      trips.forEach(t => {
        if (t.status !== 'Completed') return;
        const dateStr = new Date(t.date).toLocaleDateString('en-US');
        dailyMap.set(dateStr, (dailyMap.get(dateStr) || 0) + t.amount);
      });
      const data = Array.from(dailyMap.entries()).map(([date, revenue]) => ({ date, revenue }));
      exportToCSV(data, `financials_export_${new Date().toISOString().split('T')[0]}`);
    } else if (type === 'drivers') {
      const driverStats: Record<string, any> = {};
      trips.forEach(t => {
        if (t.status !== 'Completed') return;
        if (!driverStats[t.driverId]) {
            driverStats[t.driverId] = { driverId: t.driverId, revenue: 0, trips: 0 };
        }
        driverStats[t.driverId].revenue += t.amount;
        driverStats[t.driverId].trips += 1;
      });
      const data = Object.values(driverStats).map(d => ({
          ...d,
          avgPerTrip: (d.revenue / d.trips).toFixed(2)
      }));
      exportToCSV(data, `driver_performance_${new Date().toISOString().split('T')[0]}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Dashboard</h2>
          <p className="text-slate-500 dark:text-slate-400">
            Overview of your fleet's performance and financial health.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline">
            <Calendar className="mr-2 h-4 w-4" />
            Last 7 Days
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <Download className="mr-2 h-4 w-4" />
                Download Report
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExport('trips')}>
                Raw Trip Data (CSV)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('financials')}>
                Financial Summary (CSV)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('drivers')}>
                Driver Performance (CSV)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="financials">Financials</TabsTrigger>
          <TabsTrigger value="drivers">Drivers</TabsTrigger>
          <TabsTrigger value="realtime">Real-time</TabsTrigger>
        </TabsList>
        
        <TabsContent value="financials" className="space-y-6">
          <FinancialsView trips={trips} />
        </TabsContent>

        <TabsContent value="drivers" className="space-y-6">
          <DriverPerformanceView trips={trips} />
        </TabsContent>

        <TabsContent value="realtime" className="space-y-6">
          <RealTimeView trips={trips} />
        </TabsContent>

        <TabsContent value="overview" className="space-y-6">
          {/* KPI Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard 
              title="Total Revenue" 
              value={`$${stats.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              icon={<DollarSign className="h-4 w-4 text-emerald-600" />}
              trend={stats.revenueTrend}
              trendUp={true}
              description="from last period"
            />
            <KpiCard 
              title="Active Drivers" 
              value={stats.activeDrivers.toLocaleString()} 
              icon={<Users className="h-4 w-4 text-indigo-600" />}
              trend={stats.driversTrend}
              trendUp={true}
              description="active in period"
            />
            <KpiCard 
              title="Total Trips" 
              value={stats.totalTrips.toLocaleString()} 
              icon={<Car className="h-4 w-4 text-blue-600" />}
              trend={stats.tripsTrend}
              trendUp={true}
              description="from last period"
            />
            <KpiCard 
              title="Fleet Utilization" 
              value="87%" 
              icon={<Activity className="h-4 w-4 text-orange-600" />}
              trend="-2.5%"
              trendUp={false}
              description="from last week"
            />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-7 gap-6">
            {/* Main Chart */}
            <Card className="lg:col-span-4">
              <CardHeader>
                <CardTitle>Revenue Overview</CardTitle>
                <CardDescription>
                  Daily revenue across all platforms.
                </CardDescription>
              </CardHeader>
              <CardContent className="pl-2">
                <div className="h-[300px] w-full overflow-x-auto flex justify-center">
                    {earningsData.length > 0 ? (
                      <div style={{ minWidth: '600px' }}>
                        <AreaChart width={800} height={300} data={earningsData}>
                        <defs>
                          <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <XAxis 
                          dataKey="name" 
                          stroke="#888888" 
                          fontSize={12} 
                          tickLine={false} 
                          axisLine={false} 
                        />
                        <YAxis 
                          stroke="#888888" 
                          fontSize={12} 
                          tickLine={false} 
                          axisLine={false} 
                          tickFormatter={(value) => `$${value}`} 
                        />
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <Tooltip 
                          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                          formatter={(value: number) => [`$${value.toFixed(2)}`, 'Revenue']}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="revenue" 
                          stroke="#4f46e5" 
                          strokeWidth={2}
                          fillOpacity={1} 
                          fill="url(#colorRevenue)" 
                        />
                      </AreaChart>
                      </div>
                    ) : (
                      <div className="h-[300px] flex items-center justify-center text-slate-400">
                        No revenue data available
                      </div>
                    )}
                </div>
              </CardContent>
            </Card>

            {/* Secondary Chart */}
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle>Platform Share</CardTitle>
                <CardDescription>
                  Trip volume distribution by provider.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full overflow-x-auto flex justify-center">
                    {platformData.length > 0 ? (
                      <div style={{ minWidth: '300px' }}>
                        <PieChart width={300} height={300}>
                        <Pie
                          data={platformData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          fill="#8884d8"
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {platformData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend verticalAlign="bottom" height={36}/>
                      </PieChart>
                      </div>
                    ) : (
                      <div className="h-[300px] flex items-center justify-center text-slate-400">
                        No platform data available
                      </div>
                    )}
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Bottom Row: Recent Activity & Alerts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Latest driver actions and system events.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {notifications
                    .filter(n => n.type !== 'alert')
                    .slice(0, 5)
                    .map((n) => (
                    <div key={n.id} className="flex items-center gap-4">
                      <div className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200">
                        {n.type === 'update' ? <DollarSign className="h-4 w-4 text-emerald-600" /> : <Users className="h-4 w-4 text-slate-500" />}
                      </div>
                      <div className="flex-1 space-y-1">
                        <p className="text-sm font-medium leading-none">{n.title}</p>
                        <p className="text-xs text-slate-500">{n.message}</p>
                      </div>
                      <div className="text-xs text-slate-400">
                          {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  ))}
                  {notifications.filter(n => n.type !== 'alert').length === 0 && (
                      <p className="text-sm text-slate-500 text-center py-4">No recent activity.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
               <CardHeader>
                <CardTitle>System Alerts</CardTitle>
                <CardDescription>Issues requiring immediate attention.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                   {notifications
                    .filter(n => n.type === 'alert')
                    .slice(0, 5)
                    .map((n) => (
                       <div key={n.id} className={`flex items-start gap-3 p-3 border rounded-md ${
                           n.severity === 'critical' ? 'bg-rose-50 border-rose-100' : 'bg-amber-50 border-amber-100'
                       }`}>
                         <AlertCircle className={`h-5 w-5 mt-0.5 ${
                             n.severity === 'critical' ? 'text-rose-500' : 'text-amber-500'
                         }`} />
                         <div>
                           <h4 className={`text-sm font-medium ${
                               n.severity === 'critical' ? 'text-rose-900' : 'text-amber-900'
                           }`}>{n.title}</h4>
                           <p className={`text-xs mt-1 ${
                               n.severity === 'critical' ? 'text-rose-700' : 'text-amber-700'
                           }`}>{n.message}</p>
                         </div>
                       </div>
                   ))}
                   {notifications.filter(n => n.type === 'alert').length === 0 && (
                      <div className="flex flex-col items-center justify-center py-6 text-slate-500">
                          <AlertCircle className="h-8 w-8 mb-2 text-slate-200" />
                          <p className="text-sm">No active alerts.</p>
                      </div>
                   )}
                </div>
              </CardContent>
            </Card>
          </div>

        </TabsContent>
      </Tabs>
    </div>
  );
}

function KpiCard({ title, value, icon, trend, trendUp, description }: { title: string, value: string, icon: React.ReactNode, trend: string, trendUp: boolean, description: string }) {
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
        <p className="text-xs text-slate-500 flex items-center mt-1">
          {trendUp ? (
            <TrendingUp className="text-emerald-500 h-3 w-3 mr-1" />
          ) : (
            <TrendingDown className="text-rose-500 h-3 w-3 mr-1" />
          )}
          <span className={trendUp ? "text-emerald-500 font-medium" : "text-rose-500 font-medium"}>
            {trend}
          </span>
          <span className="ml-1 text-slate-400">{description}</span>
        </p>
      </CardContent>
    </Card>
  );
}
