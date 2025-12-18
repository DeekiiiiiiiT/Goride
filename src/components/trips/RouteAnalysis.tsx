import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Badge } from "../ui/badge";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "../ui/table";
import { Trip } from '../../types/data';
import { TrendingUp, AlertTriangle, MapPin, DollarSign, Clock } from 'lucide-react';
import { Progress } from "../ui/progress";

interface RouteAnalysisProps {
  trips: Trip[];
}

interface RouteMetrics {
  id: string;
  name: string;
  pickup: string;
  dropoff: string;
  trips: number;
  completed: number;
  cancelled: number;
  totalEarnings: number;
  totalDistance: number;
  totalDuration: number;
  tipsCount: number;
  surgeCount: number;
  // Calculated
  avgEarnings: number;
  avgDistance: number;
  earningsPerKm: number;
  cancellationRate: number;
  efficiencyScore: number;
}

export function RouteAnalysis({ trips }: RouteAnalysisProps) {
  
  // 1. Aggregation Logic
  const { routes, areas } = useMemo(() => {
    const routeMap = new Map<string, RouteMetrics>();
    const areaMap = new Map<string, { trips: number, cancelled: number, waitTime: number, tips: number, surge: number }>();

    trips.forEach(t => {
        const pickup = t.pickupArea || 'Unknown';
        const dropoff = t.dropoffArea || 'Unknown';
        const routeId = `${pickup}->${dropoff}`;

        // Init Route Stats
        if (!routeMap.has(routeId)) {
            routeMap.set(routeId, {
                id: routeId,
                name: `${pickup} → ${dropoff}`,
                pickup,
                dropoff,
                trips: 0,
                completed: 0,
                cancelled: 0,
                totalEarnings: 0,
                totalDistance: 0,
                totalDuration: 0,
                tipsCount: 0,
                surgeCount: 0,
                avgEarnings: 0,
                avgDistance: 0,
                earningsPerKm: 0,
                cancellationRate: 0,
                efficiencyScore: 0
            });
        }
        
        // Update Route Stats
        const r = routeMap.get(routeId)!;
        r.trips++;
        if (t.status === 'Completed') {
            r.completed++;
            r.totalEarnings += (t.amount || 0);
            r.totalDistance += (t.distance || 0);
            r.totalDuration += (t.duration || 0);
            if (t.fareBreakdown?.tips && t.fareBreakdown.tips > 0) r.tipsCount++;
            if (t.fareBreakdown?.surge && t.fareBreakdown.surge > 0) r.surgeCount++;
        } else if (t.status === 'Cancelled') {
            r.cancelled++;
        }

        // Init/Update Area Stats (Pickup focused for Problem Areas)
        if (!areaMap.has(pickup)) {
            areaMap.set(pickup, { trips: 0, cancelled: 0, waitTime: 0, tips: 0, surge: 0 });
        }
        const a = areaMap.get(pickup)!;
        a.trips++;
        if (t.status === 'Cancelled') a.cancelled++;
        if (t.fareBreakdown?.tips && t.fareBreakdown.tips > 0) a.tips++;
        if (t.fareBreakdown?.surge && t.fareBreakdown.surge > 0) a.surge++;
        // Wait time aggregation if available (placeholder logic)
        a.waitTime += (t.fareBreakdown?.waitTime || 0); 
    });

    // Final Calculations for Routes
    const processedRoutes = Array.from(routeMap.values()).map(r => {
        r.avgEarnings = r.completed > 0 ? r.totalEarnings / r.completed : 0;
        r.avgDistance = r.completed > 0 ? r.totalDistance / r.completed : 0;
        
        // Avoid division by zero
        r.earningsPerKm = r.avgDistance > 0 ? r.avgEarnings / r.avgDistance : 0;
        r.cancellationRate = r.trips > 0 ? r.cancelled / r.trips : 0;
        
        // Efficiency Score Formula: (Earnings/km * Completion Rate) / (Avg Duration / 60)
        // Adjusted for scale: Normalized 0-100
        const completionRate = r.trips > 0 ? r.completed / r.trips : 0;
        const avgDurHours = r.completed > 0 ? (r.totalDuration / r.completed) / 60 : 0.5; // Default 30 min if 0
        
        // Raw Score
        let rawScore = 0;
        if (avgDurHours > 0) {
            rawScore = (r.earningsPerKm * completionRate) / avgDurHours;
        }
        
        // Normalize (Assuming max reasonable score is around 200)
        r.efficiencyScore = Math.min(100, Math.round(rawScore)); // Simplified for now
        
        return r;
    }).filter(r => r.trips >= 2); // Filter out single trips for statistical relevance

    // Final Calculations for Areas
    const processedAreas = Array.from(areaMap.entries()).map(([name, stats]) => ({
        name,
        cancellationRate: stats.trips > 0 ? stats.cancelled / stats.trips : 0,
        tipRate: stats.trips > 0 ? stats.tips / stats.trips : 0,
        surgeFrequency: stats.trips > 0 ? stats.surge / stats.trips : 0,
        avgWaitTime: stats.trips > 0 ? stats.waitTime / stats.trips : 0,
        trips: stats.trips
    }));

    return { 
        routes: processedRoutes.sort((a, b) => b.totalEarnings - a.totalEarnings), // Default sort by Total Earnings
        areas: processedAreas
    };
  }, [trips]);

  const topRoutes = routes.slice(0, 10);
  const efficientRoutes = [...routes].sort((a, b) => b.efficiencyScore - a.efficiencyScore).slice(0, 5);
  
  const problemAreas = areas
     .filter(a => a.cancellationRate > 0.15 || a.tipRate < 0.05)
     .sort((a, b) => b.cancellationRate - a.cancellationRate)
     .slice(0, 5);

  const deadZones = areas
     .filter(a => a.avgWaitTime > 5 || (a.surgeFrequency < 0.1 && a.trips > 5))
     .slice(0, 5);

  if (trips.length === 0) {
      return <div className="p-8 text-center text-slate-500">No trip data available for route analysis.</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* Step 4.1: Top 10 Routes Table */}
      <Card>
          <CardHeader>
              <CardTitle>Route Profitability Ranking</CardTitle>
              <CardDescription>Top performing routes based on total earnings (min 2 trips)</CardDescription>
          </CardHeader>
          <CardContent>
              <Table>
                  <TableHeader>
                      <TableRow className="bg-slate-50">
                          <TableHead className="w-[50px]">Rank</TableHead>
                          <TableHead>Route (Pickup → Dropoff)</TableHead>
                          <TableHead className="text-center">Trips</TableHead>
                          <TableHead className="text-right">Avg Earnings</TableHead>
                          <TableHead className="text-right">Earn / km</TableHead>
                          <TableHead className="text-center">Completion</TableHead>
                          <TableHead className="text-right">Score</TableHead>
                      </TableRow>
                  </TableHeader>
                  <TableBody>
                      {topRoutes.map((route, idx) => (
                          <TableRow key={route.id}>
                              <TableCell className="font-medium text-slate-500">#{idx + 1}</TableCell>
                              <TableCell>
                                  <div className="flex flex-col">
                                      <span className="font-semibold text-slate-900">{route.pickup}</span>
                                      <span className="text-xs text-slate-500 flex items-center gap-1">
                                          <TrendingUp className="h-3 w-3 text-slate-300" />
                                          to {route.dropoff}
                                      </span>
                                  </div>
                              </TableCell>
                              <TableCell className="text-center">{route.trips}</TableCell>
                              <TableCell className="text-right font-medium text-emerald-700">
                                  ${route.avgEarnings.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-right text-slate-600">
                                  ${route.earningsPerKm.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-center">
                                  <Badge variant={route.cancellationRate > 0.1 ? "destructive" : "outline"}>
                                      {((1 - route.cancellationRate) * 100).toFixed(0)}%
                                  </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-2">
                                      <span className="font-bold text-slate-900">{route.efficiencyScore}</span>
                                      <Progress value={route.efficiencyScore} className="w-12 h-2" />
                                  </div>
                              </TableCell>
                          </TableRow>
                      ))}
                      {topRoutes.length === 0 && (
                          <TableRow>
                              <TableCell colSpan={7} className="h-24 text-center text-slate-500">
                                  Not enough data to rank routes (Need at least 2 trips per route)
                              </TableCell>
                          </TableRow>
                      )}
                  </TableBody>
              </Table>
          </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Step 4.2: Best Efficiency */}
          <Card>
              <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-emerald-600" />
                      Most Efficient Routes
                  </CardTitle>
                  <CardDescription>
                      Optimization Targets (High Earnings/km & Reliability)
                  </CardDescription>
              </CardHeader>
              <CardContent>
                  <div className="space-y-4">
                      {efficientRoutes.map((route, i) => (
                          <div key={route.id} className="flex items-center justify-between p-3 bg-emerald-50/50 rounded-lg border border-emerald-100">
                              <div>
                                  <p className="font-medium text-slate-900 text-sm">{route.name}</p>
                                  <p className="text-xs text-emerald-700 mt-1">
                                      ${route.earningsPerKm.toFixed(2)}/km • {((1 - route.cancellationRate) * 100).toFixed(0)}% Reliable
                                  </p>
                              </div>
                              <div className="text-right">
                                  <div className="text-xl font-bold text-emerald-600">{route.efficiencyScore}</div>
                                  <div className="text-[10px] text-slate-400">Score</div>
                              </div>
                          </div>
                      ))}
                  </div>
              </CardContent>
          </Card>

          {/* Step 4.3 & 4.4: Problem Areas & Dead Zones */}
          <div className="space-y-6">
              <Card className="border-rose-200">
                  <CardHeader className="bg-rose-50/50 pb-3">
                      <CardTitle className="flex items-center gap-2 text-rose-800">
                          <AlertTriangle className="h-5 w-5" />
                          Problem Areas
                      </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                      <ul className="space-y-3">
                          {problemAreas.map(area => (
                              <li key={area.name} className="flex items-start gap-2 text-sm">
                                  <MapPin className="h-4 w-4 text-rose-500 mt-0.5 shrink-0" />
                                  <div>
                                      <span className="font-semibold text-slate-800">{area.name}</span>
                                      <div className="flex gap-2 mt-1">
                                          {area.cancellationRate > 0.15 && (
                                              <Badge variant="outline" className="text-[10px] bg-rose-100 text-rose-700 border-rose-200">
                                                  High Cancel {(area.cancellationRate * 100).toFixed(0)}%
                                              </Badge>
                                          )}
                                          {area.tipRate < 0.05 && (
                                              <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-700 border-amber-200">
                                                  Low Tips
                                              </Badge>
                                          )}
                                      </div>
                                  </div>
                              </li>
                          ))}
                          {problemAreas.length === 0 && <li className="text-slate-500 text-sm">No major problem areas detected.</li>}
                      </ul>
                  </CardContent>
              </Card>

              <Card className="border-slate-200">
                  <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-slate-700">
                          <Clock className="h-5 w-5" />
                          Dead Zones (Optimization Needed)
                      </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                       <ul className="space-y-3">
                          {deadZones.map(area => (
                              <li key={area.name} className="flex items-center justify-between text-sm">
                                  <span className="text-slate-700">{area.name}</span>
                                  <span className="text-slate-400 text-xs">
                                      {area.avgWaitTime > 0 ? `${area.avgWaitTime.toFixed(1)}m wait` : 'Low Surge'}
                                  </span>
                              </li>
                          ))}
                           {deadZones.length === 0 && <li className="text-slate-500 text-sm">No dead zones detected.</li>}
                       </ul>
                  </CardContent>
              </Card>
          </div>
      </div>
    </div>
  );
}
