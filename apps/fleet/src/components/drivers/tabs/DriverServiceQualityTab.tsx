/**
 * Driver Service Quality tab — metric cards + cancelled trips list.
 */
import React from 'react';
import { format } from 'date-fns';
import { AlertTriangle, CheckCircle2, Star, ThumbsUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { MetricCard } from '../OverviewMetricsGrid';
import { ContentVisibilityList } from '../ContentVisibilityList';
import type { Trip } from '../../../types/data';

function parseDisplayDate(dateStr: string | Date | undefined | null): Date | null {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return Number.isNaN(dateStr.getTime()) ? null : dateStr;
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type ServiceQualityMetrics = {
  currentRating: number;
  completionRate: number;
  periodCancelledTrips: number;
  acceptanceRate: number | null;
  totalTrips: number;
  cancellationRate: number;
  platformStats: {
    Uber: { ratingCount: number; ratingSum: number; trips: number; completed: number };
    InDrive: { ratingCount: number; ratingSum: number; trips: number; completed: number };
    [key: string]: { ratingCount?: number; ratingSum?: number; trips: number; completed: number };
  };
};

export type DriverServiceQualityTabProps = {
  metrics: ServiceQualityMetrics;
  cancelledTripsInPeriod: Trip[];
  serverTripsLoaded: boolean;
};

export function DriverServiceQualityTab({
  metrics,
  cancelledTripsInPeriod,
  serverTripsLoaded,
}: DriverServiceQualityTabProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          title="Customer Rating"
          value={metrics.currentRating.toFixed(1)}
          subtext="Last 4 weeks"
          icon={<Star className="h-4 w-4 text-slate-500" />}
          loading={!serverTripsLoaded}
          breakdown={[
            {
              label: 'Uber',
              value:
                metrics.platformStats.Uber.ratingCount > 0
                  ? (metrics.platformStats.Uber.ratingSum / metrics.platformStats.Uber.ratingCount).toFixed(1)
                  : metrics.currentRating.toFixed(1),
              color: '#3b82f6',
            },
            {
              label: 'InDrive',
              value:
                metrics.platformStats.InDrive.ratingCount > 0
                  ? (
                      metrics.platformStats.InDrive.ratingSum / metrics.platformStats.InDrive.ratingCount
                    ).toFixed(1)
                  : metrics.currentRating.toFixed(1),
              color: '#10b981',
            },
          ]}
        />
        <MetricCard
          title="Completion Rate"
          value={`${metrics.completionRate.toFixed(1)}%`}
          icon={<CheckCircle2 className="h-4 w-4 text-slate-500" />}
          progress={metrics.completionRate}
          progressColor="bg-emerald-500"
          target="Target: 95%"
          loading={!serverTripsLoaded}
        />
        <MetricCard
          title="Cancelled Trips"
          value={metrics.periodCancelledTrips}
          icon={<AlertTriangle className="h-4 w-4 text-slate-500" />}
          subtext="In selected period"
          loading={!serverTripsLoaded}
        />
        <MetricCard
          title="Acceptance Rate"
          value={metrics.acceptanceRate !== null ? `${metrics.acceptanceRate}%` : '-'}
          target="Target: >85%"
          progress={metrics.acceptanceRate || 0}
          progressColor={
            !metrics.acceptanceRate
              ? 'bg-slate-200'
              : metrics.acceptanceRate >= 80
                ? 'bg-emerald-500'
                : metrics.acceptanceRate < 40
                  ? 'bg-rose-600'
                  : 'bg-amber-500'
          }
          icon={
            metrics.acceptanceRate !== null && metrics.acceptanceRate < 40 ? (
              <AlertTriangle className="h-4 w-4 text-rose-600 animate-pulse" />
            ) : (
              <ThumbsUp className="h-4 w-4 text-slate-500" />
            )
          }
          loading={!serverTripsLoaded}
          breakdown={[
            {
              label: 'Uber',
              value:
                metrics.platformStats.Uber.trips > 0
                  ? `${Math.round((metrics.platformStats.Uber.completed / metrics.platformStats.Uber.trips) * 100)}%`
                  : '-',
              color: '#3b82f6',
            },
            {
              label: 'InDrive',
              value:
                metrics.platformStats.InDrive.trips > 0
                  ? `${Math.round(
                      (metrics.platformStats.InDrive.completed / metrics.platformStats.InDrive.trips) * 100,
                    )}%`
                  : '-',
              color: '#10b981',
            },
          ]}
        />
        <MetricCard
          title="Cancellation Rate"
          value={metrics.totalTrips > 0 ? `${metrics.cancellationRate.toFixed(1)}%` : '-'}
          target="Target: <5%"
          progress={metrics.cancellationRate}
          progressColor={metrics.cancellationRate < 5 ? 'bg-emerald-500' : 'bg-rose-500'}
          tooltip={`Calculated from ${metrics.periodCancelledTrips} cancelled trips out of ${metrics.totalTrips} total trips in the selected period.`}
          icon={<AlertTriangle className="h-4 w-4 text-slate-500" />}
          loading={!serverTripsLoaded}
          breakdown={[
            {
              label: 'Uber',
              value:
                metrics.platformStats.Uber.trips > 0
                  ? `${(
                      ((metrics.platformStats.Uber.trips - metrics.platformStats.Uber.completed) /
                        metrics.platformStats.Uber.trips) *
                      100
                    ).toFixed(1)}%`
                  : '-',
              color: '#3b82f6',
            },
            {
              label: 'InDrive',
              value:
                metrics.platformStats.InDrive.trips > 0
                  ? `${(
                      ((metrics.platformStats.InDrive.trips - metrics.platformStats.InDrive.completed) /
                        metrics.platformStats.InDrive.trips) *
                      100
                    ).toFixed(1)}%`
                  : '-',
              color: '#10b981',
            },
          ]}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Trip Issues</CardTitle>
        </CardHeader>
        <CardContent>
          {cancelledTripsInPeriod.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <CheckCircle2 className="h-12 w-12 text-emerald-100 fill-emerald-500 mx-auto mb-3" />
              <p>No cancelled trips in this period. Great job!</p>
            </div>
          ) : (
            <ContentVisibilityList
              items={cancelledTripsInPeriod}
              getKey={(t) => t.id}
              maxHeightPx={360}
              estimateRowPx={52}
              renderRow={(t) => {
                const d = parseDisplayDate((t as any).requestTime || t.date);
                return (
                  <div className="py-2.5 flex items-center justify-between gap-3 text-sm border-b border-slate-100 last:border-0">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800 truncate">
                        {t.platform || 'Trip'} · {t.id.slice(0, 8)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {d ? format(d, 'MMM d, yyyy HH:mm') : '—'}
                        {t.pickupAddress ? ` · ${t.pickupAddress}` : ''}
                      </p>
                    </div>
                    <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 shrink-0">
                      Cancelled
                    </Badge>
                  </div>
                );
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
