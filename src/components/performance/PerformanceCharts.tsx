import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts';
import { SafeResponsiveContainer as ResponsiveContainer } from '../ui/SafeResponsiveContainer';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { DriverPerformanceSummary } from '../../types/performance';
import { getTopPerformers } from '../../utils/performanceUtils';

interface PerformanceChartsProps {
  drivers: DriverPerformanceSummary[];
}

export function PerformanceCharts({ drivers }: PerformanceChartsProps) {
  const dailyStats = useMemo(() => {
    const stats: Record<string, { date: string; earnings: number; trips: number; count: number }> = {};
    
    // Check if history is available for at least one driver
    const hasHistory = drivers.some(d => d.history && d.history.length > 0);
    if (!hasHistory) return [];

    drivers.forEach(d => {
      if (d.history) {
        d.history.forEach(day => {
          if (!day.date) return; // Skip entries with null/undefined dates
          if (!stats[day.date]) {
            stats[day.date] = { date: day.date, earnings: 0, trips: 0, count: 0 };
          }
          stats[day.date].earnings += day.earnings;
          stats[day.date].trips += day.trips;
          stats[day.date].count += 1;
        });
      }
    });

    return Object.values(stats)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({
        ...d,
        avgEarnings: Math.round(d.earnings / d.count),
        dateShort: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
      }));
  }, [drivers]);

  const topDrivers = useMemo(() => {
    return getTopPerformers(drivers, 10).map((d, idx) => {
      const firstName = (d.driverName || `Driver ${idx + 1}`).split(' ')[0];
      return {
        uniqueName: `${d.driverName || `Driver ${idx + 1}`}_${idx}`,
        displayName: firstName,
        fullName: d.driverName || `Driver ${idx + 1}`,
        successRate: d.successRate,
        earnings: d.totalEarnings
      };
    });
  }, [drivers]);

  if (drivers.length === 0) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Fleet Daily Revenue</CardTitle>
          <CardDescription>Total earnings across all drivers over the period.</CardDescription>
        </CardHeader>
        <CardContent>
          <div style={{ width: '100%', height: '300px', minWidth: '300px', minHeight: '300px', display: 'block', position: 'relative' }}>
            {dailyStats.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={300} minHeight={300}>
                <BarChart data={dailyStats}>
                  <CartesianGrid key="grid" strokeDasharray="3 3" vertical={false} />
                  <XAxis key="xaxis" dataKey="date" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value: string) => {
                    try { return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }); } catch { return value; }
                  }} />
                  <YAxis key="yaxis" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
                  <Tooltip key="tooltip" 
                    cursor={{ fill: '#f4f4f5' }}
                    content={({ active, payload, label }) => {
                       if (active && payload && payload.length) {
                        const displayDate = (() => { try { return new Date(label).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }); } catch { return label; } })();
                        return (
                          <div className="rounded-lg border bg-background p-2 shadow-sm">
                            <div className="grid grid-cols-2 gap-2">
                              <div className="flex flex-col">
                                <span className="text-[0.70rem] uppercase text-muted-foreground">
                                  Date
                                </span>
                                <span className="font-bold text-muted-foreground">
                                  {displayDate}
                                </span>
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[0.70rem] uppercase text-muted-foreground">
                                  Revenue
                                </span>
                                <span className="font-bold">
                                  ${payload[0].value?.toLocaleString()}
                                </span>
                              </div>
                            </div>
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                  <Bar key="bar" dataKey="earnings" fill="#0f172a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <p>Daily history not available in summary view.</p>
                <p className="text-sm">Select a specific driver for detailed analysis.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Top Performers</CardTitle>
          <CardDescription>Drivers with the highest quota success rates.</CardDescription>
        </CardHeader>
        <CardContent>
          <div style={{ width: '100%', height: '300px', minWidth: '300px', minHeight: '300px', display: 'block', position: 'relative' }}>
            <ResponsiveContainer width="100%" height="100%" minWidth={300} minHeight={300}>
              <BarChart data={topDrivers} layout="vertical" margin={{ left: 0 }}>
                <CartesianGrid key="grid" strokeDasharray="3 3" horizontal={true} vertical={false} />
                <XAxis key="xaxis" type="number" domain={[0, 100]} unit="%" hide />
                <YAxis key="yaxis" dataKey="uniqueName" type="category" width={80} fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value: string) => value.split('_')[0].split(' ')[0]} />
                <Tooltip key="tooltip"
                  cursor={{ fill: '#f4f4f5' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="rounded-lg border bg-background p-2 shadow-sm">
                          <p className="font-bold mb-1">{data.fullName}</p>
                          <div className="flex flex-col gap-1">
                             <div className="flex justify-between gap-4">
                                <span className="text-xs text-muted-foreground">Success Rate</span>
                                <span className="text-xs font-medium">{data.successRate.toFixed(1)}%</span>
                             </div>
                             <div className="flex justify-between gap-4">
                                <span className="text-xs text-muted-foreground">Earnings</span>
                                <span className="text-xs font-medium">${data.earnings.toLocaleString()}</span>
                             </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar key="bar" dataKey="successRate" fill="#10b981" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}