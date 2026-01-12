import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Users, Car, Activity, DollarSign, ArrowUp, ArrowDown } from "lucide-react";
import { DashboardMetrics, Trip } from '../../types/data';
import { Line, LineChart } from "recharts";
import { SafeResponsiveContainer } from '../ui/SafeResponsiveContainer';

interface FleetMetricCardsProps {
  metrics: DashboardMetrics;
  trips?: Trip[];
  onNavigate: (page: string) => void;
}

const TinyChart = ({ data, color }: { data: any[], color: string }) => {
    if (!data || data.length === 0) return <div className="h-[30px] w-[80px]" />;
    
    return (
    <div className="h-[30px] w-[80px]">
        <SafeResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
                <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} />
            </LineChart>
        </SafeResponsiveContainer>
    </div>
)};

export function FleetMetricCards({ metrics, trips = [], onNavigate }: FleetMetricCardsProps) {
  // Calculate hourly earnings for today
  const today = new Date().toISOString().split('T')[0];
  const tripsToday = trips.filter(t => t.date.startsWith(today) && t.status === 'Completed');
  
  const earningsByHour = Array(24).fill(0);
  const tripsByHour = Array(24).fill(0);
  
  tripsToday.forEach(t => {
      const date = new Date(t.date);
      // If time is in date string
      const hour = date.getHours();
      earningsByHour[hour] += t.amount || 0;
      tripsByHour[hour] += 1;
  });

  // Convert to chart data, only up to current hour
  const currentHour = new Date().getHours();
  const earningsSparkline = earningsByHour.slice(0, currentHour + 1).map(v => ({ v }));
  const tripsSparkline = tripsByHour.slice(0, currentHour + 1).map(v => ({ v }));

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">
      {/* Card 1: Active Drivers Today */}
      <Card 
        className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-emerald-500"
        onClick={() => onNavigate('drivers')}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Active Drivers Today</CardTitle>
          <Users className="h-4 w-4 text-emerald-600" />
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-end">
              <div>
                  <div className="text-2xl font-bold">{metrics.activeDrivers}</div>
                  <p className="text-xs text-muted-foreground flex items-center">
                    <span className="text-emerald-500 flex items-center mr-1">
                      <ArrowUp className="h-3 w-3" /> 12%
                    </span>
                    vs Yesterday
                  </p>
              </div>
              {/* No historical data for drivers yet */}
              <div className="h-[30px] w-[80px]" />
          </div>
        </CardContent>
      </Card>

      {/* Card 2: Vehicles Online */}
      <Card 
        className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-blue-500"
        onClick={() => onNavigate('vehicles')}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Vehicles Online</CardTitle>
          <Car className="h-4 w-4 text-blue-600" />
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-end">
              <div>
                <div className="text-2xl font-bold">{metrics.vehiclesOnline}</div>
                <p className="text-xs text-muted-foreground flex items-center">
                    <span className="text-slate-500 flex items-center mr-1">
                    Currently assigned
                    </span>
                </p>
              </div>
              <div className="h-[30px] w-[80px]" />
          </div>
        </CardContent>
      </Card>

      {/* Card 3: Trips in Progress */}
      <Card 
        className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-amber-500"
        onClick={() => onNavigate('trips')}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Trips in Progress</CardTitle>
          <Activity className="h-4 w-4 text-amber-600 animate-pulse" />
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-end">
              <div>
                <div className="text-2xl font-bold">{metrics.tripsInProgress}</div>
                <p className="text-xs text-muted-foreground">
                    {metrics.tripsCompletedToday} Completed Today
                </p>
              </div>
              <TinyChart data={tripsSparkline} color="#f59e0b" />
          </div>
        </CardContent>
      </Card>

      {/* Card 4: Today's Earnings */}
      <Card 
        className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-indigo-500"
        onClick={() => onNavigate('transactions')}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Today's Earnings</CardTitle>
          <DollarSign className="h-4 w-4 text-indigo-600" />
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-end">
              <div>
                <div className="text-2xl font-bold">${metrics.earningsToday.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground flex items-center">
                    <span className="text-emerald-500 flex items-center mr-1">
                    <ArrowUp className="h-3 w-3" /> 8.5%
                    </span>
                    vs Daily Target
                </p>
              </div>
              <TinyChart data={earningsSparkline} color="#6366f1" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
