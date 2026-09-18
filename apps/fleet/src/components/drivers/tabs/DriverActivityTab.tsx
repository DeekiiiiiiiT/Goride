/**
 * Driver Activity tab — forensic timeline for Driver Detail.
 * Durations come from the server; never subtract adjacent visible timestamps.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChevronDown, ChevronRight, Download, Lock } from 'lucide-react';
import { api } from '../../../services/api';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { TabLoadingSkeleton } from '../../ui/TabLoadingSkeleton';
import { ContentVisibilityList } from '../ContentVisibilityList';
import { MetricCard } from '../OverviewMetricsGrid';
import { isUnsupportedActivityPlatform, type CoverageWindow } from '../../../utils/driverActivityModel';
import { useDriverPeriod } from '../context/DriverPeriodContext';
import { formatInFleetTz, fleetCalendarDay, useFleetTimezone } from '../../../utils/timezoneDisplay';

export type DriverActivityTabProps = {
  driverId: string;
  selectedPlatforms?: Set<string>;
};

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

function eventLabel(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function CoverageBanner({ coverage, tz }: { coverage: CoverageWindow[]; tz: string }) {
  const uncovered = coverage.filter((c) => !c.recorded);
  if (!uncovered.length) return null;
  const wholly = coverage.every((c) => !c.recorded);
  return (
    <div
      className="rounded-md border border-dashed border-slate-300 bg-[repeating-linear-gradient(135deg,#f1f5f9,#f1f5f9_8px,#e2e8f0_8px,#e2e8f0_16px)] px-3 py-2 text-sm text-slate-700"
      data-testid="activity-coverage-banner"
      role="status"
    >
      {wholly
        ? uncovered[0]?.reason || 'Activity was not recorded for this window.'
        : `Partial coverage — some time in this range was not recorded (from ${formatInFleetTz(uncovered[0].from, tz)}).`}
    </div>
  );
}

function UnsupportedPlatformState({ platform }: { platform: string }) {
  return (
    <div
      className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-950"
      data-testid="activity-unsupported-platform"
      role="status"
    >
      <p className="font-medium">Per-event activity isn&apos;t available for {platform}.</p>
      <p className="mt-1 text-amber-800">
        {platform} reports weekly totals only — see Overview → Time Metrics.
      </p>
    </div>
  );
}

export function DriverActivityTab({ driverId, selectedPlatforms }: DriverActivityTabProps) {
  const { period } = useDriverPeriod();
  const fleetTimezone = useFleetTimezone() || 'America/Jamaica';
  const from = period.from.toISOString();
  const to = period.to.toISOString();

  const platformFilter = useMemo(() => {
    if (!selectedPlatforms || selectedPlatforms.has('All') || selectedPlatforms.size === 0) {
      return null;
    }
    return [...selectedPlatforms][0];
  }, [selectedPlatforms]);

  const unsupported = platformFilter ? isUnsupportedActivityPlatform(platformFilter) : false;

  const [serviceLine, setServiceLine] = useState<'all' | 'roam_rides' | 'roam_rush'>('all');
  const [eventType, setEventType] = useState<string>('all');
  const [sort, setSort] = useState<'desc' | 'asc'>('desc');
  const [cursor, setCursor] = useState<string | null>(null);
  const [accumulated, setAccumulated] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const serviceLines = serviceLine === 'all' ? 'roam_rides,roam_rush' : serviceLine;

  const summaryQuery = useQuery({
    queryKey: ['driverActivitySummary', driverId, from, to, serviceLines],
    queryFn: () => api.getDriverActivitySummary(driverId, { from, to, serviceLines }),
    enabled: Boolean(driverId) && !unsupported,
    staleTime: 120_000,
  });

  const pageQuery = useQuery({
    queryKey: ['driverActivity', driverId, from, to, serviceLines, eventType, sort, cursor],
    queryFn: () =>
      api.getDriverActivity(driverId, {
        from,
        to,
        serviceLines,
        eventTypes: eventType === 'all' ? undefined : eventType,
        sort,
        cursor: cursor || undefined,
        limit: 200,
        platform: platformFilter || undefined,
      }),
    enabled: Boolean(driverId) && !unsupported,
    staleTime: 60_000,
  });

  useEffect(() => {
    setCursor(null);
    setAccumulated([]);
  }, [driverId, from, to, serviceLines, eventType, sort, platformFilter]);

  useEffect(() => {
    if (!pageQuery.data?.data) return;
    setAccumulated((prev) => {
      if (!cursor) return pageQuery.data.data;
      const seen = new Set(prev.map((r: any) => r.id));
      const next = [...prev];
      for (const row of pageQuery.data.data) {
        if (!seen.has(row.id)) next.push(row);
      }
      return next;
    });
  }, [pageQuery.data, cursor]);

  const events = accumulated;
  const dayGroups = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const e of events) {
      const day = fleetCalendarDay(e.occurred_at, fleetTimezone) || e.occurred_at.slice(0, 10);
      const list = map.get(day) || [];
      list.push(e);
      map.set(day, list);
    }
    return [...map.entries()];
  }, [events, fleetTimezone]);

  if (unsupported) {
    return <UnsupportedPlatformState platform={platformFilter || 'Uber'} />;
  }

  if (pageQuery.isLoading && !accumulated.length) {
    return (
      <div className="space-y-3" data-testid="activity-loading">
        <TabLoadingSkeleton />
      </div>
    );
  }

  if (pageQuery.isError) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
        Failed to load activity. {(pageQuery.error as Error)?.message}
        <Button variant="outline" size="sm" className="ml-2" onClick={() => void pageQuery.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const payload = pageQuery.data;
  if (payload?.unsupportedPlatform) {
    return <UnsupportedPlatformState platform={payload.platform || platformFilter || 'Uber'} />;
  }

  const coverage: CoverageWindow[] = payload?.coverage || [];
  const whollyUncovered = coverage.length > 0 && coverage.every((c) => !c.recorded);
  const summary = summaryQuery.data;
  const watermark = payload?.watermark as string | null | undefined;
  const lagMs = watermark ? Date.now() - Date.parse(watermark) : 0;
  const stale = lagMs > 15 * 60_000;

  const toggleCluster = (jobRef: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(jobRef)) next.delete(jobRef);
      else next.add(jobRef);
      return next;
    });
  };

  return (
    <div className="space-y-4" data-testid="driver-activity-tab">
      <CoverageBanner coverage={coverage} tz={fleetTimezone} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5" data-testid="activity-summary-strip">
        <MetricCard
          title="Online hours"
          value={
            summary?.onlineSeconds != null
              ? formatDuration(summary.onlineSeconds)
              : summaryQuery.isLoading
                ? '…'
                : '—'
          }
        />
        <MetricCard
          title="Utilization"
          value={summary?.utilizationPct != null ? `${Math.round(summary.utilizationPct)}%` : '—'}
        />
        <MetricCard title="Offers" value={summary?.offersReceived ?? '—'} />
        <MetricCard
          title="Acceptance"
          value={summary?.acceptanceRate == null ? '—' : `${Math.round(summary.acceptanceRate)}%`}
        />
        <MetricCard
          title="Cancels"
          value={summary?.cancellationRate == null ? '—' : `${Math.round(summary.cancellationRate)}%`}
        />
      </div>
      {summary?.basis && summary.basis !== 'event' && (
        <p className="text-xs text-slate-500">Basis: {summary.basis}</p>
      )}

      <div className="flex flex-wrap items-center gap-2" data-testid="activity-filters">
        <Select value={serviceLine} onValueChange={(v) => setServiceLine(v as typeof serviceLine)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Service line" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All lines</SelectItem>
            <SelectItem value="roam_rides">Roam Rides</SelectItem>
            <SelectItem value="roam_rush">Roam Rush</SelectItem>
          </SelectContent>
        </Select>
        <Select value={eventType} onValueChange={setEventType}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Event type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All events</SelectItem>
            <SelectItem value="went_online">Went online</SelectItem>
            <SelectItem value="went_offline">Went offline</SelectItem>
            <SelectItem value="offer_accepted">Offer accepted</SelectItem>
            <SelectItem value="job_completed">Job completed</SelectItem>
            <SelectItem value="admin_action">Admin action</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as 'asc' | 'desc')}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="desc">Newest first</SelectItem>
            <SelectItem value="asc">Oldest first</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => {
            window.open(
              api.getDriverActivityExportUrl(driverId, { from, to, serviceLines }),
              '_blank',
              'noopener',
            );
          }}
        >
          <Download className="mr-1 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {stale && (
        <div className="flex items-center gap-2 text-xs text-amber-700" role="status">
          <AlertTriangle className="h-3.5 w-3.5" />
          Activity may be up to {Math.round(lagMs / 60000)} minutes behind.
        </div>
      )}

      {whollyUncovered ? (
        <div
          className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600"
          data-testid="activity-not-recorded"
        >
          Activity was not recorded for this window.
        </div>
      ) : events.length === 0 ? (
        <div
          className="rounded-md border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-600"
          data-testid="activity-empty-idle"
        >
          No activity recorded in this period. Presence logging was active for the covered window.
        </div>
      ) : (
        <div className="space-y-4" role="list" aria-label="Driver activity timeline">
          {dayGroups.map(([day, rows]) => (
            <div key={day} className="space-y-1" role="listitem">
              <div className="sticky top-0 z-10 bg-white/95 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500 backdrop-blur">
                {formatInFleetTz(`${day}T12:00:00`, fleetTimezone, {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </div>
              <ContentVisibilityList
                items={rows}
                estimateRowPx={40}
                getKey={(e: any) => String(e.id)}
                renderRow={(e: any) => {
                  const isPresence =
                    e.event_type === 'went_online' || e.event_type === 'went_offline';
                  const open = e.segmentOpen && e.event_type === 'went_online';
                  const jobRef = e.job_ref as string | null;
                  const clusterKids = jobRef
                    ? events.filter((x: any) => x.job_ref === jobRef && x.id !== e.id)
                    : [];
                  const isClusterHead =
                    !!jobRef &&
                    rows.find((x: any) => x.job_ref === jobRef)?.id === e.id &&
                    clusterKids.length > 0;
                  const isOpen = jobRef ? expanded.has(jobRef) : false;

                  return (
                    <div
                      className="flex items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50"
                      aria-label={`${eventLabel(e.event_type)} at ${formatInFleetTz(e.occurred_at, fleetTimezone)}${
                        e.segmentSeconds != null
                          ? `, ${formatDuration(e.segmentSeconds)} segment`
                          : ''
                      }`}
                    >
                      <span
                        className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm border ${
                          e.event_type === 'went_online'
                            ? 'border-emerald-600 bg-emerald-500'
                            : e.event_type === 'went_offline'
                              ? 'border-slate-600 bg-slate-800'
                              : 'border-sky-600 bg-sky-500 rotate-45'
                        }`}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          {isClusterHead ? (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 font-medium text-slate-900"
                              aria-expanded={isOpen}
                              aria-controls={`cluster-${jobRef}`}
                              onClick={() => toggleCluster(jobRef!)}
                            >
                              {isOpen ? (
                                <ChevronDown className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5" />
                              )}
                              Accepted {clusterKids.length + 1} trips
                            </button>
                          ) : (
                            <span className="font-medium text-slate-900">
                              {eventLabel(e.event_type)}
                            </span>
                          )}
                          <span className="tabular-nums text-slate-500">
                            {formatInFleetTz(e.occurred_at, fleetTimezone)}
                          </span>
                          {open && <Badge variant="secondary">still online</Badge>}
                          {e.closedBy === 'timeout' && (
                            <Badge variant="outline" className="text-slate-500">
                              app stopped reporting
                            </Badge>
                          )}
                          {isPresence && e.segmentSeconds != null && !open && (
                            <span className="text-xs text-slate-400" aria-hidden>
                              {formatDuration(e.segmentSeconds)}
                            </span>
                          )}
                          {(e.payload?.lat != null || e.payload?.lng != null) && (
                            <span className="inline-flex items-center gap-0.5 text-xs text-slate-400">
                              <Lock className="h-3 w-3" /> Location hidden
                            </span>
                          )}
                        </div>
                        {isClusterHead && isOpen && (
                          <ul
                            id={`cluster-${jobRef}`}
                            className="mt-1 space-y-0.5 border-l border-slate-200 pl-3"
                          >
                            {[e, ...clusterKids]
                              .sort((a, b) =>
                                String(a.occurred_at).localeCompare(String(b.occurred_at)),
                              )
                              .map((child: any) => (
                                <li key={child.id} className="text-xs text-slate-600">
                                  {eventLabel(child.event_type)}{' '}
                                  <span className="tabular-nums text-slate-400">
                                    {formatInFleetTz(child.occurred_at, fleetTimezone)}
                                  </span>
                                </li>
                              ))}
                          </ul>
                        )}
                      </div>
                      <Badge variant="outline" className="shrink-0 text-[10px] uppercase">
                        {e.service_line === 'roam_rush'
                          ? 'Rush'
                          : e.service_line === 'fleet_ops'
                            ? 'Ops'
                            : 'Rides'}
                      </Badge>
                    </div>
                  );
                }}
              />
            </div>
          ))}
        </div>
      )}

      {payload?.nextCursor && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCursor(payload.nextCursor)}
            disabled={pageQuery.isFetching}
          >
            Load more
          </Button>
        </div>
      )}

      <p className="text-xs text-slate-400" data-testid="activity-watermark">
        Showing {events.length} events
        {watermark ? ` · Data as of ${formatInFleetTz(watermark, fleetTimezone)}` : null}
      </p>
    </div>
  );
}
