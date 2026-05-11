import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Badge } from "../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { VehicleMetrics } from '../../types/data';
import { Car, AlertTriangle, TrendingUp, DollarSign, Clock } from 'lucide-react';
import { StatsService } from '../../services/statsService';

interface VehicleHealthCardProps {
  metrics: VehicleMetrics[];
  totalDistance?: number;
}

export function VehicleHealthCard({ metrics, totalDistance = 0 }: VehicleHealthCardProps) {
  if (!metrics || metrics.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-slate-500">
        <p>No vehicle performance data detected.</p>
      </div>
    );
  }

  // Calculate Fleet Averages
  const avgEarningsPerHour = metrics.reduce((acc, m) => acc + (m.earningsPerHour || 0), 0) / metrics.length;
  const totalFleetEarnings = metrics.reduce((acc, m) => acc + (m.totalEarnings || 0), 0);

  // Identify Underperformers (e.g., 20% below average)
  const underperformers = StatsService.identifyUnderperformingVehicles(metrics, avgEarningsPerHour * 0.8);

  return (
    <div className="space-y-6">
      {/* Top Level KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-emerald-50 border-emerald-200">
            <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-emerald-600">Avg Earnings / Hr</p>
                        <h3 className="text-2xl font-bold text-emerald-900">${(avgEarningsPerHour || 0).toFixed(2)}</h3>
                    </div>
                    <TrendingUp className="h-8 w-8 text-emerald-300" />
                </div>
            </CardContent>
        </Card>
        <Card className="bg-slate-50 border-slate-200">
            <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-slate-600">Total Fleet Revenue</p>
                        <h3 className="text-2xl font-bold text-slate-900">${(totalFleetEarnings || 0).toLocaleString()}</h3>
                    </div>
                    <DollarSign className="h-8 w-8 text-slate-300" />
                </div>
            </CardContent>
        </Card>
        <Card className={`${underperformers.length > 0 ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'}`}>
            <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                    <div>
                        <p className={`text-sm font-medium ${underperformers.length > 0 ? 'text-red-600' : 'text-blue-600'}`}>
                            Underperforming Cars
                        </p>
                        <h3 className={`text-2xl font-bold ${underperformers.length > 0 ? 'text-red-900' : 'text-blue-900'}`}>
                            {underperformers.length} <span className="text-sm font-normal text-slate-500">/ {metrics.length}</span>
                        </h3>
                    </div>
                    <AlertTriangle className={`h-8 w-8 ${underperformers.length > 0 ? 'text-red-300' : 'text-blue-300'}`} />
                </div>
            </CardContent>
        </Card>
         <Card className="bg-indigo-50 border-indigo-200">
            <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-indigo-600">Km for Period</p>
                        <h3 className="text-2xl font-bold text-indigo-900">{totalDistance.toLocaleString()} <span className="text-sm font-normal text-indigo-600">km</span></h3>
                    </div>
                    <Car className="h-8 w-8 text-indigo-300" />
                </div>
            </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
            <CardTitle>Vehicle Efficiency Report</CardTitle>
            <CardDescription>
                Analyzing revenue generation per hour of operation. 
                <span className="text-emerald-600 font-medium ml-1">Green</span> = High Efficiency. 
                <span className="text-red-500 font-medium ml-1">Red</span> = Needs Review.
            </CardDescription>
        </CardHeader>
        <CardContent>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Plate Number</TableHead>
                        <TableHead>Total Earnings</TableHead>
                        <TableHead>Hours Online</TableHead>
                        <TableHead>Earnings / Hr</TableHead>
                        <TableHead>Utilization</TableHead>
                        <TableHead>Status</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {metrics.map((m, idx) => {
                        const earningsPerHour = m.earningsPerHour || 0;
                        const totalEarnings = m.totalEarnings || 0;
                        const onlineHours = m.onlineHours || 0;
                        const onTripHours = m.onTripHours || 0;

                        const isUnderperforming = earningsPerHour < (avgEarningsPerHour * 0.8);
                        const isHighPerformer = earningsPerHour > (avgEarningsPerHour * 1.2);
                        
                        return (
                        <TableRow key={idx}>
                            <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                    <Car className="h-4 w-4 text-slate-400" />
                                    {m.plateNumber || m.vehicleId || "Unknown"}
                                </div>
                            </TableCell>
                            <TableCell>${totalEarnings.toLocaleString()}</TableCell>
                            <TableCell>
                                <div className="flex items-center gap-1 text-slate-500">
                                    <Clock className="h-3 w-3" />
                                    {onlineHours.toFixed(1)}h
                                </div>
                            </TableCell>
                            <TableCell className={`font-bold ${isHighPerformer ? 'text-emerald-600' : isUnderperforming ? 'text-red-600' : ''}`}>
                                ${earningsPerHour.toFixed(2)}
                            </TableCell>
                            <TableCell>
                                <span className="text-xs text-slate-500">
                                    {onlineHours > 0 ? ((onTripHours / onlineHours) * 100).toFixed(0) : 0}% On Trip
                                </span>
                            </TableCell>
                            <TableCell>
                                {isHighPerformer ? (
                                    <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border-emerald-200">Top Earner</Badge>
                                ) : isUnderperforming ? (
                                    <Badge className="bg-red-100 text-red-800 hover:bg-red-200 border-red-200">Check Vehicle</Badge>
                                ) : (
                                    <Badge variant="outline">Healthy</Badge>
                                )}
                            </TableCell>
                        </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </CardContent>
      </Card>
    </div>
  );
}
