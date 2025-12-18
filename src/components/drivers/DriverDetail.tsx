import React, { useState, useMemo } from 'react';
import { 
  ArrowLeft, 
  Star, 
  TrendingUp, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  DollarSign, 
  MapPin,
  MessageSquare,
  Calendar as CalendarIcon, 
  Shield,
  Award,
  MoreHorizontal,
  Download,
  Share2,
  Activity,
  Zap,
  ThumbsUp,
  ThumbsDown,
  Navigation
} from 'lucide-react';
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "../ui/card";
import { Badge } from "../ui/badge";
import { Progress } from "../ui/progress";
import { Separator } from "../ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area
} from 'recharts';
import { SafeResponsiveContainer as ResponsiveContainer } from '../ui/SafeResponsiveContainer';
import { Trip } from '../../types/data';
import { format, subDays, isWithinInterval, startOfDay, endOfDay, eachDayOfInterval, differenceInDays } from "date-fns";
import { DateRange } from "react-day-picker";
import { cn } from "../ui/utils";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar } from "../ui/calendar";

interface DriverDetailProps {
  driverId: string;
  driverName: string;
  trips: Trip[];
  onBack: () => void;
}

export function DriverDetail({ driverId, driverName, trips, onBack }: DriverDetailProps) {
  const [activeTab, setActiveTab] = useState("overview");
  
  // Date Range State (Default: Last 7 Days)
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 7),
    to: new Date(),
  });

  // Calculate Metrics based on Date Range
  const metrics = useMemo(() => {
     if (!dateRange?.from || !dateRange?.to) return null;

     const start = startOfDay(dateRange.from);
     const end = endOfDay(dateRange.to);
     const daysDiff = differenceInDays(end, start) + 1;
     
     // Previous Period for Trend
     const prevStart = subDays(start, daysDiff);
     const prevEnd = subDays(end, daysDiff);

     let periodEarnings = 0;
     let prevPeriodEarnings = 0;
     
     let totalEarnings = 0; // Lifetime
     let lifetimeTrips = 0; // Lifetime

     let periodCompletedTrips = 0;
     let periodCancelledTrips = 0;
     let cashCollected = 0;
     
     // Efficiency Metrics
     let totalDistance = 0;
     let totalDuration = 0; // minutes
     const hoursDistribution = new Array(24).fill(0);

     // Breakdown
     let totalBaseFare = 0;
     let totalTips = 0;

     // Chart Data Map
     const chartDataMap = new Map<string, number>();
     
     try {
         const days = eachDayOfInterval({ start, end });
         days.forEach(d => {
             chartDataMap.set(format(d, 'yyyy-MM-dd'), 0);
         });
     } catch (e) { }

     trips.forEach(trip => {
        const tripDateObj = new Date(trip.date);
        
        // Lifetime stats
        totalEarnings += trip.amount;
        lifetimeTrips += 1;

        // Filter Check
        if (isWithinInterval(tripDateObj, { start, end })) {
            periodEarnings += trip.amount;
            
            if (trip.status === 'Completed') periodCompletedTrips++;
            if (trip.status === 'Cancelled') periodCancelledTrips++;
            if (trip.cashCollected) cashCollected += trip.cashCollected;
            
            if (trip.distance) totalDistance += trip.distance;
            if (trip.duration) totalDuration += trip.duration;

            // Hourly Distribution
            const h = tripDateObj.getHours();
            hoursDistribution[h]++;

            // Chart Data
            const dateKey = format(tripDateObj, 'yyyy-MM-dd');
            if (chartDataMap.has(dateKey)) {
                chartDataMap.set(dateKey, (chartDataMap.get(dateKey) || 0) + trip.amount);
            }

            // Breakdown
            if (trip.fareBreakdown) {
                totalBaseFare += trip.fareBreakdown.baseFare || 0;
                totalTips += trip.fareBreakdown.tips || 0;
            } else {
                totalBaseFare += trip.amount;
            }
        }

        // Previous Period Check
        if (isWithinInterval(tripDateObj, { start: prevStart, end: prevEnd })) {
            prevPeriodEarnings += trip.amount;
        }
     });

     // Prepare Charts Data
     const weeklyEarningsData = Array.from(chartDataMap.entries()).map(([date, amount]) => {
         const d = new Date(date);
         return {
             day: format(d, 'MMM d'),
             amount: amount,
             fullDate: date
         };
     });

     // Earnings Breakdown Data
     const earningsBreakdownData = [
        { name: 'Base Fare', value: totalBaseFare, color: '#4f46e5' },
        { name: 'Tips', value: totalTips, color: '#10b981' },
     ].filter(d => d.value > 0);

     // Hourly Activity Data
     const hourlyActivityData = hoursDistribution.map((count, hour) => ({
         hour: `${hour}:00`,
         trips: count
     }));

     // Trend
     const trendPercent = prevPeriodEarnings > 0 
        ? ((periodEarnings - prevPeriodEarnings) / prevPeriodEarnings) * 100 
        : periodEarnings > 0 ? 100 : 0;

     // Derived Efficiency Metrics
     const totalTrips = periodCompletedTrips + periodCancelledTrips;
     const avgDistance = totalTrips > 0 ? totalDistance / totalTrips : 0;
     const avgDuration = totalTrips > 0 ? totalDuration / totalTrips : 0;
     const earningsPerKm = totalDistance > 0 ? periodEarnings / totalDistance : 0;
     const tripsPerHour = totalDuration > 0 ? (totalTrips / (totalDuration / 60)) : 0;

     // Completion Rate
     const completionRate = totalTrips > 0 ? (periodCompletedTrips / totalTrips) * 100 : 0;

     return {
        periodEarnings,
        prevPeriodEarnings,
        trendPercent: trendPercent.toFixed(1),
        trendUp: periodEarnings >= prevPeriodEarnings,
        totalEarnings,
        lifetimeTrips,
        periodCompletedTrips,
        periodCancelledTrips,
        cashCollected,
        weeklyEarningsData,
        earningsBreakdownData,
        hourlyActivityData,
        daysDiff,
        totalDistance,
        totalDuration,
        avgDistance,
        avgDuration,
        earningsPerKm,
        tripsPerHour,
        completionRate
     };
  }, [trips, dateRange]);

  if (!metrics) return <div>Loading metrics...</div>;

  const isToday = dateRange?.to && format(dateRange.to, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') && metrics.daysDiff === 1;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Top Navigation */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <Button variant="ghost" onClick={onBack} className="gap-2 pl-0 hover:pl-2 transition-all">
          <ArrowLeft className="h-4 w-4" />
          Back to Drivers
        </Button>
        <div className="flex flex-wrap items-center gap-2">
           {/* Date Picker */}
           <div className={cn("grid gap-2")}>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="date"
                  variant={"outline"}
                  className={cn(
                    "w-[260px] justify-start text-left font-normal",
                    !dateRange && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, "LLL dd, y")} -{" "}
                        {format(dateRange.to, "LLL dd, y")}
                      </>
                    ) : (
                      format(dateRange.from, "LLL dd, y")
                    )
                  ) : (
                    <span>Pick a date</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange?.from}
                  selected={dateRange}
                  onSelect={setDateRange}
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>
          </div>

           <Button variant="outline" size="sm">
             <Download className="h-4 w-4 mr-2" />
             Export
           </Button>
           <Button variant="default" size="sm">
             <MessageSquare className="h-4 w-4 mr-2" />
             Message
           </Button>
        </div>
      </div>

      {/* Driver Header */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-white dark:bg-slate-900 p-6 rounded-xl border shadow-sm">
        <div className="flex items-start gap-4 col-span-1 md:col-span-2">
          <Avatar className="h-20 w-20 border-4 border-slate-50 dark:border-slate-800 shadow-md">
             <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${driverId}`} />
             <AvatarFallback className="text-xl bg-indigo-100 text-indigo-700">{driverName.slice(0, 2)}</AvatarFallback>
          </Avatar>
          <div className="space-y-1">
             <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{driverName}</h1>
                <Badge className="bg-emerald-500 hover:bg-emerald-600">Active</Badge>
             </div>
             <div className="text-sm text-slate-500 flex flex-col gap-1">
                <span className="flex items-center gap-2"><CreditCardIcon className="h-3 w-3" /> ID: {driverId}</span>
                <span className="flex items-center gap-2"><CarIcon className="h-3 w-3" /> Vehicle: 2019 Toyota Sienta (5179KZ)</span>
                <span className="flex items-center gap-2"><CalendarIcon className="h-3 w-3" /> Member Since: Oct 12, 2023</span>
             </div>
          </div>
        </div>
        
        <div className="col-span-1 border-t md:border-t-0 md:border-l pt-4 md:pt-0 md:pl-6 flex flex-col justify-center space-y-3">
           <div className="flex justify-between items-center">
              <span className="text-sm text-slate-500">Performance Tier</span>
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 flex items-center gap-1">
                 <Award className="h-3 w-3" /> {metrics.totalEarnings > 5000 ? 'PLATINUM' : metrics.totalEarnings > 3000 ? 'GOLD' : metrics.totalEarnings > 1000 ? 'SILVER' : 'BRONZE'}
              </Badge>
           </div>
           <div className="flex justify-between items-center">
              <span className="text-sm text-slate-500">Total Lifetime Trips</span>
              <span className="font-semibold">{metrics.lifetimeTrips}</span>
           </div>
           <div className="flex justify-between items-center">
              <span className="text-sm text-slate-500">Current Rating</span>
              <div className="flex items-center gap-1 text-amber-500 font-bold">
                 5.0 <Star className="h-4 w-4 fill-current" />
              </div>
           </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4" onValueChange={setActiveTab}>
         <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="financial">Financials</TabsTrigger>
            <TabsTrigger value="operations">Efficiency</TabsTrigger>
            <TabsTrigger value="quality">Service Quality</TabsTrigger>
         </TabsList>

         <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
               <MetricCard 
                  title={isToday ? "Today's Earnings" : "Period Earnings"} 
                  value={`$${metrics.periodEarnings.toFixed(2)}`} 
                  trend={`${metrics.trendPercent}% vs prev`} 
                  trendUp={metrics.trendUp}
                  icon={<DollarSign className="h-4 w-4 text-slate-500" />}
               />
               <MetricCard 
                  title="Completion Rate" 
                  value={`${metrics.completionRate.toFixed(0)}%`} 
                  target="Target: 95%"
                  progress={metrics.completionRate}
                  progressColor={metrics.completionRate >= 95 ? "bg-emerald-500" : "bg-rose-500"}
                  icon={<CheckCircle2 className="h-4 w-4 text-slate-500" />}
               />
               <MetricCard 
                  title="Avg Trip Distance" 
                  value={`${metrics.avgDistance.toFixed(1)} km`}
                  subtext="Based on activity"
                  icon={<Navigation className="h-4 w-4 text-slate-500" />}
               />
               <MetricCard 
                  title="Customer Rating" 
                  value="5.0" 
                  subtext="Perfect Score!"
                  icon={<Star className="h-4 w-4 text-slate-500" />}
               />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
               <Card className="lg:col-span-2">
                  <CardHeader>
                     <CardTitle>Financial Performance</CardTitle>
                     <CardDescription>Earnings over selected period.</CardDescription>
                  </CardHeader>
                  <CardContent>
                     <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={metrics.weeklyEarningsData}>
                           <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                           <XAxis 
                              dataKey="day" 
                              axisLine={false} 
                              tickLine={false} 
                              interval={metrics.daysDiff > 14 ? 'preserveStartEnd' : 0}
                              tick={{ fontSize: 12 }}
                           />
                           <YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `$${value}`} />
                           <Tooltip 
                              cursor={{fill: '#f1f5f9'}}
                              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} 
                           />
                           <Bar dataKey="amount" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                        </BarChart>
                     </ResponsiveContainer>
                  </CardContent>
               </Card>

               <Card>
                  <CardHeader>
                     <CardTitle className="text-rose-600 flex items-center gap-2">
                        <Shield className="h-5 w-5" />
                        Immediate Actions
                     </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                     <div className="space-y-3">
                        <div className="flex items-start gap-3 p-3 bg-rose-50 rounded-lg border border-rose-100">
                           <div className="h-6 w-6 rounded-full bg-rose-200 text-rose-700 flex items-center justify-center flex-shrink-0 text-xs font-bold">1</div>
                           <div>
                              <p className="font-medium text-rose-900 text-sm">Low Trip Count</p>
                              <p className="text-xs text-rose-700 mt-1">Driver has low activity this week.</p>
                           </div>
                        </div>
                     </div>
                     <Button className="w-full mt-2" variant="outline">View Full Action Plan</Button>
                  </CardContent>
               </Card>
            </div>
         </TabsContent>

         <TabsContent value="financial" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <Card>
                  <CardHeader>
                     <CardTitle>Earnings Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent className="flex items-center justify-center">
                     <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                           <Pie
                              data={metrics.earningsBreakdownData}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="value"
                           >
                              {metrics.earningsBreakdownData.map((entry, index) => (
                                 <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                           </Pie>
                           <Tooltip />
                        </PieChart>
                     </ResponsiveContainer>
                  </CardContent>
               </Card>
               <Card>
                  <CardHeader>
                     <CardTitle>Cash Flow Analysis</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                     <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                           <span className="text-slate-500">Cash Collected</span>
                           <span className="font-medium">${metrics.cashCollected.toFixed(2)}</span>
                        </div>
                        <Progress 
                            value={metrics.periodEarnings > 0 ? (metrics.cashCollected / metrics.periodEarnings) * 100 : 0} 
                            className="h-2 bg-slate-100" 
                            indicatorClassName="bg-amber-500" 
                        />
                        <p className="text-xs text-amber-600 font-medium">
                            {metrics.periodEarnings > 0 ? ((metrics.cashCollected / metrics.periodEarnings) * 100).toFixed(1) : 0}% of earnings (Cash Risk)
                        </p>
                     </div>
                     <Separator />
                     <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 bg-slate-50 rounded-lg">
                           <p className="text-xs text-slate-500">Total Earnings</p>
                           <p className="text-lg font-semibold">${metrics.periodEarnings.toFixed(2)}</p>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-lg">
                           <p className="text-xs text-slate-500">Net Income</p>
                           <p className="text-lg font-semibold text-emerald-600">${metrics.periodEarnings.toFixed(2)}</p>
                        </div>
                     </div>
                  </CardContent>
               </Card>
            </div>
         </TabsContent>

         <TabsContent value="operations" className="space-y-6">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 <MetricCard 
                    title="Earnings per Km" 
                    value={`$${metrics.earningsPerKm.toFixed(2)}`} 
                    icon={<Zap className="h-4 w-4 text-slate-500" />}
                    subtext="Target: >$1.50"
                 />
                 <MetricCard 
                    title="Avg Duration" 
                    value={`${metrics.avgDuration.toFixed(0)} min`} 
                    icon={<Clock className="h-4 w-4 text-slate-500" />}
                 />
                 <MetricCard 
                    title="Total Distance" 
                    value={`${metrics.totalDistance.toFixed(1)} km`} 
                    icon={<MapPin className="h-4 w-4 text-slate-500" />}
                 />
             </div>
             
             <Card>
                <CardHeader>
                   <CardTitle>Activity by Hour</CardTitle>
                   <CardDescription>When does this driver drive the most?</CardDescription>
                </CardHeader>
                <CardContent>
                   <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={metrics.hourlyActivityData}>
                         <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                         <XAxis dataKey="hour" axisLine={false} tickLine={false} fontSize={12} />
                         <YAxis axisLine={false} tickLine={false} />
                         <Tooltip cursor={{fill: '#f1f5f9'}} contentStyle={{ borderRadius: '8px', border: 'none' }} />
                         <Bar dataKey="trips" fill="#6366f1" radius={[4, 4, 0, 0]} />
                      </BarChart>
                   </ResponsiveContainer>
                </CardContent>
             </Card>
         </TabsContent>

         <TabsContent value="quality" className="space-y-6">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 <MetricCard 
                    title="Completion Rate" 
                    value={`${metrics.completionRate.toFixed(1)}%`} 
                    icon={<CheckCircle2 className="h-4 w-4 text-slate-500" />}
                    progress={metrics.completionRate}
                    progressColor="bg-emerald-500"
                    target="Target: 95%"
                 />
                 <MetricCard 
                    title="Cancelled Trips" 
                    value={metrics.periodCancelledTrips} 
                    icon={<AlertTriangle className="h-4 w-4 text-slate-500" />}
                    subtext="In selected period"
                 />
                 <MetricCard 
                    title="Safety Score" 
                    value="98/100" 
                    icon={<Shield className="h-4 w-4 text-slate-500" />}
                    subtext="Based on harsh braking events"
                 />
             </div>

             <Card>
                <CardHeader>
                   <CardTitle>Recent Trip Issues</CardTitle>
                </CardHeader>
                <CardContent>
                   {metrics.periodCancelledTrips === 0 ? (
                       <div className="text-center py-8 text-slate-500">
                           <CheckCircle2 className="h-12 w-12 text-emerald-100 fill-emerald-500 mx-auto mb-3" />
                           <p>No cancelled trips in this period. Great job!</p>
                       </div>
                   ) : (
                       <div className="space-y-4">
                           <p className="text-sm text-slate-500">Trips that were cancelled or had issues.</p>
                           {/* List cancelled trips here if needed */}
                       </div>
                   )}
                </CardContent>
             </Card>
         </TabsContent>
      </Tabs>
    </div>
  );
}

function MetricCard({ title, value, trend, trendUp, target, progress, progressColor = "bg-indigo-600", subtext, icon }: any) {
   return (
      <Card>
         <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
               <p className="text-sm font-medium text-slate-500">{title}</p>
               {icon}
            </div>
            <div className="flex items-baseline gap-2 mt-2">
               <h2 className="text-2xl font-bold">{value}</h2>
               {trend && (
                  <span className={`text-xs font-medium ${trendUp ? 'text-emerald-600' : 'text-rose-600'}`}>
                     {trend}
                  </span>
               )}
            </div>
            {(target || progress !== undefined) && (
               <div className="mt-3 space-y-1">
                  {target && <p className="text-xs text-slate-500">{target}</p>}
                  {progress !== undefined && (
                     <Progress value={progress} className="h-1.5" indicatorClassName={progressColor} />
                  )}
               </div>
            )}
            {subtext && <p className="text-xs text-slate-500 mt-1">{subtext}</p>}
         </CardContent>
      </Card>
   )
}

function CreditCardIcon(props: any) {
   return (
      <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <line x1="2" x2="22" y1="10" y2="10" />
    </svg>
   )
}

function CarIcon(props: any) {
   return (
      <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
      <circle cx="7" cy="17" r="2" />
      <path d="M9 17h6" />
      <circle cx="17" cy="17" r="2" />
    </svg>
   )
}