import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Badge } from "../ui/badge";
import { Trip } from '../../types/data';
import { AlertTriangle, TrendingDown, MapPin, Clock, DollarSign, XCircle } from 'lucide-react';
// import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts'; // Removed unused imports

interface CancellationAnalysisProps {
  trips: Trip[];
}

export function CancellationAnalysis({ trips }: CancellationAnalysisProps) {
  
  // 1. Calculate Core Metrics
  const analysis = useMemo(() => {
    const allTrips = trips;
    const completedTrips = allTrips.filter(t => t.status === 'Completed');
    const cancelledTrips = allTrips.filter(t => t.status === 'Cancelled');
    
    const totalCount = allTrips.length;
    const cancelledCount = cancelledTrips.length;
    const cancelRate = totalCount > 0 ? (cancelledCount / totalCount) * 100 : 0;
    
    // Revenue Impact
    const avgTripValue = completedTrips.reduce((sum, t) => sum + (t.amount || 0), 0) / (completedTrips.length || 1);
    const estimatedLoss = cancelledCount * avgTripValue;
    
    // Breakdown by Actor (Rider vs Driver)
    // Heuristic: If we don't have explicit 'cancelledBy', we look at notes or reasons.
    // For now, let's assume random distribution if data missing, or look for 'driver' in reason.
    let byDriver = 0;
    let byRider = 0;
    cancelledTrips.forEach(t => {
        const reason = (t.cancellationReason || t.notes || '').toLowerCase();
        if (reason.includes('driver') || reason.includes('car')) byDriver++;
        else byRider++;
    });

    // Time Analysis (Heatmap data preparation)
    const timeMatrix = Array(7).fill(0).map(() => Array(24).fill(0)); // 7 days x 24 hours
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    cancelledTrips.forEach(t => {
        const d = new Date(t.requestTime || t.date);
        const dayIdx = d.getDay();
        const hourIdx = d.getHours();
        timeMatrix[dayIdx][hourIdx]++;
    });

    // Location Analysis
    const locationMap = new Map<string, number>();
    cancelledTrips.forEach(t => {
        const area = t.pickupArea || 'Unknown Area';
        locationMap.set(area, (locationMap.get(area) || 0) + 1);
    });
    const topLocations = Array.from(locationMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    return {
        totalCount,
        cancelledCount,
        cancelRate,
        estimatedLoss,
        avgTripValue,
        byDriver,
        byRider,
        timeMatrix,
        days,
        topLocations
    };
  }, [trips]);

  // Heatmap Color Helper
  const getHeatmapColor = (value: number) => {
      if (value === 0) return 'bg-slate-50';
      if (value === 1) return 'bg-rose-100';
      if (value === 2) return 'bg-rose-300';
      return 'bg-rose-500 text-white';
  };

  if (analysis.totalCount === 0) {
      return <div className="p-8 text-center text-slate-500">No trip data available for analysis.</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* Step 3.1: Overview Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="md:col-span-1">
              <CardContent className="p-6 flex flex-col justify-between h-full">
                  <div>
                      <p className="text-sm font-medium text-slate-500 mb-1">Cancellation Rate</p>
                      <div className="flex items-baseline gap-2">
                          <h2 className="text-3xl font-bold text-slate-900">{analysis.cancelRate.toFixed(1)}%</h2>
                          <span className="text-sm text-slate-500">({analysis.cancelledCount}/{analysis.totalCount})</span>
                      </div>
                  </div>
                  <div className="mt-4 flex items-center gap-2 text-rose-600 bg-rose-50 px-3 py-1 rounded-full w-fit text-xs font-medium">
                      <TrendingDown className="h-3 w-3" />
                      Above Target (5%)
                  </div>
              </CardContent>
          </Card>

          <Card className="md:col-span-1">
              <CardContent className="p-6 flex flex-col justify-between h-full">
                  <div>
                      <p className="text-sm font-medium text-slate-500 mb-1">Est. Revenue Lost</p>
                      <h2 className="text-3xl font-bold text-rose-600">${analysis.estimatedLoss.toLocaleString(undefined, {maximumFractionDigits: 0})}</h2>
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                      Based on ${analysis.avgTripValue.toFixed(0)} avg trip value
                  </p>
              </CardContent>
          </Card>

          <Card className="md:col-span-2">
              <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium text-slate-500">Breakdown by Source</CardTitle>
              </CardHeader>
              <CardContent>
                  <div className="space-y-4">
                      <div className="space-y-1">
                          <div className="flex justify-between text-sm">
                              <span>Rider Cancelled</span>
                              <span className="font-bold">{analysis.byRider}</span>
                          </div>
                          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-slate-800" 
                                style={{ width: `${(analysis.byRider / (analysis.cancelledCount || 1)) * 100}%` }}
                              />
                          </div>
                      </div>
                      <div className="space-y-1">
                          <div className="flex justify-between text-sm">
                              <span>Driver Cancelled</span>
                              <span className="font-bold">{analysis.byDriver}</span>
                          </div>
                          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-rose-500" 
                                style={{ width: `${(analysis.byDriver / (analysis.cancelledCount || 1)) * 100}%` }}
                              />
                          </div>
                      </div>
                  </div>
              </CardContent>
          </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Step 3.2: Heat Map Visualization */}
          <Card className="lg:col-span-2">
              <CardHeader>
                  <CardTitle>Cancellation Heat Map</CardTitle>
                  <CardDescription>Frequency of cancellations by Day and Hour</CardDescription>
              </CardHeader>
              <CardContent>
                  <div className="overflow-x-auto">
                      <div className="min-w-[600px]">
                          {/* Hour Labels */}
                          <div className="flex mb-1">
                              <div className="w-12 shrink-0"></div>
                              {Array.from({length: 24}).map((_, i) => (
                                  <div key={i} className="flex-1 text-[10px] text-center text-slate-400">
                                      {i}
                                  </div>
                              ))}
                          </div>
                          
                          {/* Grid */}
                          {analysis.days.map((day, dIdx) => (
                              <div key={day} className="flex items-center mb-1">
                                  <div className="w-12 shrink-0 text-xs font-medium text-slate-500">{day}</div>
                                  {analysis.timeMatrix[dIdx].map((count, hIdx) => (
                                      <div 
                                        key={hIdx}
                                        className={`flex-1 h-8 mx-[1px] rounded-sm flex items-center justify-center text-[10px] ${getHeatmapColor(count)}`}
                                        title={`${day} @ ${hIdx}:00 - ${count} cancellations`}
                                      >
                                          {count > 0 && count}
                                      </div>
                                  ))}
                              </div>
                          ))}
                      </div>
                      <div className="flex justify-end items-center gap-2 mt-4 text-xs text-slate-500">
                          <span>Low</span>
                          <div className="w-16 h-2 bg-gradient-to-r from-rose-100 to-rose-500 rounded-full"></div>
                          <span>High</span>
                      </div>
                  </div>
              </CardContent>
          </Card>

          {/* Step 3.2: Location Analysis */}
          <div className="space-y-6">
              <Card>
                  <CardHeader>
                      <CardTitle>High Risk Areas</CardTitle>
                      <CardDescription>Top locations for cancellations</CardDescription>
                  </CardHeader>
                  <CardContent>
                      <div className="space-y-4">
                          {analysis.topLocations.map(([area, count], idx) => (
                              <div key={area} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                                  <div className="flex items-center gap-3">
                                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${idx === 0 ? 'bg-rose-100 text-rose-600' : 'bg-slate-200 text-slate-600'}`}>
                                          {idx + 1}
                                      </div>
                                      <span className="text-sm font-medium text-slate-700 truncate max-w-[140px]" title={area}>
                                          {area}
                                      </span>
                                  </div>
                                  <Badge variant="outline" className="bg-white">
                                      {count}
                                  </Badge>
                              </div>
                          ))}
                          {analysis.topLocations.length === 0 && (
                              <div className="text-sm text-slate-400 text-center py-4">
                                  No location data available
                              </div>
                          )}
                      </div>
                  </CardContent>
              </Card>

              {/* Step 3.4: Recommendations */}
              <Card className="bg-amber-50 border-amber-200">
                  <CardHeader className="pb-2">
                      <div className="flex items-center gap-2 text-amber-800">
                          <AlertTriangle className="h-5 w-5" />
                          <CardTitle className="text-base">Prevention Tips</CardTitle>
                      </div>
                  </CardHeader>
                  <CardContent>
                      <ul className="text-sm text-amber-800 space-y-2 list-disc pl-4">
                          <li>Avoid <strong>{analysis.topLocations[0]?.[0] || 'high risk'}</strong> area during peak hours.</li>
                          <li>Improve rider communication when ETA {'>'} 8 mins.</li>
                          <li>Review drivers with cancellation rates {'>'} 5%.</li>
                      </ul>
                  </CardContent>
              </Card>
          </div>
      </div>
    </div>
  );
}
