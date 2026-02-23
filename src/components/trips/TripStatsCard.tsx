import React from 'react';
import { Card, CardContent } from "../ui/card";
import { Skeleton } from "../ui/skeleton";
import { Trip } from '../../types/data';
import { TrendingUp, TrendingDown, DollarSign, CheckCircle2, XCircle, Clock } from 'lucide-react';

interface TripStatsCardProps {
  trips: Trip[];
  title?: string;
  loading?: boolean;
  stats?: {
    totalTrips: number;
    completed: number;
    cancelled: number;
    totalEarnings: number;
    totalCashCollected?: number;
    avgEarnings: number;
    avgDuration: number;
  };
}

export function TripStatsCard({ trips, title = "Current View Summary", stats, loading = false }: TripStatsCardProps) {
  let totalTrips = 0;
  let completed = 0;
  let cancelled = 0;
  let totalEarnings = 0;
  let totalCashCollected = 0;
  let avgEarnings = 0;
  let avgDuration = 0;

  if (loading) {
     return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
             {Array.from({ length: 5 }).map((_, i) => (
                 <Card key={i}>
                     <CardContent className="p-4 flex items-center justify-between">
                         <div className="space-y-2">
                             <Skeleton className="h-4 w-20" />
                             <Skeleton className="h-8 w-16" />
                             <Skeleton className="h-3 w-24" />
                         </div>
                         <Skeleton className="h-10 w-10 rounded-full" />
                     </CardContent>
                 </Card>
             ))}
        </div>
     );
  }

  if (stats) {
      // Use provided server-side stats
      totalTrips = stats.totalTrips;
      completed = stats.completed;
      cancelled = stats.cancelled;
      totalEarnings = stats.totalEarnings;
      totalCashCollected = stats.totalCashCollected || 0;
      avgEarnings = stats.avgEarnings;
      avgDuration = stats.avgDuration;
  } else {
      // Fallback to client-side calculation (only works if all trips are loaded)
      totalTrips = trips.length;
      completed = trips.filter(t => t.status === 'Completed').length;
      cancelled = trips.filter(t => t.status === 'Cancelled').length;
      totalEarnings = trips.reduce((sum, t) => {
        // For InDrive trips with fee data, use true profit (net income) instead of full fare
        const effectiveEarnings = (t.platform === 'InDrive' && t.indriveNetIncome != null)
          ? t.indriveNetIncome
          : (t.amount || 0);
        return sum + effectiveEarnings;
      }, 0);
      totalCashCollected = trips.reduce((sum, t) => sum + (t.cashCollected || 0), 0);
      avgEarnings = completed > 0 ? totalEarnings / completed : 0;
      
      const tripsWithDuration = trips.filter(t => t.duration && t.duration > 0);
      const totalDuration = tripsWithDuration.reduce((sum, t) => sum + (t.duration || 0), 0);
      avgDuration = tripsWithDuration.length > 0 ? totalDuration / tripsWithDuration.length : 0;
  }
  
  const completionRate = totalTrips > 0 ? (completed / totalTrips) * 100 : 0;
  const cancellationRate = totalTrips > 0 ? (cancelled / totalTrips) * 100 : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      {/* Total Trips */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Total Trips</p>
            <h3 className="text-2xl font-bold text-slate-900">{totalTrips}</h3>
            <p className="text-xs text-slate-400 mt-1">In selected period</p>
          </div>
          <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
            <Clock className="h-5 w-5" />
          </div>
        </CardContent>
      </Card>

      {/* Completed */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Completed</p>
            <h3 className="text-2xl font-bold text-emerald-600">{completed}</h3>
            <p className="text-xs text-emerald-600 mt-1">{completionRate.toFixed(1)}% Rate</p>
          </div>
          <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </CardContent>
      </Card>

      {/* Cancelled */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Cancelled</p>
            <h3 className="text-2xl font-bold text-rose-600">{cancelled}</h3>
            <p className="text-xs text-rose-600 mt-1">{cancellationRate.toFixed(1)}% Rate</p>
          </div>
          <div className="h-10 w-10 rounded-full bg-rose-100 flex items-center justify-center text-rose-600">
            <XCircle className="h-5 w-5" />
          </div>
        </CardContent>
      </Card>

      {/* Earnings */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Total Earnings</p>
            <h3 className="text-2xl font-bold text-indigo-600">${totalEarnings.toLocaleString(undefined, { maximumFractionDigits: 0 })}</h3>
            <div className="text-xs text-slate-400 mt-1 flex flex-col gap-0.5">
               <span className="text-emerald-600 font-medium">${totalCashCollected.toLocaleString()} Cash</span>
               <span className="text-slate-400">${Math.max(0, totalEarnings - totalCashCollected).toLocaleString()} Payout</span>
            </div>
          </div>
          <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
            <DollarSign className="h-5 w-5" />
          </div>
        </CardContent>
      </Card>

      {/* Avg / Trip */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Avg / Trip</p>
            <h3 className="text-2xl font-bold text-slate-900">${avgEarnings.toFixed(0)}</h3>
            <p className="text-xs text-slate-400 mt-1">
               ~{avgDuration.toFixed(0)} min/trip
            </p>
          </div>
          <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
            <TrendingUp className="h-5 w-5" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}