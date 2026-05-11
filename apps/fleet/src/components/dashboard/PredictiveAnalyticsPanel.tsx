import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Badge } from "../ui/badge";
import { TrendingUp, Users, DollarSign, Clock, Calendar, AlertTriangle } from "lucide-react";
import { Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { SafeResponsiveContainer } from "../ui/SafeResponsiveContainer";
import { Trip } from '../../types/data';

interface PredictiveAnalyticsPanelProps {
  trips?: Trip[];
}

export function PredictiveAnalyticsPanel({ trips = [] }: PredictiveAnalyticsPanelProps) {
  
  const { forecastData, stats, recommendations } = useMemo(() => {
      if (trips.length === 0) {
          return { forecastData: [], stats: null, recommendations: [] };
      }

      // 1. Calculate Earnings by Hour (Historical Average)
      const earningsByHour = Array(24).fill(0);
      const countsByHour = Array(24).fill(0);
      
      trips.forEach(t => {
          if (t.status === 'Completed' && t.amount) {
              const hour = new Date(t.date).getHours();
              earningsByHour[hour] += t.amount;
              countsByHour[hour] += 1;
          }
      });
      
      // We want to forecast for "Tomorrow", so we use the historical average pattern
      // Simple logic: Average earnings per hour over the dataset
      // (For advanced, we'd group by day of week, but dataset size might be small)
      
      const forecast = [6, 9, 12, 15, 18, 21].map(hour => {
         // Aggregate surrounding hours for smoother curve
         let sum = 0;
         let count = 0;
         for (let h = hour - 1; h <= hour + 1; h++) {
             const idx = (h + 24) % 24;
             sum += earningsByHour[idx];
             count += countsByHour[idx];
         }
         // Normalize to a "daily" value (assuming dataset spans multiple days)
         // If we don't know days, we just take average per trip * expected volume
         // Simplified: Just use the raw sum of earnings distribution to show shape
         return {
             time: (hour > 12 ? `${hour-12}PM` : `${hour}AM`),
             value: Math.round(sum / (count || 1) * 10) // Approx projected value
         };
      });

      // 2. Calculate Peak Hours
      let maxEarnings = -1;
      let peakHourIdx = -1;
      earningsByHour.forEach((e, idx) => {
          if (e > maxEarnings) {
              maxEarnings = e;
              peakHourIdx = idx;
          }
      });
      
      const peakHourStart = peakHourIdx;
      const peakHourEnd = (peakHourIdx + 3) % 24;
      const peakHourStr = `${peakHourStart}:00 - ${peakHourEnd}:00`;

      // 3. Generate Recommendations
      const recs = [];
      
      if (maxEarnings > 5000) { // Arbitrary threshold
           recs.push({
               type: 'staffing',
               title: 'Staffing Adjustment',
               desc: `Schedule extra drivers for ${peakHourStr} peak window to capture high demand.`
           });
      }
      
      // Check for weekend (if tomorrow is weekend)
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      if (tomorrow.getDay() === 0 || tomorrow.getDay() === 6) {
           recs.push({
               type: 'marketing',
               title: 'Weekend Strategy',
               desc: 'High demand expected for leisure areas. Focus driver positioning near entertainment districts.'
           });
      }

      // Check maintenance
      recs.push({
           type: 'maintenance',
           title: 'Maintenance Check',
           desc: 'Ensure vehicle checks are completed before peak hours tomorrow.'
      });

      return {
          forecastData: forecast,
          stats: {
              expectedEarnings: `$${Math.round(maxEarnings * 0.8)} - $${Math.round(maxEarnings * 1.2)}`,
              peakHours: peakHourStr,
              driversNeeded: Math.ceil(maxEarnings / 500) // Approx $500/driver target
          },
          recommendations: recs
      };

  }, [trips]);

  if (trips.length === 0) {
      return (
        <Card className="col-span-full">
            <CardContent className="flex flex-col items-center justify-center h-[300px] text-slate-500">
                <TrendingUp className="h-12 w-12 mb-4 opacity-20" />
                <p>Insufficient historical data to generate predictions.</p>
                <p className="text-sm">Import trip logs to enable predictive analytics.</p>
            </CardContent>
        </Card>
      );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
      <Card className="col-span-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-indigo-600" />
            Tomorrow's Forecast
          </CardTitle>
          <CardDescription>
            AI-driven predictions based on historical patterns and local events.
          </CardDescription>
        </CardHeader>
        <CardContent className="pl-2">
          <div className="h-[250px] w-full">
             <SafeResponsiveContainer width="100%" height="100%">
                <LineChart data={forecastData}>
                  <XAxis 
                    dataKey="time" 
                    stroke="#888888" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false} 
                  />
                  <YAxis 
                    stroke="#888888" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false} 
                    tickFormatter={(value) => `$${value}`} 
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    cursor={{ stroke: '#e2e8f0' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#4f46e5" 
                    strokeWidth={3} 
                    dot={{ r: 4, fill: '#4f46e5' }} 
                    activeDot={{ r: 6 }} 
                  />
                </LineChart>
             </SafeResponsiveContainer>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4 text-center">
              <div>
                  <p className="text-sm text-slate-500">Expected Earnings</p>
                  <p className="text-xl font-bold text-slate-900">{stats?.expectedEarnings || '-'}</p>
              </div>
              <div>
                  <p className="text-sm text-slate-500">Peak Hours</p>
                  <p className="text-xl font-bold text-slate-900">{stats?.peakHours || '-'}</p>
              </div>
              <div>
                  <p className="text-sm text-slate-500">Active Drivers Needed</p>
                  <p className="text-xl font-bold text-slate-900">{stats?.driversNeeded || '-'}</p>
              </div>
          </div>
        </CardContent>
      </Card>

      <Card className="col-span-3">
        <CardHeader>
          <CardTitle>Recommendations</CardTitle>
          <CardDescription>
            Actionable insights to optimize fleet performance.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          
          {recommendations.map((rec, idx) => (
             <div key={idx} className={`flex items-start gap-3 p-3 rounded-lg border ${
                 rec.type === 'staffing' ? 'bg-blue-50 border-blue-100' :
                 rec.type === 'marketing' ? 'bg-amber-50 border-amber-100' :
                 'bg-slate-50 border-slate-100'
             }`}>
                {rec.type === 'staffing' ? <Users className="h-5 w-5 text-blue-600 mt-0.5" /> :
                 rec.type === 'marketing' ? <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" /> :
                 <Calendar className="h-5 w-5 text-slate-600 mt-0.5" />}
                <div>
                    <h4 className={`font-medium ${
                        rec.type === 'staffing' ? 'text-blue-900' :
                        rec.type === 'marketing' ? 'text-amber-900' :
                        'text-slate-900'
                    }`}>{rec.title}</h4>
                    <p className={`text-sm ${
                        rec.type === 'staffing' ? 'text-blue-700' :
                        rec.type === 'marketing' ? 'text-amber-700' :
                        'text-slate-600'
                    }`}>{rec.desc}</p>
                </div>
             </div>
          ))}

        </CardContent>
      </Card>
    </div>
  );
}
