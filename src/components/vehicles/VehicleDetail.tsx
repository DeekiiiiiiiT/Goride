import React, { useMemo, useState } from 'react';
import { 
  ArrowLeft, 
  Calendar, 
  MapPin, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Clock, 
  Activity,
  Fuel,
  Wrench,
  AlertTriangle,
  CheckCircle2,
  BarChart2,
  Zap,
  PiggyBank,
  Receipt,
  Plus,
  History
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { SafeResponsiveContainer as ResponsiveContainer } from '../ui/SafeResponsiveContainer';
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Badge } from "../ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Vehicle } from '../../types/vehicle';
import { Trip } from '../../types/data';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { format, subDays, isSameDay, startOfDay, getDay, getHours } from 'date-fns';

interface VehicleDetailProps {
  vehicle: Vehicle;
  trips: Trip[];
  onBack: () => void;
  onAssignDriver?: () => void; // Added
}

export function VehicleDetail({ vehicle, trips, onBack, onAssignDriver }: VehicleDetailProps) {
  const [isLogServiceOpen, setIsLogServiceOpen] = useState(false);

  // --- Analytics Logic ---
  const analytics = useMemo(() => {
    const vehicleTrips = trips.filter(t => t.vehicleId === vehicle.id || t.vehicleId === vehicle.licensePlate);
    
    // 1. Earnings Trend (Last 30 Days)
    const last30Days = Array.from({ length: 30 }, (_, i) => {
        const d = subDays(new Date(), 29 - i);
        return {
            date: format(d, 'MMM dd'),
            fullDate: d,
            earnings: 0,
            trips: 0
        };
    });

    // 2. Daily Performance (Mon-Sun)
    const dayOfWeekStats = [0,0,0,0,0,0,0].map((_, i) => ({ 
        name: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i], 
        earnings: 0, 
        trips: 0 
    }));

    // 3. Activity by Hour (0-23)
    const activityByHour = Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        name: `${i}:00`,
        trips: 0,
        earnings: 0
    }));

    let totalDurationMinutes = 0;
    let totalDistance = 0;

    vehicleTrips.forEach(t => {
        const tDate = new Date(t.date);
        
        // Match for 30-day trend
        const dayStat = last30Days.find(d => isSameDay(d.fullDate, tDate));
        if (dayStat) {
            dayStat.earnings += t.amount;
            dayStat.trips += 1;
        }

        // Match for Day of Week
        const dayIndex = getDay(tDate);
        dayOfWeekStats[dayIndex].earnings += t.amount;
        dayOfWeekStats[dayIndex].trips += 1;

        // Match for Hour of Day
        const hourIndex = getHours(tDate);
        activityByHour[hourIndex].trips += 1;
        activityByHour[hourIndex].earnings += t.amount;

        // Aggregates
        totalDurationMinutes += (t.duration || 0);
        totalDistance += (t.distance || 0);
    });

    // 4. Utilization Breakdown
    const activeHours = totalDurationMinutes / 60;
    const idleHours = activeHours * 0.4;
    
    // 5. Financials (Mocked)
    const totalEarnings = vehicle.metrics.totalLifetimeEarnings;
    const totalTrips = vehicleTrips.length;
    
    const fuelCost = totalDistance * 0.15; // $0.15/km
    const maintenanceCost = totalDistance * 0.05; // $0.05/km
    const insuranceCost = 150 * 6; // 6 months estimated
    const depreciationCost = 200 * 6; // 6 months estimated
    
    const totalExpenses = fuelCost + maintenanceCost + insuranceCost + depreciationCost;
    const netProfit = totalEarnings - totalExpenses;
    const profitMargin = totalEarnings > 0 ? (netProfit / totalEarnings) * 100 : 0;
    
    const vehiclePurchasePrice = 25000;
    const roiPercentage = (netProfit / vehiclePurchasePrice) * 100;

    // 6. Maintenance History (Mocked)
    const history = [
        { id: 1, date: '2023-11-15', type: 'Oil Change', cost: 85, odo: Math.max(0, vehicle.metrics.odometer - 3000), provider: 'QuickLube Inc', notes: 'Routine change' },
        { id: 2, date: '2023-08-10', type: 'Tire Rotation', cost: 45, odo: Math.max(0, vehicle.metrics.odometer - 8000), provider: 'City Tires', notes: 'Checked pressure' },
        { id: 3, date: '2023-05-22', type: 'Annual Inspection', cost: 120, odo: Math.max(0, vehicle.metrics.odometer - 12000), provider: 'Official Dealer', notes: 'Passed all safety checks' },
        { id: 4, date: '2023-01-15', type: 'Brake Pad Replacement', cost: 350, odo: Math.max(0, vehicle.metrics.odometer - 20000), provider: 'Mechanic Joe', notes: 'Front pads only' },
    ];
    
    const totalMaintCost = history.reduce((sum, item) => sum + item.cost, 0);

    // Performance Metrics
    const earningsPerTrip = totalTrips > 0 ? totalEarnings / totalTrips : 0;
    const earningsPerKm = totalDistance > 0 ? totalEarnings / totalDistance : 0;
    const earningsPerHour = activeHours > 0 ? totalEarnings / activeHours : 0;

    return {
        trendData: last30Days,
        dayOfWeekData: dayOfWeekStats,
        activityByHour,
        metrics: {
            earningsPerTrip,
            earningsPerKm,
            earningsPerHour,
            totalDistance,
            activeHours,
            idleHours
        },
        financials: {
            totalRevenue: totalEarnings,
            totalExpenses,
            netProfit,
            profitMargin,
            roiPercentage,
            breakdown: [
                { name: 'Fuel', value: fuelCost, color: '#f59e0b' },
                { name: 'Maintenance', value: maintenanceCost, color: '#ef4444' },
                { name: 'Insurance', value: insuranceCost, color: '#6366f1' },
                { name: 'Depreciation', value: depreciationCost, color: '#94a3b8' }
            ]
        },
        maintenance: {
            history,
            totalCost: totalMaintCost,
            nextDue: vehicle.nextServiceDate
        }
    };
  }, [vehicle, trips]);

  const utilizationData = [
    { name: 'Active Driving', value: analytics.metrics.activeHours, color: '#10b981' }, 
    { name: 'Idle / Waiting', value: analytics.metrics.idleHours, color: '#fbbf24' }, 
    { name: 'Offline', value: Math.max(0, (24 * 30) - (analytics.metrics.activeHours + analytics.metrics.idleHours)), color: '#e2e8f0' }, 
  ];

  return (
    <div className="space-y-6 animate-in slide-in-from-right duration-300">
      
      {/* --- Top Navigation --- */}
      <Button variant="ghost" onClick={onBack} className="pl-0 hover:bg-transparent hover:text-indigo-600">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Fleet
      </Button>

      {/* --- Header Section --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 overflow-hidden border-indigo-100 shadow-sm">
             <div className="flex flex-col md:flex-row h-full">
                 <div className="md:w-1/3 relative bg-slate-100 min-h-[200px]">
                     {vehicle.image?.startsWith('figma:') ? (
                        <ImageWithFallback src={vehicle.image} alt={vehicle.model} className="h-full w-full object-cover" />
                     ) : (
                        <img src={vehicle.image} alt={vehicle.model} className="h-full w-full object-cover" />
                     )}
                     <div className="absolute top-3 left-3">
                         <Badge className={vehicle.status === 'Active' ? 'bg-emerald-500' : 'bg-slate-500'}>
                             {vehicle.status}
                         </Badge>
                     </div>
                 </div>
                 <div className="p-6 flex-1 flex flex-col justify-between">
                     <div>
                         <div className="flex justify-between items-start">
                             <div>
                                 <h1 className="text-2xl font-bold text-slate-900">{vehicle.year} {vehicle.model}</h1>
                                 <div className="flex items-center gap-2 mt-1">
                                     <span className="font-mono text-sm bg-slate-100 px-2 py-0.5 rounded text-slate-600">{vehicle.licensePlate}</span>
                                     <span className="text-sm text-slate-400">|</span>
                                     <span className="text-sm text-slate-500">VIN: {vehicle.vin}</span>
                                 </div>
                             </div>
                             <div className="text-right">
                                 <p className="text-sm text-slate-500">Lifetime Earnings</p>
                                 <p className="text-2xl font-bold text-emerald-600">${vehicle.metrics.totalLifetimeEarnings.toLocaleString()}</p>
                             </div>
                         </div>
                         
                         <div className="mt-6 flex items-center gap-4">
                             <div className="flex items-center gap-3 bg-indigo-50 p-3 rounded-lg border border-indigo-100 pr-8">
                                 <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                                     <Activity className="h-5 w-5" />
                                 </div>
                                 <div>
                                     <p className="text-xs text-indigo-600 font-semibold uppercase tracking-wider">Current Driver</p>
                                     <p className="font-medium text-slate-900">{vehicle.currentDriverName || 'Unassigned'}</p>
                                 </div>
                                 <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className="ml-4 h-8 text-xs bg-white"
                                    onClick={onAssignDriver}
                                 >
                                     Change Driver
                                 </Button>
                             </div>
                         </div>
                     </div>
                 </div>
             </div>
          </Card>

          <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Today's Pulse</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                  <div className="flex justify-between items-center py-2 border-b border-slate-100">
                      <span className="text-slate-500 text-sm">Earnings</span>
                      <span className="font-bold text-slate-900">${vehicle.metrics.todayEarnings.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-100">
                      <span className="text-slate-500 text-sm">Utilization</span>
                      <div className="flex items-center gap-2">
                          <div className="h-2 w-16 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500" style={{ width: `${vehicle.metrics.utilizationRate}%` }}></div>
                          </div>
                          <span className="font-bold text-slate-900">{vehicle.metrics.utilizationRate.toFixed(1)}%</span>
                      </div>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-100">
                      <span className="text-slate-500 text-sm">Health Score</span>
                      <span className={`font-bold ${vehicle.metrics.healthScore > 80 ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {vehicle.metrics.healthScore}/100
                      </span>
                  </div>
                  
                  {vehicle.serviceStatus !== 'OK' && (
                      <div className="bg-amber-50 text-amber-800 text-xs p-3 rounded-md flex items-start gap-2 mt-2">
                          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                          <div>
                              <p className="font-bold">Service Due: {vehicle.nextServiceType}</p>
                              <p>Due in {vehicle.daysToService} days</p>
                          </div>
                      </div>
                  )}
              </CardContent>
          </Card>
      </div>

      <Tabs defaultValue="performance" className="w-full">
          <TabsList>
              <TabsTrigger value="performance">Performance</TabsTrigger>
              <TabsTrigger value="utilization">Utilization</TabsTrigger>
              <TabsTrigger value="financials">Financials</TabsTrigger>
              <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
          </TabsList>

          {/* --- Performance Tab --- */}
          <TabsContent value="performance" className="space-y-6 mt-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                      <CardContent className="p-6">
                          <div className="flex justify-between items-start mb-2">
                              <p className="text-sm font-medium text-slate-500">Earnings per Hour</p>
                              <Clock className="h-4 w-4 text-emerald-500" />
                          </div>
                          <h3 className="text-2xl font-bold text-slate-900">${analytics.metrics.earningsPerHour.toFixed(2)}</h3>
                          <p className="text-xs text-emerald-600 flex items-center mt-1">
                              <TrendingUp className="h-3 w-3 mr-1" /> Top 10% of fleet
                          </p>
                      </CardContent>
                  </Card>
                  <Card>
                      <CardContent className="p-6">
                          <div className="flex justify-between items-start mb-2">
                              <p className="text-sm font-medium text-slate-500">Earnings per Trip</p>
                              <MapPin className="h-4 w-4 text-indigo-500" />
                          </div>
                          <h3 className="text-2xl font-bold text-slate-900">${analytics.metrics.earningsPerTrip.toFixed(2)}</h3>
                          <p className="text-xs text-slate-400 mt-1">
                              Based on {trips.length} trips
                          </p>
                      </CardContent>
                  </Card>
                  <Card>
                      <CardContent className="p-6">
                          <div className="flex justify-between items-start mb-2">
                              <p className="text-sm font-medium text-slate-500">Fuel Efficiency</p>
                              <Fuel className="h-4 w-4 text-amber-500" />
                          </div>
                          <h3 className="text-2xl font-bold text-slate-900">12.5 km/L</h3>
                          <p className="text-xs text-slate-400 mt-1">
                              Est. based on model
                          </p>
                      </CardContent>
                  </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                      <CardHeader>
                          <CardTitle>Earnings Trend (30 Days)</CardTitle>
                          <CardDescription>Daily revenue performance</CardDescription>
                      </CardHeader>
                      <CardContent className="h-[300px]">
                          <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={analytics.trendData}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                  <XAxis 
                                    dataKey="date" 
                                    tick={{fontSize: 12}} 
                                    tickMargin={10}
                                    axisLine={false}
                                    tickLine={false}
                                  />
                                  <YAxis 
                                    tick={{fontSize: 12}} 
                                    axisLine={false}
                                    tickLine={false}
                                    tickFormatter={(val) => `$${val}`}
                                  />
                                  <RechartsTooltip 
                                    formatter={(value: number) => [`$${value.toFixed(2)}`, 'Earnings']}
                                    labelStyle={{ color: '#64748b' }}
                                  />
                                  <Line 
                                    type="monotone" 
                                    dataKey="earnings" 
                                    stroke="#4f46e5" 
                                    strokeWidth={2} 
                                    dot={false}
                                    activeDot={{ r: 4 }}
                                  />
                              </LineChart>
                          </ResponsiveContainer>
                      </CardContent>
                  </Card>
                  
                  <Card>
                        <CardHeader>
                            <CardTitle>Peak Performance Days</CardTitle>
                            <CardDescription>Revenue by day of week</CardDescription>
                        </CardHeader>
                        <CardContent className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={analytics.dayOfWeekData}>
                                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12}} />
                                    <RechartsTooltip />
                                    <Bar dataKey="earnings" fill="#6366f1" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                  </Card>
              </div>
          </TabsContent>

          {/* --- Utilization Tab --- */}
          <TabsContent value="utilization" className="space-y-6 mt-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  
                  {/* Utilization Pie Chart */}
                  <Card className="md:col-span-1">
                       <CardHeader>
                           <CardTitle>Time Distribution</CardTitle>
                           <CardDescription>Active vs Idle vs Offline</CardDescription>
                       </CardHeader>
                       <CardContent className="h-[250px] flex items-center justify-center">
                           <ResponsiveContainer width="100%" height="100%">
                               <PieChart>
                                   <Pie
                                      data={utilizationData}
                                      innerRadius={60}
                                      outerRadius={80}
                                      paddingAngle={5}
                                      dataKey="value"
                                   >
                                      {utilizationData.map((entry, index) => (
                                          <Cell key={`cell-${index}`} fill={entry.color} />
                                      ))}
                                   </Pie>
                                   <Legend verticalAlign="bottom" height={36}/>
                                   <RechartsTooltip />
                               </PieChart>
                           </ResponsiveContainer>
                       </CardContent>
                  </Card>

                  {/* Utilization Stats */}
                  <Card className="md:col-span-2">
                       <CardHeader>
                           <CardTitle>Utilization Insights</CardTitle>
                           <CardDescription>Analysis of vehicle usage patterns</CardDescription>
                       </CardHeader>
                       <CardContent className="grid grid-cols-2 gap-4">
                           <div className="bg-slate-50 p-4 rounded-lg">
                               <div className="flex items-center gap-2 mb-2 text-slate-500">
                                   <Zap className="h-4 w-4" />
                                   <span className="text-sm font-medium">Efficiency Rate</span>
                               </div>
                               <div className="text-2xl font-bold text-slate-900">
                                   {((analytics.metrics.activeHours / (analytics.metrics.activeHours + analytics.metrics.idleHours)) * 100).toFixed(1)}%
                               </div>
                               <p className="text-xs text-slate-400 mt-1">Percentage of "on-duty" time spent moving</p>
                           </div>

                           <div className="bg-slate-50 p-4 rounded-lg">
                               <div className="flex items-center gap-2 mb-2 text-slate-500">
                                   <Clock className="h-4 w-4" />
                                   <span className="text-sm font-medium">Total Active Hours</span>
                               </div>
                               <div className="text-2xl font-bold text-slate-900">
                                   {Math.round(analytics.metrics.activeHours)} hrs
                               </div>
                               <p className="text-xs text-slate-400 mt-1">Last 30 days</p>
                           </div>

                           <div className="bg-slate-50 p-4 rounded-lg col-span-2">
                               <h4 className="font-medium text-slate-900 mb-2">Recommendation</h4>
                               <p className="text-sm text-slate-600">
                                   Vehicle utilization is healthy. Consider scheduling maintenance during the low-activity window between 2 AM and 5 AM on Tuesdays to minimize revenue impact.
                               </p>
                           </div>
                       </CardContent>
                  </Card>
              </div>

              {/* Activity Heatmap / Bar Chart */}
              <Card>
                  <CardHeader>
                      <CardTitle>Activity by Hour of Day</CardTitle>
                      <CardDescription>When is this vehicle most productive?</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={analytics.activityByHour}>
                              <CartesianGrid vertical={false} strokeDasharray="3 3" />
                              <XAxis 
                                dataKey="name" 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{fontSize: 10}} 
                                interval={2} 
                              />
                              <RechartsTooltip />
                              <Bar dataKey="trips" fill="#818cf8" radius={[2, 2, 0, 0]} name="Trip Count" />
                          </BarChart>
                      </ResponsiveContainer>
                  </CardContent>
              </Card>
          </TabsContent>
          
          {/* --- Financials Tab --- */}
          <TabsContent value="financials" className="space-y-6 mt-6">
              
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card>
                      <CardContent className="p-6">
                          <div className="flex justify-between items-start mb-2">
                              <p className="text-sm font-medium text-slate-500">Total Revenue</p>
                              <DollarSign className="h-4 w-4 text-emerald-500" />
                          </div>
                          <h3 className="text-2xl font-bold text-slate-900">${analytics.financials.totalRevenue.toLocaleString()}</h3>
                          <p className="text-xs text-slate-500 mt-1">Lifetime</p>
                      </CardContent>
                  </Card>
                  <Card>
                      <CardContent className="p-6">
                          <div className="flex justify-between items-start mb-2">
                              <p className="text-sm font-medium text-slate-500">Total Expenses</p>
                              <Receipt className="h-4 w-4 text-rose-500" />
                          </div>
                          <h3 className="text-2xl font-bold text-slate-900">${analytics.financials.totalExpenses.toLocaleString(undefined, {maximumFractionDigits: 0})}</h3>
                          <p className="text-xs text-slate-500 mt-1">Est. Fuel, Maint, Ins.</p>
                      </CardContent>
                  </Card>
                  <Card>
                      <CardContent className="p-6">
                          <div className="flex justify-between items-start mb-2">
                              <p className="text-sm font-medium text-slate-500">Net Profit</p>
                              <PiggyBank className="h-4 w-4 text-indigo-500" />
                          </div>
                          <h3 className={`text-2xl font-bold ${analytics.financials.netProfit >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>
                              ${analytics.financials.netProfit.toLocaleString(undefined, {maximumFractionDigits: 0})}
                          </h3>
                          <p className="text-xs text-slate-500 mt-1">{analytics.financials.profitMargin.toFixed(1)}% Margin</p>
                      </CardContent>
                  </Card>
                  <Card>
                      <CardContent className="p-6">
                          <div className="flex justify-between items-start mb-2">
                              <p className="text-sm font-medium text-slate-500">ROI</p>
                              <TrendingUp className="h-4 w-4 text-emerald-600" />
                          </div>
                          <h3 className="text-2xl font-bold text-slate-900">{analytics.financials.roiPercentage.toFixed(1)}%</h3>
                          <p className="text-xs text-slate-500 mt-1">Based on $25k cost</p>
                      </CardContent>
                  </Card>
              </div>

              {/* Expense Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card>
                      <CardHeader>
                          <CardTitle>Expense Breakdown</CardTitle>
                          <CardDescription>Where is the money going?</CardDescription>
                      </CardHeader>
                      <CardContent className="h-[300px] flex items-center justify-center">
                          <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                  <Pie
                                      data={analytics.financials.breakdown}
                                      innerRadius={60}
                                      outerRadius={80}
                                      paddingAngle={5}
                                      dataKey="value"
                                  >
                                      {analytics.financials.breakdown.map((entry, index) => (
                                          <Cell key={`cell-${index}`} fill={entry.color} />
                                      ))}
                                  </Pie>
                                  <RechartsTooltip formatter={(value: number) => `$${value.toFixed(0)}`} />
                                  <Legend verticalAlign="bottom" height={36}/>
                              </PieChart>
                          </ResponsiveContainer>
                      </CardContent>
                  </Card>

                  <Card>
                      <CardHeader>
                          <CardTitle>Profitability Analysis</CardTitle>
                          <CardDescription>Revenue vs Expenses vs Profit</CardDescription>
                      </CardHeader>
                      <CardContent className="h-[300px]">
                          <ResponsiveContainer width="100%" height="100%">
                              <BarChart 
                                  layout="vertical" 
                                  data={[
                                      { name: 'Revenue', value: analytics.financials.totalRevenue, fill: '#10b981' },
                                      { name: 'Expenses', value: analytics.financials.totalExpenses, fill: '#ef4444' },
                                      { name: 'Net Profit', value: analytics.financials.netProfit, fill: '#6366f1' }
                                  ]}
                                  margin={{ left: 20 }}
                              >
                                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                  <XAxis type="number" tickFormatter={(val) => `$${val/1000}k`} />
                                  <YAxis dataKey="name" type="category" width={80} />
                                  <RechartsTooltip formatter={(val: number) => `$${val.toLocaleString()}`} />
                                  <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={40}>
                                    {
                                        [
                                          { fill: '#10b981' },
                                          { fill: '#ef4444' },
                                          { fill: '#6366f1' }
                                        ].map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.fill} />
                                        ))
                                    }
                                  </Bar>
                              </BarChart>
                          </ResponsiveContainer>
                      </CardContent>
                  </Card>
              </div>
          </TabsContent>

          {/* --- Phase 6: Maintenance Tab --- */}
          <TabsContent value="maintenance" className="space-y-6 mt-6">
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  
                  {/* Stats Column */}
                  <div className="space-y-4">
                      <Card>
                          <CardContent className="p-6">
                             <div className="flex items-center gap-3 mb-4">
                                 <div className="bg-emerald-100 p-2 rounded-full text-emerald-600">
                                     <CheckCircle2 className="h-5 w-5" />
                                 </div>
                                 <div>
                                     <p className="text-sm font-medium text-slate-500">Service Status</p>
                                     <h4 className="text-lg font-bold text-slate-900">
                                         {vehicle.serviceStatus === 'OK' ? 'Healthy' : vehicle.serviceStatus}
                                     </h4>
                                 </div>
                             </div>
                             {vehicle.serviceStatus !== 'OK' && (
                                 <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
                                     Action Required: {vehicle.nextServiceType}
                                 </p>
                             )}
                          </CardContent>
                      </Card>

                      <Card>
                          <CardContent className="p-6">
                              <p className="text-sm font-medium text-slate-500 mb-1">Total Maintenance Cost</p>
                              <h3 className="text-2xl font-bold text-slate-900">
                                  ${analytics.maintenance.totalCost.toLocaleString()}
                              </h3>
                              <p className="text-xs text-slate-400 mt-1">Lifetime spend</p>
                          </CardContent>
                      </Card>

                      <Card>
                          <CardContent className="p-6">
                              <p className="text-sm font-medium text-slate-500 mb-1">Next Service Due</p>
                              <h3 className="text-lg font-bold text-slate-900">
                                  {format(new Date(vehicle.nextServiceDate || Date.now()), 'MMM d, yyyy')}
                              </h3>
                              <p className="text-xs text-slate-400 mt-1">
                                  {vehicle.daysToService} days remaining
                              </p>
                          </CardContent>
                      </Card>

                      {/* Log Service Action */}
                      <Dialog open={isLogServiceOpen} onOpenChange={setIsLogServiceOpen}>
                          <DialogTrigger asChild>
                              <Button className="w-full bg-indigo-600 hover:bg-indigo-700">
                                  <Plus className="h-4 w-4 mr-2" />
                                  Log New Service
                              </Button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-[425px]">
                              <DialogHeader>
                                  <DialogTitle>Log Vehicle Service</DialogTitle>
                                  <DialogDescription>
                                      Record a new maintenance event for {vehicle.licensePlate}.
                                  </DialogDescription>
                              </DialogHeader>
                              <div className="grid gap-4 py-4">
                                  <div className="grid grid-cols-4 items-center gap-4">
                                      <Label htmlFor="date" className="text-right">
                                          Date
                                      </Label>
                                      <Input id="date" type="date" className="col-span-3" />
                                  </div>
                                  <div className="grid grid-cols-4 items-center gap-4">
                                      <Label htmlFor="type" className="text-right">
                                          Type
                                      </Label>
                                      <Select>
                                          <SelectTrigger className="col-span-3">
                                              <SelectValue placeholder="Select service type" />
                                          </SelectTrigger>
                                          <SelectContent>
                                              <SelectItem value="oil">Oil Change</SelectItem>
                                              <SelectItem value="tires">Tire Service</SelectItem>
                                              <SelectItem value="brake">Brakes</SelectItem>
                                              <SelectItem value="inspection">General Inspection</SelectItem>
                                          </SelectContent>
                                      </Select>
                                  </div>
                                  <div className="grid grid-cols-4 items-center gap-4">
                                      <Label htmlFor="cost" className="text-right">
                                          Cost ($)
                                      </Label>
                                      <Input id="cost" type="number" className="col-span-3" placeholder="0.00" />
                                  </div>
                                  <div className="grid grid-cols-4 items-center gap-4">
                                      <Label htmlFor="odo" className="text-right">
                                          Odometer
                                      </Label>
                                      <Input id="odo" type="number" className="col-span-3" defaultValue={vehicle.metrics.odometer} />
                                  </div>
                                  <div className="grid grid-cols-4 items-center gap-4">
                                      <Label htmlFor="notes" className="text-right">
                                          Notes
                                      </Label>
                                      <Input id="notes" className="col-span-3" placeholder="Mechanic notes..." />
                                  </div>
                              </div>
                              <DialogFooter>
                                  <Button type="submit" onClick={() => setIsLogServiceOpen(false)}>Save Log</Button>
                              </DialogFooter>
                          </DialogContent>
                      </Dialog>
                  </div>

                  {/* History Timeline */}
                  <Card className="md:col-span-2">
                      <CardHeader>
                          <CardTitle>Service History</CardTitle>
                          <CardDescription>Recent maintenance records</CardDescription>
                      </CardHeader>
                      <CardContent>
                          <div className="space-y-6">
                              {analytics.maintenance.history.map((item, index) => (
                                  <div key={item.id} className="relative pl-6 pb-2 border-l border-slate-200 last:border-0">
                                      <div className="absolute left-[-5px] top-1 h-2.5 w-2.5 rounded-full bg-slate-300 ring-4 ring-white"></div>
                                      
                                      <div className="flex justify-between items-start mb-1">
                                          <div>
                                              <h4 className="text-sm font-semibold text-slate-900">{item.type}</h4>
                                              <p className="text-xs text-slate-500">{format(new Date(item.date), 'MMMM d, yyyy')}</p>
                                          </div>
                                          <Badge variant="outline" className="text-slate-600">
                                              ${item.cost}
                                          </Badge>
                                      </div>
                                      
                                      <div className="bg-slate-50 p-3 rounded-md mt-2 text-sm">
                                          <div className="flex justify-between text-slate-500 mb-1">
                                              <span className="flex items-center gap-1">
                                                  <MapPin className="h-3 w-3" /> {item.provider}
                                              </span>
                                              <span className="flex items-center gap-1">
                                                  <Activity className="h-3 w-3" /> {item.odo.toLocaleString()} km
                                              </span>
                                          </div>
                                          {item.notes && (
                                              <p className="text-slate-600 italic border-t border-slate-200 pt-2 mt-2">
                                                  "{item.notes}"
                                              </p>
                                          )}
                                      </div>
                                  </div>
                              ))}
                          </div>
                      </CardContent>
                  </Card>

              </div>
          </TabsContent>
      </Tabs>

    </div>
  );
}