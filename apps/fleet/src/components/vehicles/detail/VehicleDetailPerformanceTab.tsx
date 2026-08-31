import React from 'react';
import { Clock, MapPin, Activity } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from 'recharts';
import { SafeResponsiveContainer as ResponsiveContainer } from '../../ui/SafeResponsiveContainer';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../ui/card';
import { TabsContent } from '../../ui/tabs';
import { ErrorBoundary } from '../../ui/ErrorBoundary';

export type VehicleDetailPerformanceAnalytics = {
  trendData: Array<{ date: string; fullDate: Date; earnings: number; trips: number }>;
  activityByHour: Array<{ hour: number; name: string; trips: number; earnings: number }>;
  metrics: {
    earningsPerTrip: number;
    earningsPerKm: number;
    earningsPerHour: number;
    totalDistance: number;
    periodTripCount: number;
  };
};

export interface VehicleDetailPerformanceTabProps {
  analytics: VehicleDetailPerformanceAnalytics;
}

export function VehicleDetailPerformanceTab({ analytics }: VehicleDetailPerformanceTabProps) {
  return (
          <TabsContent value="performance" className="space-y-6 mt-6">
              <ErrorBoundary name="PerformanceCharts">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                      <CardContent className="p-6">
                          <div className="flex justify-between items-start mb-2">
                              <p className="text-sm font-medium text-slate-500">Earnings per Hour</p>
                              <Clock className="h-4 w-4 text-emerald-500" />
                          </div>
                          <h3 className="text-2xl font-bold text-slate-900">${analytics.metrics.earningsPerHour.toFixed(2)}</h3>
                          <p className="text-xs text-slate-400 mt-1">
                              From trip duration in selected period
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
                              Based on {analytics.metrics.periodTripCount} trips
                          </p>
                      </CardContent>
                  </Card>
                  <Card>
                      <CardContent className="p-6">
                          <div className="flex justify-between items-start mb-2">
                              <p className="text-sm font-medium text-slate-500">Earnings per Km</p>
                              <Activity className="h-4 w-4 text-amber-500" />
                          </div>
                          <h3 className="text-2xl font-bold text-slate-900">${analytics.metrics.earningsPerKm.toFixed(2)}</h3>
                          <p className="text-xs text-slate-400 mt-1">
                              {Math.round(analytics.metrics.totalDistance).toLocaleString()} km in period
                          </p>
                      </CardContent>
                  </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                      <CardHeader>
                          <CardTitle>Earnings Trend</CardTitle>
                          <CardDescription>Daily revenue for the selected period</CardDescription>
                      </CardHeader>
                      <CardContent className="h-[300px]">
                          <ResponsiveContainer width="100%" height="100%" minHeight={200}>
                              <BarChart data={analytics.trendData}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                  <XAxis dataKey="date" fontSize={12} tickLine={false} axisLine={false} />
                                  <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
                                  <RechartsTooltip formatter={(value) => [`$${Number(value)}`, 'Earnings']} />
                                  <Bar dataKey="earnings" fill="#6366f1" radius={[4, 4, 0, 0]} />
                              </BarChart>
                          </ResponsiveContainer>
                      </CardContent>
                  </Card>
                  <Card>
                      <CardHeader>
                          <CardTitle>Hourly Activity</CardTitle>
                          <CardDescription>Peak earning hours</CardDescription>
                      </CardHeader>
                      <CardContent className="h-[300px]">
                          <ResponsiveContainer width="100%" height="100%" minHeight={200}>
                              <BarChart data={analytics.activityByHour}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                  <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} interval={2} />
                                  <YAxis fontSize={12} tickLine={false} axisLine={false} />
                                  <RechartsTooltip />
                                  <Bar dataKey="trips" fill="#10b981" radius={[4, 4, 0, 0]} name="Trips" />
                              </BarChart>
                          </ResponsiveContainer>
                      </CardContent>
                  </Card>
                </div>
              </ErrorBoundary>
          </TabsContent>
  );
}
