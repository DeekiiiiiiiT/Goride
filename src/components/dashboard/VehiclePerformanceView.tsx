import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { 
  Bar, 
  BarChart, // Added missing BarChart
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  Line,
  LineChart,
  HeatMap
} from 'recharts';
import { SafeResponsiveContainer as ResponsiveContainer } from '../ui/SafeResponsiveContainer';
import { Trip, VehicleMetrics } from '../../types/data';
import { Badge } from "../ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "../ui/table";
import { AlertCircle, CheckCircle2, Clock, Wrench } from 'lucide-react';

interface VehiclePerformanceViewProps {
  trips: Trip[];
  vehicleMetrics: VehicleMetrics[];
}

export function VehiclePerformanceView({ trips, vehicleMetrics }: VehiclePerformanceViewProps) {
  
  // --- 1. Vehicle Table Data ---
  const tableData = useMemo(() => {
      // Use metrics if available, otherwise aggregate from trips
      if (vehicleMetrics.length > 0) {
          return vehicleMetrics;
      }
      
      // Fallback aggregation
      const map = new Map<string, VehicleMetrics>();
      trips.forEach(t => {
          if (!t.vehicleId || t.vehicleId === 'unknown') return;
          if (!map.has(t.vehicleId)) {
              map.set(t.vehicleId, {
                  id: t.vehicleId,
                  vehicleId: t.vehicleId,
                  plateNumber: t.vehicleId,
                  vehicleName: 'Vehicle ' + t.vehicleId.slice(-4),
                  periodStart: '', periodEnd: '',
                  totalEarnings: 0,
                  earningsPerHour: 0,
                  tripsPerHour: 0,
                  onlineHours: 0,
                  onTripHours: 0,
                  totalTrips: 0,
                  utilizationRate: 0,
                  maintenanceStatus: 'Good'
              });
          }
          const v = map.get(t.vehicleId)!;
          v.totalEarnings += t.amount;
          v.totalTrips += 1;
          v.onTripHours += (t.duration || 15) / 60; // Est if missing
          v.onlineHours += (t.duration || 15) / 60 * 1.5; // Est idle time
      });
      
      // Final calcs
      return Array.from(map.values()).map(v => ({
          ...v,
          earningsPerHour: v.onlineHours ? v.totalEarnings / v.onlineHours : 0,
          utilizationRate: v.onlineHours ? (v.onTripHours / v.onlineHours) * 100 : 0
      }));
  }, [trips, vehicleMetrics]);


  // --- 2. Utilization Heat Map Data (Mocked for now as Recharts doesn't strictly have a heatmap) ---
  // We will use a BarChart representing utilization per vehicle as a simple proxy
  const utilizationData = useMemo(() => {
      return tableData
        .sort((a, b) => (b.utilizationRate || 0) - (a.utilizationRate || 0))
        .map(v => ({
            name: v.plateNumber,
            utilization: v.utilizationRate || 0
        }));
  }, [tableData]);

  // --- 3. Maintenance Candidates ---
  const maintenanceList = useMemo(() => {
      return tableData.filter(v => v.maintenanceStatus === 'Due Soon' || v.maintenanceStatus === 'Critical' || (v.onlineHours > 100)); // Logic from Phase 5.3
  }, [tableData]);

  return (
    <div className="space-y-6">
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Utilization Chart (Heat Map proxy) */}
          <Card className="lg:col-span-2">
              <CardHeader>
                  <CardTitle>Fleet Utilization</CardTitle>
                  <CardDescription>Percentage of online time spent on active trips.</CardDescription>
              </CardHeader>
              <CardContent>
          <div className="h-[300px] w-full" style={{ minWidth: '300px' }}>
              <ResponsiveContainer width="100%" height="100%" minWidth={300} minHeight={200}>
                  <BarChart data={utilizationData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} />
                              <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                              <YAxis unit="%" fontSize={12} tickLine={false} axisLine={false} domain={[0, 100]} />
                              <Tooltip cursor={{fill: 'transparent'}} />
                              <Bar dataKey="utilization" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                          </BarChart>
                      </ResponsiveContainer>
                  </div>
              </CardContent>
          </Card>

          {/* Maintenance Schedule / List */}
          <Card className="lg:col-span-1">
              <CardHeader>
                  <CardTitle>Maintenance Status</CardTitle>
                  <CardDescription>Vehicles requiring service based on hours.</CardDescription>
              </CardHeader>
              <CardContent>
                  <div className="space-y-4">
                      {maintenanceList.length > 0 ? (
                          maintenanceList.map(v => (
                              <div key={v.id} className="flex items-center justify-between p-3 bg-slate-50 rounded border border-slate-100">
                                  <div className="flex items-center gap-3">
                                      <div className={`p-2 rounded-full ${
                                          v.maintenanceStatus === 'Critical' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'
                                      }`}>
                                          <Wrench className="h-4 w-4" />
                                      </div>
                                      <div>
                                          <p className="text-sm font-medium">{v.plateNumber}</p>
                                          <p className="text-xs text-slate-500">{v.onlineHours.toFixed(0)} hrs online</p>
                                      </div>
                                  </div>
                                  <Badge variant="outline" className={
                                      v.maintenanceStatus === 'Critical' ? 'text-rose-600 border-rose-200' : 'text-amber-600 border-amber-200'
                                  }>
                                      {v.maintenanceStatus || 'Due'}
                                  </Badge>
                              </div>
                          ))
                      ) : (
                          <div className="flex flex-col items-center justify-center h-40 text-slate-400 text-sm">
                              <CheckCircle2 className="h-8 w-8 mb-2 text-emerald-100" />
                              <p>All vehicles healthy</p>
                          </div>
                      )}
                  </div>
              </CardContent>
          </Card>
      </div>

      {/* Vehicle List Table */}
      <Card>
          <CardHeader>
              <CardTitle>Vehicle Performance Registry</CardTitle>
          </CardHeader>
          <CardContent>
              <Table>
                  <TableHeader>
                      <TableRow>
                          <TableHead>Plate / ID</TableHead>
                          <TableHead>Total Earnings</TableHead>
                          <TableHead>Earnings / Hr</TableHead>
                          <TableHead>Utilization</TableHead>
                          <TableHead>Total Trips</TableHead>
                          <TableHead>Status</TableHead>
                      </TableRow>
                  </TableHeader>
                  <TableBody>
                      {tableData.map(v => (
                          <TableRow key={v.id}>
                              <TableCell className="font-medium">{v.plateNumber}</TableCell>
                              <TableCell>${v.totalEarnings.toFixed(2)}</TableCell>
                              <TableCell>${v.earningsPerHour.toFixed(2)}</TableCell>
                              <TableCell>
                                  <div className="flex items-center gap-2">
                                      <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                                          <div className={`h-full ${
                                              (v.utilizationRate || 0) > 60 ? 'bg-emerald-500' : 
                                              (v.utilizationRate || 0) > 40 ? 'bg-amber-500' : 'bg-rose-500'
                                          }`} style={{ width: `${v.utilizationRate}%` }}></div>
                                      </div>
                                      <span className="text-xs">{v.utilizationRate?.toFixed(0)}%</span>
                                  </div>
                              </TableCell>
                              <TableCell>{v.totalTrips}</TableCell>
                              <TableCell>
                                  <Badge className={
                                      v.maintenanceStatus === 'Critical' ? 'bg-rose-100 text-rose-800' : 
                                      v.maintenanceStatus === 'Due Soon' ? 'bg-amber-100 text-amber-800' : 
                                      'bg-emerald-100 text-emerald-800'
                                  }>
                                      {v.maintenanceStatus || 'Active'}
                                  </Badge>
                              </TableCell>
                          </TableRow>
                      ))}
                      {tableData.length === 0 && (
                          <TableRow>
                              <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                                  No vehicle data available.
                              </TableCell>
                          </TableRow>
                      )}
                  </TableBody>
              </Table>
          </CardContent>
      </Card>
    </div>
  );
}
