import React from 'react';
import { Bar, BarChart, Cell, Tooltip, XAxis, YAxis } from 'recharts';
import { SafeResponsiveContainer as ResponsiveContainer } from '../ui/SafeResponsiveContainer';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import {
  Tooltip as UiTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import { BarChart3, Loader2, Navigation } from 'lucide-react';

// --- Types ---

interface PlatformDistanceData {
  open: number;
  enroute: number;
  onTrip: number;
  unavailable: number;
  riderCancelled: number;
  driverCancelled: number;
  deliveryFailed: number;
  total: number;
}

interface DistanceByPlatformProps {
  perPlatformDistance: Record<string, PlatformDistanceData> | undefined;
  loading?: boolean;
}

// --- Constants ---

const PLATFORMS = [
  { key: 'Roam', label: 'Roam', brandColor: '#6366f1' },
  { key: 'Uber', label: 'Uber', brandColor: '#3b82f6' },
  { key: 'InDrive', label: 'InDrive', brandColor: '#10b981' },
] as const;

const SEGMENT_COLORS = {
  open: '#1e3a8a',
  enroute: '#fbbf24',
  onTrip: '#10b981',
  unavailable: '#94a3b8',
  riderCancelled: '#f97316',
  driverCancelled: '#ef4444',
  deliveryFailed: '#475569',
} as const;

const LEGEND_ITEMS = [
  { key: 'open' as const, label: 'Open', color: SEGMENT_COLORS.open, tooltip: 'Distance traveled while online and waiting for a request.' },
  { key: 'enroute' as const, label: 'Enroute', color: SEGMENT_COLORS.enroute, tooltip: 'Distance traveled heading to the pickup location.' },
  { key: 'onTrip' as const, label: 'On Trip', color: SEGMENT_COLORS.onTrip, tooltip: 'Distance traveled during the actual trip (pickup to destination).' },
  { key: 'unavailable' as const, label: 'Unavail', color: SEGMENT_COLORS.unavailable, tooltip: 'Distance traveled while in an unavailable or offline-equivalent state.' },
  { key: 'riderCancelled' as const, label: 'Rider Cx', color: SEGMENT_COLORS.riderCancelled, tooltip: 'Distance traveled on trips cancelled by the rider.' },
  { key: 'driverCancelled' as const, label: 'Driver Cx', color: SEGMENT_COLORS.driverCancelled, tooltip: 'Distance traveled on trips cancelled by the driver.' },
  { key: 'deliveryFailed' as const, label: 'Failed', color: SEGMENT_COLORS.deliveryFailed, tooltip: 'Distance traveled on deliveries that failed.' },
];

// --- Sub-components ---

function PlatformBars({
  platform,
  data,
  loading,
}: {
  platform: typeof PLATFORMS[number];
  data: PlatformDistanceData | undefined;
  loading?: boolean;
}) {
  const hasData = data && data.total > 0;

  const barData = !data
    ? []
    : LEGEND_ITEMS.map((item) => ({
        label: item.label,
        km: Number(data[item.key]) || 0,
        fill: item.color,
        tooltip: item.tooltip,
      }));

  return (
    <div className="flex flex-col min-w-0">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: platform.brandColor }}
          />
          <span className="text-sm font-semibold text-slate-700 truncate">{platform.label}</span>
        </div>
        {hasData && (
          <span className="text-xs font-medium text-slate-500 tabular-nums shrink-0">
            {data.total.toFixed(1)} km
          </span>
        )}
      </div>

      {hasData ? (
        <div className="h-[220px] w-full relative">
          {loading && (
            <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 flex items-center justify-center z-10 backdrop-blur-[1px]">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
            </div>
          )}
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={barData}
              margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
            >
              <XAxis
                type="number"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: '#64748b' }}
                tickFormatter={(v: number) => (v >= 100 ? v.toFixed(0) : v.toFixed(1))}
              />
              <YAxis
                type="category"
                dataKey="label"
                width={64}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: '#475569' }}
              />
              <Tooltip
                cursor={{ fill: '#f1f5f9' }}
                formatter={(value: number) => [`${Number(value).toFixed(2)} km`, 'Distance']}
                labelFormatter={(label) => String(label)}
                contentStyle={{
                  borderRadius: '8px',
                  border: 'none',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                }}
                itemStyle={{ color: '#64748b' }}
              />
              <Bar dataKey="km" radius={[0, 4, 4, 0]} barSize={14}>
                {barData.map((entry) => (
                  <Cell key={entry.label} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-[220px] w-full flex flex-col items-center justify-center text-slate-400">
          {loading ? (
            <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
          ) : (
            <>
              <BarChart3 className="h-10 w-10 mb-2 text-slate-300" />
              <span className="text-sm font-medium">No distance data</span>
              <span className="text-xs text-slate-400 mt-0.5">No trips for this platform</span>
            </>
          )}
        </div>
      )}

      {hasData && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 px-1">
          <TooltipProvider>
            {LEGEND_ITEMS.map((item) => (
              <UiTooltip key={item.key}>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 cursor-help">
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-[10px] font-medium text-slate-500">{item.label}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">{item.tooltip}</p>
                </TooltipContent>
              </UiTooltip>
            ))}
          </TooltipProvider>
        </div>
      )}
    </div>
  );
}

// --- Main Component ---

export function DistanceByPlatform({ perPlatformDistance, loading }: DistanceByPlatformProps) {
  return (
    <Card className="mt-6">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Navigation className="h-4 w-4 text-indigo-600" />
          <CardTitle className="text-sm font-medium text-slate-500">
            Distance Breakdown by Platform
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLATFORMS.map((platform) => (
            <PlatformBars
              key={platform.key}
              platform={platform}
              data={perPlatformDistance?.[platform.key]}
              loading={loading}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
