/**
 * Driver Service Quality tab — metric cards + cancelled trips list.
 */
import React, { useMemo } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, CheckCircle2, Star, ThumbsUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { MetricCard } from '../OverviewMetricsGrid';
import { ContentVisibilityList } from '../ContentVisibilityList';
import { PeriodWeekDropdown } from '../../ui/PeriodWeekDropdown';
import type { PeriodWeekOption } from '../../../utils/periodWeekOptions';
import type { Trip } from '../../../types/data';

function parseDisplayDate(dateStr: string | Date | undefined | null): Date | null {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return Number.isNaN(dateStr.getTime()) ? null : dateStr;
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? null : d;
}

const PLATFORM_PREFERRED_ORDER = ['Uber', 'InDrive'];
const PLATFORM_PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b'];

export type PlatformStat = {
  ratingCount?: number;
  ratingSum?: number;
  trips: number;
  completed: number;
};

export type ServiceQualityMetrics = {
  currentRating: number;
  completionRate: number;
  periodCancelledTrips: number;
  acceptanceRate: number | null;
  totalTrips: number;
  cancellationRate: number;
  platformStats: Record<string, PlatformStat>;
};

export type DriverServiceQualityTabProps = {
  metrics: ServiceQualityMetrics;
  cancelledTripsInPeriod: Trip[];
  serverTripsLoaded: boolean;
  periodFrom?: Date;
  periodTo?: Date;
  onPeriodSelect?: (period: PeriodWeekOption) => void;
};

/** Prefer Uber / InDrive order when present; include any other platforms dynamically. */
export function orderedPlatformKeys(platformStats: Record<string, PlatformStat> | undefined | null): string[] {
  const keys = Object.keys(platformStats || {});
  const preferred = PLATFORM_PREFERRED_ORDER.filter((k) => keys.includes(k));
  const rest = keys.filter((k) => !PLATFORM_PREFERRED_ORDER.includes(k)).sort((a, b) => a.localeCompare(b));
  return [...preferred, ...rest];
}

function platformColor(index: number, key: string): string {
  if (key === 'Uber') return '#3b82f6';
  if (key === 'InDrive') return '#10b981';
  return PLATFORM_PALETTE[index % PLATFORM_PALETTE.length];
}

export function DriverServiceQualityTab({
  metrics,
  cancelledTripsInPeriod,
  serverTripsLoaded,
  periodFrom,
  periodTo,
  onPeriodSelect,
}: DriverServiceQualityTabProps) {
  const platforms = useMemo(() => orderedPlatformKeys(metrics.platformStats), [metrics.platformStats]);

  const ratingBreakdown = platforms.map((key, i) => {
    const s = metrics.platformStats[key] || { ratingCount: 0, ratingSum: 0, trips: 0, completed: 0 };
    const count = s.ratingCount || 0;
    const sum = s.ratingSum || 0;
    return {
      label: key,
      value: count > 0 ? (sum / count).toFixed(1) : '—',
      color: platformColor(i, key),
    };
  });

  const acceptanceBreakdown = platforms.map((key, i) => {
    const s = metrics.platformStats[key] || { trips: 0, completed: 0 };
    return {
      label: key,
      value: s.trips > 0 ? `${Math.round((s.completed / s.trips) * 100)}%` : '-',
      color: platformColor(i, key),
    };
  });

  const cancellationBreakdown = platforms.map((key, i) => {
    const s = metrics.platformStats[key] || { trips: 0, completed: 0 };
    return {
      label: key,
      value:
        s.trips > 0
          ? `${(((s.trips - s.completed) / s.trips) * 100).toFixed(1)}%`
          : '-',
      color: platformColor(i, key),
    };
  });

  return (
    <div className="space-y-6">
      {periodFrom && onPeriodSelect && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500 whitespace-nowrap">Period</span>
          <PeriodWeekDropdown
            selectedStart={format(periodFrom, 'yyyy-MM-dd')}
            selectedEnd={format(periodTo || periodFrom, 'yyyy-MM-dd')}
            onSelect={onPeriodSelect}
            weekCount={24}
            allowCustomRange
            placeholder="Select period"
            buttonClassName="h-9"
          />
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          title="Customer Rating"
          value={metrics.currentRating.toFixed(1)}
          subtext="Last 4 weeks"
          icon={<Star className="h-4 w-4 text-slate-500" />}
          loading={!serverTripsLoaded}
          breakdown={ratingBreakdown.length ? ratingBreakdown : undefined}
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
          breakdown={acceptanceBreakdown.length ? acceptanceBreakdown : undefined}
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
          breakdown={cancellationBreakdown.length ? cancellationBreakdown : undefined}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Trip Issues</CardTitle>
        </CardHeader>
        <CardContent>
          {cancelledTripsInPeriod.length === 0 ? (
            <div className="text-center py-8 text-slate-500" data-testid="service-quality-empty">
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
