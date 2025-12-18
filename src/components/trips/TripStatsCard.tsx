import React from 'react';
import { Card, CardContent } from "../ui/card";
import { Trip } from '../../types/data';
import { TrendingUp, TrendingDown, DollarSign, CheckCircle2, XCircle, Clock } from 'lucide-react';

interface TripStatsCardProps {
  trips: Trip[];
  title?: string;
}

export function TripStatsCard({ trips, title = "Current View Summary" }: TripStatsCardProps) {
  const totalTrips = trips.length;
  const completed = trips.filter(t => t.status === 'Completed').length;
  const cancelled = trips.filter(t => t.status === 'Cancelled').length;
  
  const completionRate = totalTrips > 0 ? (completed / totalTrips) * 100 : 0;
  const cancellationRate = totalTrips > 0 ? (cancelled / totalTrips) * 100 : 0;

  const totalEarnings = trips.reduce((sum, t) => sum + (t.amount || 0), 0);
  const avgEarnings = completed > 0 ? totalEarnings / completed : 0;

  // Calculate efficiency (e.g. avg earnings per minute if duration exists)
  const tripsWithDuration = trips.filter(t => t.duration && t.duration > 0);
  const totalDuration = tripsWithDuration.reduce((sum, t) => sum + (t.duration || 0), 0);
  const avgDuration = tripsWithDuration.length > 0 ? totalDuration / tripsWithDuration.length : 0;

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
            <p className="text-xs text-slate-400 mt-1">Gross Revenue</p>
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
