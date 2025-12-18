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
  Navigation,
  FileText,
  Upload,
  Search,
  Eye,
  Filter
} from 'lucide-react';
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "../ui/table";
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
import { toast } from "sonner@2.0.3";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";

interface DriverDocument {
  id: string;
  name: string;
  type: string;
  status: 'Verified' | 'Pending' | 'Expired' | 'Rejected';
  expiryDate: string;
  uploadDate: string;
  url?: string;
}

const MOCK_DOCUMENTS: DriverDocument[] = [
  { id: '1', name: 'Driver License (Front)', type: 'License', status: 'Verified', expiryDate: '2025-10-15', uploadDate: '2023-10-12', url: 'https://images.unsplash.com/photo-1633535928821-6556e974659b?auto=format&fit=crop&q=80&w=1000' },
  { id: '6', name: 'Driver License (Back)', type: 'License Back', status: 'Verified', expiryDate: '2025-10-15', uploadDate: '2023-10-12', url: 'https://images.unsplash.com/photo-1633535928821-6556e974659b?auto=format&fit=crop&q=80&w=1000' },
  { id: '5', name: 'Proof of Address (Water Bill)', type: 'Address Proof', status: 'Verified', expiryDate: '2024-03-20', uploadDate: '2023-12-05', url: 'https://images.unsplash.com/photo-1628191011893-6c6e93821033?auto=format&fit=crop&q=80&w=1000' },
  { id: '4', name: 'Background Check Certificate', type: 'Background Check', status: 'Pending', expiryDate: '2024-06-15', uploadDate: '2023-12-01', url: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&q=80&w=1000' },
];

interface DriverDetailProps {
  driverId: string;
  driverName: string;
  driver?: any;
  trips: Trip[];
  onBack: () => void;
  fleetStats?: {
    avgEarningsPerTrip: number;
    avgAcceptanceRate: number;
    avgRating: number;
    avgWeeklyEarnings: number;
  };
}

export function DriverDetail({ driverId, driverName, driver, trips, onBack, fleetStats }: DriverDetailProps) {
  const [activeTab, setActiveTab] = useState("overview");
  const [tripSearch, setTripSearch] = useState("");
  const [tripPage, setTripPage] = useState(1);
  const [selectedDocument, setSelectedDocument] = useState<DriverDocument | null>(null);
  const tripsPerPage = 10;
  
  // Merge Real Documents with Mock Documents
  const documents = useMemo(() => {
     // Clone mocks
     const docs = MOCK_DOCUMENTS.map(d => ({ ...d }));

     if (driver) {
         // 1. License Front
         if (driver.licenseFrontUrl) {
             const idx = docs.findIndex(d => d.type === 'License');
             if (idx >= 0) {
                 docs[idx].url = driver.licenseFrontUrl;
                 docs[idx].status = 'Verified';
                 docs[idx].uploadDate = new Date().toISOString().split('T')[0];
             }
         }

         // 2. License Back
         if (driver.licenseBackUrl) {
             const idx = docs.findIndex(d => d.type === 'License Back');
             if (idx >= 0) {
                 docs[idx].url = driver.licenseBackUrl;
                 docs[idx].status = 'Verified';
                 docs[idx].uploadDate = new Date().toISOString().split('T')[0];
             }
         }

         // 3. Proof of Address
         if (driver.proofOfAddressUrl) {
             const idx = docs.findIndex(d => d.type === 'Address Proof');
             const docName = `Proof of Address (${driver.proofOfAddressType || 'Document'})`;
             
             if (idx >= 0) {
                 docs[idx].url = driver.proofOfAddressUrl;
                 docs[idx].name = docName;
                 docs[idx].status = 'Verified';
                 docs[idx].uploadDate = new Date().toISOString().split('T')[0];
             } else {
                 // If for some reason it wasn't in mocks (e.g. if we removed it), add it back
                 docs.push({
                     id: 'real-proof-addr',
                     name: docName,
                     type: 'Address Proof',
                     status: 'Verified',
                     expiryDate: '2024-12-31',
                     uploadDate: new Date().toISOString().split('T')[0],
                     url: driver.proofOfAddressUrl
                 });
             }
         }
     }
     return docs;
  }, [driver]);
  
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

     // Platform Stats
     const platformStats = {
        Uber: { earnings: 0, trips: 0, completed: 0, distance: 0, ratingSum: 0, ratingCount: 0 },
        InDrive: { earnings: 0, trips: 0, completed: 0, distance: 0, ratingSum: 0, ratingCount: 0 },
        Other: { earnings: 0, trips: 0, completed: 0, distance: 0, ratingSum: 0, ratingCount: 0 }
     };

     // Chart Data Map
     const chartDataMap = new Map<string, { Uber: number, InDrive: number, Other: number }>();
     
     try {
         const days = eachDayOfInterval({ start, end });
         days.forEach(d => {
             chartDataMap.set(format(d, 'yyyy-MM-dd'), { Uber: 0, InDrive: 0, Other: 0 });
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
            
            const platform = (trip.platform === 'Uber' || trip.platform === 'InDrive') ? trip.platform : 'Other';
            const pStats = platformStats[platform];

            // Platform Stats
            pStats.earnings += trip.amount;
            pStats.trips += 1;
            
            if (trip.status === 'Completed') {
                periodCompletedTrips++;
                pStats.completed++;
            }
            if (trip.status === 'Cancelled') periodCancelledTrips++;
            if (trip.cashCollected) cashCollected += trip.cashCollected;
            
            if (trip.distance) {
                totalDistance += trip.distance;
                pStats.distance += trip.distance;
            }
            if (trip.duration) totalDuration += trip.duration;

            // Hourly Distribution
            const h = tripDateObj.getHours();
            hoursDistribution[h]++;

            // Chart Data
            const dateKey = format(tripDateObj, 'yyyy-MM-dd');
            if (chartDataMap.has(dateKey)) {
                const dayData = chartDataMap.get(dateKey)!;
                dayData[platform] = (dayData[platform] || 0) + trip.amount;
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
     const weeklyEarningsData = Array.from(chartDataMap.entries()).map(([date, amounts]) => {
         const d = new Date(date);
         return {
             day: format(d, 'MMM d'),
             fullDate: date,
             Uber: amounts.Uber,
             InDrive: amounts.InDrive,
             Other: amounts.Other
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
        completionRate,
        platformStats
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
                {driver?.uberDriverId && (
                   <span className="text-xs text-slate-400 ml-5 block">Uber UUID: {driver.uberDriverId}</span>
                )}
                {driver?.inDriveDriverId && (
                   <span className="text-xs text-slate-400 ml-5 block">InDrive UUID: {driver.inDriveDriverId}</span>
                )}
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
            <TabsTrigger value="trips">Trip History</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
         </TabsList>

         <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
               <MetricCard 
                  title={isToday ? "Today's Earnings" : "Period Earnings"} 
                  value={`$${metrics.periodEarnings.toFixed(2)}`} 
                  trend={`${metrics.trendPercent}% vs prev`} 
                  trendUp={metrics.trendUp}
                  icon={<DollarSign className="h-4 w-4 text-slate-500" />}
                   breakdown={[
                       { label: 'Uber', value: `$${metrics.platformStats.Uber.earnings.toFixed(2)}`, color: '#3b82f6' },
                       { label: 'InDrive', value: `$${metrics.platformStats.InDrive.earnings.toFixed(2)}`, color: '#10b981' }
                   ]}
               />
               <MetricCard 
                  title="Completion Rate" 
                  value={`${metrics.completionRate.toFixed(0)}%`} 
                  target="Target: 95%"
                  progress={metrics.completionRate}
                  progressColor={metrics.completionRate >= 95 ? "bg-emerald-500" : "bg-rose-500"}
                  icon={<CheckCircle2 className="h-4 w-4 text-slate-500" />}
                   breakdown={[
                       { label: 'Uber', value: metrics.platformStats.Uber.trips > 0 ? `${Math.round((metrics.platformStats.Uber.completed / metrics.platformStats.Uber.trips) * 100)}%` : '-', color: '#3b82f6' },
                       { label: 'InDrive', value: metrics.platformStats.InDrive.trips > 0 ? `${Math.round((metrics.platformStats.InDrive.completed / metrics.platformStats.InDrive.trips) * 100)}%` : '-', color: '#10b981' }
                   ]}
               />
               <MetricCard 
                  title="Avg Trip Distance" 
                  value={`${metrics.avgDistance.toFixed(1)} km`}
                  subtext="Based on activity"
                  icon={<Navigation className="h-4 w-4 text-slate-500" />}
                   breakdown={[
                       { label: 'Uber', value: metrics.platformStats.Uber.trips > 0 ? `${(metrics.platformStats.Uber.distance / metrics.platformStats.Uber.trips).toFixed(1)} km` : '-', color: '#3b82f6' },
                       { label: 'InDrive', value: metrics.platformStats.InDrive.trips > 0 ? `${(metrics.platformStats.InDrive.distance / metrics.platformStats.InDrive.trips).toFixed(1)} km` : '-', color: '#10b981' }
                   ]}
               />
               <MetricCard 
                  title="Customer Rating" 
                  value="5.0" 
                  subtext="Perfect Score!"
                  icon={<Star className="h-4 w-4 text-slate-500" />}
                   breakdown={[
                       { label: 'Uber', value: metrics.platformStats.Uber.ratingCount > 0 ? (metrics.platformStats.Uber.ratingSum / metrics.platformStats.Uber.ratingCount).toFixed(1) : '5.0', color: '#3b82f6' },
                       { label: 'InDrive', value: metrics.platformStats.InDrive.ratingCount > 0 ? (metrics.platformStats.InDrive.ratingSum / metrics.platformStats.InDrive.ratingCount).toFixed(1) : '5.0', color: '#10b981' }
                   ]}
               />
            </div>

            {/* Benchmarking Section */}
            {fleetStats && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Activity className="h-5 w-5 text-indigo-600" />
                            Performance Benchmarks
                        </CardTitle>
                        <CardDescription>Comparing {driverName} against the fleet average.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Earnings Comparison */}
                            <div className="space-y-2">
                                <div className="flex justify-between items-end">
                                    <span className="text-sm font-medium text-slate-700">Earnings per Trip</span>
                                    <div className="text-right">
                                        <span className="text-lg font-bold">${(metrics.periodEarnings / Math.max(1, metrics.periodCompletedTrips)).toFixed(2)}</span>
                                        <span className="text-xs text-slate-500 ml-2">vs ${fleetStats.avgEarningsPerTrip.toFixed(2)} avg</span>
                                    </div>
                                </div>
                                <div className="relative h-4 bg-slate-100 rounded-full overflow-hidden">
                                    {/* Fleet Avg Marker */}
                                    <div 
                                        className="absolute top-0 bottom-0 w-1 bg-slate-400 z-10" 
                                        style={{ left: '60%' }} 
                                    />
                                    {/* Driver Bar */}
                                    <div 
                                        className={cn("h-full rounded-full", 
                                            (metrics.periodEarnings / Math.max(1, metrics.periodCompletedTrips)) >= fleetStats.avgEarningsPerTrip 
                                                ? "bg-emerald-500" 
                                                : "bg-amber-500"
                                        )}
                                        style={{ width: `${Math.min(100, ((metrics.periodEarnings / Math.max(1, metrics.periodCompletedTrips)) / (fleetStats.avgEarningsPerTrip * 1.5)) * 100)}%` }}
                                    />
                                </div>
                                <p className="text-xs text-slate-500">
                                    {(metrics.periodEarnings / Math.max(1, metrics.periodCompletedTrips)) >= fleetStats.avgEarningsPerTrip 
                                        ? "Performing above fleet average." 
                                        : "Performing below fleet average."}
                                </p>
                            </div>

                            {/* Acceptance Rate Comparison */}
                            <div className="space-y-2">
                                <div className="flex justify-between items-end">
                                    <span className="text-sm font-medium text-slate-700">Acceptance Rate</span>
                                    <div className="text-right">
                                        <span className="text-lg font-bold">{metrics.completionRate.toFixed(0)}%</span>
                                        <span className="text-xs text-slate-500 ml-2">vs {fleetStats.avgAcceptanceRate}% avg</span>
                                    </div>
                                </div>
                                <div className="relative h-4 bg-slate-100 rounded-full overflow-hidden">
                                     {/* Fleet Avg Marker */}
                                     <div 
                                        className="absolute top-0 bottom-0 w-1 bg-slate-400 z-10" 
                                        style={{ left: `${fleetStats.avgAcceptanceRate}%` }} 
                                    />
                                    <div 
                                        className={cn("h-full rounded-full", 
                                            metrics.completionRate >= fleetStats.avgAcceptanceRate ? "bg-emerald-500" : "bg-rose-500"
                                        )}
                                        style={{ width: `${metrics.completionRate}%` }}
                                    />
                                </div>
                                <p className="text-xs text-slate-500">
                                     {metrics.completionRate >= fleetStats.avgAcceptanceRate 
                                        ? "Excellent reliability." 
                                        : "Acceptance rate is critical."}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

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
                           <Bar dataKey="Uber" stackId="a" fill="#3b82f6" />
                           <Bar dataKey="InDrive" stackId="a" fill="#10b981" />
                           <Bar dataKey="Other" stackId="a" fill="#94a3b8" radius={[4, 4, 0, 0]} />
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

         <TabsContent value="trips" className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Trip History</CardTitle>
                    <CardDescription>View and manage full trip logs.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-between gap-4 mb-4">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input 
                                placeholder="Search trip ID, date..." 
                                className="pl-9" 
                                value={tripSearch}
                                onChange={(e) => setTripSearch(e.target.value)}
                            />
                        </div>
                        <Button variant="outline" size="sm">
                            <Filter className="h-4 w-4 mr-2" /> Filter
                        </Button>
                    </div>

                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date & Time</TableHead>
                                <TableHead>Platform</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Distance</TableHead>
                                <TableHead>Duration</TableHead>
                                <TableHead>Earnings</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {trips
                                .filter(t => 
                                    t.id.includes(tripSearch) || 
                                    t.date.includes(tripSearch) ||
                                    (t.status || '').toLowerCase().includes(tripSearch.toLowerCase()) ||
                                    (t.platform || '').toLowerCase().includes(tripSearch.toLowerCase())
                                )
                                .slice((tripPage - 1) * tripsPerPage, tripPage * tripsPerPage)
                                .map((trip) => (
                                <TableRow key={trip.id}>
                                    <TableCell>
                                        <div className="font-medium">{format(new Date(trip.date), 'MMM d, yyyy')}</div>
                                        <div className="text-xs text-slate-500">{format(new Date(trip.date), 'h:mm a')}</div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={
                                            trip.platform === 'Uber' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                            trip.platform === 'InDrive' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                            'bg-slate-50 text-slate-700'
                                        }>
                                            {trip.platform || 'Other'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={
                                            trip.status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                            trip.status === 'Cancelled' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                            'bg-slate-50 text-slate-700'
                                        }>
                                            {trip.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>{trip.distance ? `${trip.distance.toFixed(1)} km` : '-'}</TableCell>
                                    <TableCell>{trip.duration ? `${trip.duration.toFixed(0)} min` : '-'}</TableCell>
                                    <TableCell className="font-medium">${trip.amount.toFixed(2)}</TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                            <Eye className="h-4 w-4 text-slate-400" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {trips.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-24 text-center text-slate-500">
                                        No trips found.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                    
                    {/* Simple Pagination */}
                    <div className="flex items-center justify-end space-x-2 py-4">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setTripPage(p => Math.max(1, p - 1))}
                            disabled={tripPage === 1}
                        >
                            Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setTripPage(p => p + 1)}
                            disabled={tripPage * tripsPerPage >= trips.length}
                        >
                            Next
                        </Button>
                    </div>
                </CardContent>
            </Card>
         </TabsContent>

         <TabsContent value="documents" className="space-y-6">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>Driver Documents</CardTitle>
                        <CardDescription>Manage licenses, insurance, and permits.</CardDescription>
                    </div>
                    <Button size="sm"><Upload className="h-4 w-4 mr-2" /> Upload Document</Button>
                </CardHeader>
                <CardContent>
                     <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Document Name</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Expiry Date</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {documents.map((doc) => (
                                <TableRow key={doc.id}>
                                    <TableCell className="font-medium">
                                        <div className="flex items-center gap-2">
                                            <FileText className="h-4 w-4 text-slate-400" />
                                            {doc.name}
                                        </div>
                                    </TableCell>
                                    <TableCell>{doc.type}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={
                                            doc.status === 'Verified' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                            doc.status === 'Expired' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                            doc.status === 'Pending' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                            'bg-slate-50 text-slate-700'
                                        }>
                                            {doc.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className={
                                        new Date(doc.expiryDate) < new Date() ? 'text-rose-600 font-medium' : ''
                                    }>
                                        {format(new Date(doc.expiryDate), 'MMM d, yyyy')}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-8 w-8 hover:bg-slate-100"
                                            onClick={() => setSelectedDocument(doc)}
                                        >
                                            <Eye className="h-4 w-4 text-slate-500 hover:text-indigo-600" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                     </Table>
                </CardContent>
            </Card>
         </TabsContent>
      </Tabs>

      {/* Document Viewer Modal */}
      <Dialog open={!!selectedDocument} onOpenChange={(open) => !open && setSelectedDocument(null)}>
        <DialogContent className="max-w-3xl w-full h-auto max-h-[90vh] overflow-hidden flex flex-col p-0">
            <DialogHeader className="p-4 pb-2">
                <DialogTitle>{selectedDocument?.name}</DialogTitle>
                <DialogDescription>
                    {selectedDocument?.type} • Uploaded on {selectedDocument?.uploadDate && format(new Date(selectedDocument.uploadDate), 'MMM d, yyyy')}
                </DialogDescription>
            </DialogHeader>
            <div className="flex-1 bg-slate-900 flex items-center justify-center p-4 overflow-auto min-h-[400px]">
                {selectedDocument?.url ? (
                    <img 
                        src={selectedDocument.url} 
                        alt={selectedDocument.name} 
                        className="max-w-full max-h-[70vh] object-contain rounded-md"
                    />
                ) : (
                    <div className="flex flex-col items-center justify-center text-slate-400 gap-2">
                        <FileText className="h-12 w-12 opacity-50" />
                        <p>No preview available</p>
                    </div>
                )}
            </div>
            <div className="p-4 bg-slate-50 border-t flex justify-end gap-2">
                 <Button variant="outline" onClick={() => setSelectedDocument(null)}>Close</Button>
                 {selectedDocument?.url && (
                    <Button onClick={() => window.open(selectedDocument.url, '_blank')}>
                        <Download className="h-4 w-4 mr-2" /> Download
                    </Button>
                 )}
            </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetricCard({ title, value, trend, trendUp, target, progress, progressColor = "bg-indigo-600", subtext, icon, breakdown }: any) {
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
            
            {breakdown && breakdown.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                    {breakdown.map((item: any, index: number) => (
                        <div key={index} className="flex justify-between items-center text-xs">
                            <span className="text-slate-500 flex items-center gap-1.5">
                                <span className={`w-2 h-2 rounded-full`} style={{ backgroundColor: item.color }}></span>
                                {item.label}
                            </span>
                            <span className="font-medium text-slate-700">{item.value}</span>
                        </div>
                    ))}
                </div>
            )}
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