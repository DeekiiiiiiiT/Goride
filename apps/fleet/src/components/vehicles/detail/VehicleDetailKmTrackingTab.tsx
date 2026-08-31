import React from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { Vehicle } from '../../../types/vehicle';
import { KmLTracking } from '../KmLTracking';

export type VehicleDetailKmTrackingAnalytics = {
  kmTrackingData: Array<{
    date: string;
    fullDate: Date;
    uber: number;
    indrive: number;
    roam: number;
    other: number;
  }>;
  metrics: {
    totalDistance: number;
    earningsPerKm: number;
  };
};

export interface VehicleDetailKmTrackingTabProps {
  analytics: VehicleDetailKmTrackingAnalytics;
  vehicle: Vehicle;
}

export function VehicleDetailKmTrackingTab({ analytics, vehicle }: VehicleDetailKmTrackingTabProps) {
  return (
          <TabsContent value="km-tracking" className="space-y-6 mt-6">
              <Tabs defaultValue="km-overview" className="w-full">
                  <TabsList className="w-full justify-start bg-transparent border-b border-slate-200 rounded-none h-auto p-0 mb-6 gap-6">
                      <TabsTrigger 
                          value="km-overview" 
                          className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 border-b-2 border-transparent rounded-none px-0 py-2"
                      >
                          Km Overview
                      </TabsTrigger>
                      <TabsTrigger 
                          value="kml-tracking" 
                          className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 border-b-2 border-transparent rounded-none px-0 py-2"
                      >
                          Km/L Tracking
                      </TabsTrigger>
                  </TabsList>

                  <TabsContent value="km-overview" className="space-y-6 mt-0">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <Card>
                              <CardHeader>
                                  <CardTitle>Km by Platform</CardTitle>
                                  <CardDescription>Where are the miles coming from?</CardDescription>
                              </CardHeader>
                              <CardContent className="h-[300px]">
                                  <ResponsiveContainer width="100%" height="100%" minHeight={200}>
                                      <BarChart data={analytics.kmTrackingData}>
                                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                          <XAxis dataKey="date" fontSize={12} tickLine={false} axisLine={false} />
                                          <YAxis fontSize={12} tickLine={false} axisLine={false} />
                                          <RechartsTooltip />
                                          <Bar dataKey="uber" stackId="a" fill="#000000" name="Uber" />
                                          <Bar dataKey="indrive" stackId="a" fill="#10b981" name="InDrive" />
                                          <Bar dataKey="roam" stackId="a" fill="#6366f1" name="Roam" />
                                          <Bar dataKey="other" stackId="a" fill="#94a3b8" name="Other" radius={[4, 4, 0, 0]} />
                                      </BarChart>
                                  </ResponsiveContainer>
                              </CardContent>
                          </Card>
                          
                          <Card>
                              <CardHeader>
                                  <CardTitle>Projected Annual Mileage</CardTitle>
                                  <CardDescription>Based on current trends</CardDescription>
                              </CardHeader>
                              <CardContent>
                                  <div className="text-center py-10">
                                      <div className="text-5xl font-bold text-slate-900 mb-2">
                                          {((analytics.metrics.totalDistance / 30) * 365).toLocaleString(undefined, {maximumFractionDigits: 0})}
                                      </div>
                                      <p className="text-sm text-slate-500 uppercase tracking-widest font-semibold">Km / Year</p>
                                      <div className="mt-6 flex justify-center gap-8">
                                          <div>
                                              <p className="text-2xl font-bold text-slate-700">{(analytics.metrics.totalDistance / 30).toFixed(1)}</p>
                                              <p className="text-xs text-slate-400">Avg Km / Day</p>
                                          </div>
                                          <div>
                                              <p className="text-2xl font-bold text-slate-700">{(analytics.metrics.earningsPerKm * (analytics.metrics.totalDistance / 30)).toLocaleString(undefined, {style: 'currency', currency: 'USD'})}</p>
                                              <p className="text-xs text-slate-400">Est. Daily Rev</p>
                                          </div>
                                      </div>
                                  </div>
                              </CardContent>
                          </Card>
                      </div>
                  </TabsContent>

                  <TabsContent value="kml-tracking" className="space-y-6 mt-0">
                      <KmLTracking vehicle={vehicle} />
                  </TabsContent>
              </Tabs>
          </TabsContent>
  );
}
