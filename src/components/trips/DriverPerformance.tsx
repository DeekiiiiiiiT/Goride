import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "../ui/table";
import { Trip } from '../../types/data';
import { 
  Trophy, AlertTriangle, TrendingUp, TrendingDown, User, Car, Star, Activity, MoreHorizontal
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Progress } from "../ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";

interface DriverPerformanceProps {
  trips: Trip[];
}

interface DriverStats {
  id: string;
  name: string;
  vehicleId: string;
  trips: number;
  completed: number;
  cancelled: number;
  earnings: number;
  avgRating: number;
  avgEfficiency: number;
  completionRate: number;
  earningsPerTrip: number;
  trend: 'up' | 'down' | 'stable'; // Comparison of last 5 trips vs previous 5
  status: 'active' | 'risk' | 'churned';
}

export function DriverPerformance({ trips }: DriverPerformanceProps) {
  const [selectedDriver, setSelectedDriver] = useState<DriverStats | null>(null);

  const drivers = useMemo(() => {
    const driverMap = new Map<string, DriverStats>();
    
    // Group trips by driver
    const tripsByDriver = new Map<string, Trip[]>();
    trips.forEach(t => {
        if (!tripsByDriver.has(t.driverId)) tripsByDriver.set(t.driverId, []);
        tripsByDriver.get(t.driverId)!.push(t);
    });

    tripsByDriver.forEach((driverTrips, driverId) => {
        // Sort by date desc
        driverTrips.sort((a, b) => new Date(b.requestTime || b.date).getTime() - new Date(a.requestTime || a.date).getTime());
        
        const totalTrips = driverTrips.length;
        const completed = driverTrips.filter(t => t.status === 'Completed').length;
        const cancelled = driverTrips.filter(t => t.status === 'Cancelled').length;
        const earnings = driverTrips.reduce((sum, t) => sum + (t.status === 'Completed' ? (t.amount || 0) : 0), 0);
        
        // Rating
        const ratedTrips = driverTrips.filter(t => t.tripRating);
        const avgRating = ratedTrips.length > 0 
            ? ratedTrips.reduce((sum, t) => sum + (t.tripRating || 0), 0) / ratedTrips.length 
            : 0; // If no ratings, 0 (handle in UI)
            
        // Efficiency
        const efficientTrips = driverTrips.filter(t => t.efficiencyScore);
        const avgEfficiency = efficientTrips.length > 0 
            ? efficientTrips.reduce((sum, t) => sum + (t.efficiencyScore || 0), 0) / efficientTrips.length 
            : 0;

        // Trend Analysis (Last 5 vs Prev 5 earnings)
        let trend: 'up' | 'down' | 'stable' = 'stable';
        if (driverTrips.length >= 10) {
            const recent = driverTrips.slice(0, 5).reduce((s, t) => s + (t.amount || 0), 0);
            const prev = driverTrips.slice(5, 10).reduce((s, t) => s + (t.amount || 0), 0);
            if (recent > prev * 1.1) trend = 'up';
            else if (recent < prev * 0.9) trend = 'down';
        }

        // Risk Status
        let status: 'active' | 'risk' | 'churned' = 'active';
        const completionRate = totalTrips > 0 ? completed / totalTrips : 0;
        
        // Heuristic: No trips in last 7 days = Churned? (Assuming dataset is current)
        // Heuristic: Completion < 80% = Risk
        if (completionRate < 0.8 || (avgRating > 0 && avgRating < 4.5)) status = 'risk';
        
        // Assuming current data, if last trip > 14 days ago -> Churned
        const lastTripDate = new Date(driverTrips[0].requestTime || driverTrips[0].date);
        const daysSinceLast = (new Date().getTime() - lastTripDate.getTime()) / (1000 * 3600 * 24);
        if (daysSinceLast > 14) status = 'churned';

        driverMap.set(driverId, {
            id: driverId,
            name: driverTrips[0].driverName || 'Unknown Driver',
            vehicleId: driverTrips[0].vehicleId || 'N/A',
            trips: totalTrips,
            completed,
            cancelled,
            earnings,
            avgRating,
            avgEfficiency,
            completionRate,
            earningsPerTrip: completed > 0 ? earnings / completed : 0,
            trend,
            status
        });
    });

    return Array.from(driverMap.values()).sort((a, b) => b.earnings - a.earnings);
  }, [trips]);

  const atRiskDrivers = drivers.filter(d => d.status === 'risk');
  const topDrivers = drivers.slice(0, 5);

  if (drivers.length === 0) {
      return <div className="p-8 text-center text-slate-500">No driver data available for performance analysis.</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* Step 5.3 & 5.4: Alerts Section */}
      {atRiskDrivers.length > 0 && (
          <Card className="border-rose-200 bg-rose-50/30">
              <CardHeader className="pb-2">
                  <div className="flex items-center gap-2 text-rose-700">
                      <AlertTriangle className="h-5 w-5" />
                      <CardTitle className="text-base">Attention Required ({atRiskDrivers.length})</CardTitle>
                  </div>
              </CardHeader>
              <CardContent>
                  <div className="flex flex-wrap gap-4">
                      {atRiskDrivers.map(driver => (
                          <div key={driver.id} className="flex items-center gap-3 bg-white p-3 rounded-lg border border-rose-100 shadow-sm min-w-[250px]">
                              <Avatar className="h-10 w-10 border border-slate-200">
                                  <AvatarFallback className="bg-rose-100 text-rose-700 font-bold">
                                      {driver.name.substring(0, 2).toUpperCase()}
                                  </AvatarFallback>
                              </Avatar>
                              <div>
                                  <p className="font-medium text-sm text-slate-900">{driver.name}</p>
                                  <p className="text-xs text-rose-600 flex items-center gap-1">
                                      {driver.completionRate < 0.8 ? 'High Cancellations' : 'Low Rating'}
                                      <span className="font-bold">
                                          {driver.completionRate < 0.8 ? `${((1-driver.completionRate)*100).toFixed(0)}%` : driver.avgRating.toFixed(1)}
                                      </span>
                                  </p>
                              </div>
                              <Button size="sm" variant="ghost" className="ml-auto h-8 px-2 text-slate-400 hover:text-rose-600">
                                  Review
                              </Button>
                          </div>
                      ))}
                  </div>
              </CardContent>
          </Card>
      )}

      {/* Step 5.1: Leaderboard */}
      <Card>
          <CardHeader>
              <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-amber-500" />
                  Driver Leaderboard
              </CardTitle>
              <CardDescription>Ranked by total earnings and performance metrics</CardDescription>
          </CardHeader>
          <CardContent>
              <Table>
                  <TableHeader>
                      <TableRow className="bg-slate-50">
                          <TableHead className="w-[50px]">Rank</TableHead>
                          <TableHead>Driver</TableHead>
                          <TableHead className="text-center">Status</TableHead>
                          <TableHead className="text-right">Earnings</TableHead>
                          <TableHead className="text-center">Trips</TableHead>
                          <TableHead className="text-center">Efficiency</TableHead>
                          <TableHead className="text-center">Rating</TableHead>
                          <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                  </TableHeader>
                  <TableBody>
                      {drivers.map((driver, idx) => (
                          <TableRow key={driver.id} className="group">
                              <TableCell className="font-medium text-slate-500">
                                  {idx < 3 ? (
                                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                          idx === 0 ? 'bg-amber-100 text-amber-700' :
                                          idx === 1 ? 'bg-slate-200 text-slate-700' :
                                          'bg-orange-100 text-orange-700'
                                      }`}>
                                          {idx + 1}
                                      </div>
                                  ) : (
                                      <span className="ml-2">#{idx + 1}</span>
                                  )}
                              </TableCell>
                              <TableCell>
                                  <div className="flex items-center gap-3">
                                      <Avatar className="h-8 w-8">
                                          <AvatarFallback className="bg-slate-100 text-slate-600">
                                              {driver.name.substring(0, 1)}
                                          </AvatarFallback>
                                      </Avatar>
                                      <div className="flex flex-col">
                                          <span className="font-medium text-slate-900">{driver.name}</span>
                                          <span className="text-xs text-slate-500 font-mono">{driver.vehicleId}</span>
                                      </div>
                                  </div>
                              </TableCell>
                              <TableCell className="text-center">
                                  <Badge variant="outline" className={`
                                      ${driver.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
                                        driver.status === 'risk' ? 'bg-rose-50 text-rose-700 border-rose-200' : 
                                        'bg-slate-100 text-slate-500 border-slate-200'}
                                  `}>
                                      {driver.status === 'active' ? 'Active' : driver.status === 'risk' ? 'At Risk' : 'Inactive'}
                                  </Badge>
                              </TableCell>
                              <TableCell className="text-right font-bold text-slate-900">
                                  ${driver.earnings.toLocaleString(undefined, {maximumFractionDigits: 0})}
                              </TableCell>
                              <TableCell className="text-center">
                                  {driver.completed} <span className="text-slate-400">/ {driver.trips}</span>
                              </TableCell>
                              <TableCell className="text-center">
                                  <div className="flex flex-col items-center">
                                      <span className={`font-bold ${driver.avgEfficiency >= 80 ? 'text-emerald-600' : 'text-slate-600'}`}>
                                          {driver.avgEfficiency.toFixed(0)}
                                      </span>
                                  </div>
                              </TableCell>
                              <TableCell className="text-center">
                                  {driver.avgRating > 0 ? (
                                      <div className="flex items-center justify-center gap-1 text-amber-500 font-bold">
                                          {driver.avgRating.toFixed(1)} <Star className="h-3 w-3 fill-current" />
                                      </div>
                                  ) : (
                                      <span className="text-slate-300">-</span>
                                  )}
                              </TableCell>
                              <TableCell>
                                  <Dialog>
                                      <DialogTrigger asChild>
                                          <Button variant="ghost" size="sm" onClick={() => setSelectedDriver(driver)}>
                                              Details
                                          </Button>
                                      </DialogTrigger>
                                      <DialogContent className="max-w-md">
                                          <DialogHeader>
                                              <DialogTitle className="flex items-center gap-3">
                                                  <Avatar className="h-12 w-12">
                                                      <AvatarFallback className="bg-slate-100 text-lg">
                                                          {driver.name.substring(0,1)}
                                                      </AvatarFallback>
                                                  </Avatar>
                                                  <div>
                                                      {driver.name}
                                                      <div className="text-sm font-normal text-slate-500 flex items-center gap-2">
                                                          <Car className="h-3 w-3" /> {driver.vehicleId}
                                                      </div>
                                                  </div>
                                              </DialogTitle>
                                              <DialogDescription>
                                                  Full performance breakdown for current period.
                                              </DialogDescription>
                                          </DialogHeader>
                                          <div className="space-y-6 py-4">
                                              <div className="grid grid-cols-2 gap-4">
                                                  <div className="p-4 bg-slate-50 rounded-lg">
                                                      <div className="text-sm text-slate-500 mb-1">Total Earnings</div>
                                                      <div className="text-2xl font-bold text-emerald-600">
                                                          ${driver.earnings.toLocaleString()}
                                                      </div>
                                                      <div className="text-xs text-slate-400 mt-1">
                                                          ${driver.earningsPerTrip.toFixed(0)} avg / trip
                                                      </div>
                                                  </div>
                                                  <div className="p-4 bg-slate-50 rounded-lg">
                                                      <div className="text-sm text-slate-500 mb-1">Completion Rate</div>
                                                      <div className="text-2xl font-bold text-slate-900">
                                                          {(driver.completionRate * 100).toFixed(0)}%
                                                      </div>
                                                      <div className="text-xs text-slate-400 mt-1">
                                                          {driver.cancelled} cancellations
                                                      </div>
                                                  </div>
                                              </div>
                                              
                                              <div className="space-y-2">
                                                  <div className="flex justify-between text-sm">
                                                      <span>Efficiency Score</span>
                                                      <span className="font-bold">{driver.avgEfficiency.toFixed(0)}/100</span>
                                                  </div>
                                                  <Progress value={driver.avgEfficiency} className="h-2" />
                                              </div>

                                              <div className="space-y-2">
                                                  <div className="flex justify-between text-sm">
                                                      <span>Customer Rating</span>
                                                      <span className="font-bold text-amber-600">{driver.avgRating > 0 ? driver.avgRating.toFixed(1) : 'N/A'}</span>
                                                  </div>
                                                  <div className="flex gap-1">
                                                      {[1,2,3,4,5].map(star => (
                                                          <Star 
                                                            key={star} 
                                                            className={`h-4 w-4 ${star <= Math.round(driver.avgRating) ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} 
                                                          />
                                                      ))}
                                                  </div>
                                              </div>
                                              
                                              {driver.status === 'risk' && (
                                                  <div className="bg-rose-50 p-3 rounded text-sm text-rose-700 flex gap-2">
                                                      <AlertTriangle className="h-5 w-5 shrink-0" />
                                                      <div>
                                                          <span className="font-bold">Performance Alert:</span> This driver is showing signs of risk due to {driver.completionRate < 0.8 ? 'high cancellation rate' : 'low ratings'}. Consider scheduling a review.
                                                      </div>
                                                  </div>
                                              )}
                                          </div>
                                      </DialogContent>
                                  </Dialog>
                              </TableCell>
                          </TableRow>
                      ))}
                  </TableBody>
              </Table>
          </CardContent>
      </Card>
    </div>
  );
}
