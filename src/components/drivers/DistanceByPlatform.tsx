import React from 'react';
import { PieChart, Pie, Cell, Tooltip } from 'recharts';
import { SafeResponsiveContainer as ResponsiveContainer } from '../ui/SafeResponsiveContainer';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import {
  Tooltip as UiTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import { Loader2, Navigation, PieChart as PieChartIcon } from 'lucide-react';

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
  { key: 'Roam', label: 'Roam', brandColor: '#6366f1' },     // Indigo
  { key: 'Uber', label: 'Uber', brandColor: '#3b82f6' },      // Blue
  { key: 'InDrive', label: 'InDrive', brandColor: '#10b981' }, // Emerald
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

const SEGMENTS = [
  { key: 'open' as const, label: 'Open Dist', color: SEGMENT_COLORS.open },
  { key: 'enroute' as const, label: 'Enroute Dist', color: SEGMENT_COLORS.enroute },
  { key: 'onTrip' as const, label: 'On Trip Dist', color: SEGMENT_COLORS.onTrip },
  { key: 'unavailable' as const, label: 'Unavailable Dist', color: SEGMENT_COLORS.unavailable },
  { key: 'riderCancelled' as const, label: 'Rider Cancelled', color: SEGMENT_COLORS.riderCancelled },
  { key: 'driverCancelled' as const, label: 'Driver Cancelled', color: SEGMENT_COLORS.driverCancelled },
  { key: 'deliveryFailed' as const, label: 'Delivery Failed', color: SEGMENT_COLORS.deliveryFailed },
];

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

function PlatformDonut({
  platform,
  data,
  loading,
}: {
  platform: typeof PLATFORMS[number];
  data: PlatformDistanceData | undefined;
  loading?: boolean;
}) {
  const hasData = data && data.total > 0;

  // Build pie data from segments
  const pieData = hasData
    ? SEGMENTS.map(seg => ({
        name: seg.label,
        value: data[seg.key],
        fill: seg.color,
      })).filter(d => d.value > 0)
    : [];

  return (
    <div className="flex flex-col items-center">
      {/* Platform label with brand color accent */}
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-3 h-3 rounded-full shrink-0"
          style={{ backgroundColor: platform.brandColor }}
        />
        <span className="text-sm font-semibold text-slate-700">{platform.label}</span>
      </div>

      {hasData ? (
        <>
          {/* Donut chart */}
          <div className="h-[170px] w-full relative">
            {loading && (
              <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 flex items-center justify-center z-10 backdrop-blur-[1px]">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
              </div>
            )}
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={68}
                  paddingAngle={0}
                  dataKey="value"
                  startAngle={90}
                  endAngle={-270}
                  stroke="none"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => [value.toFixed(2) + ' km', 'Distance']}
                  contentStyle={{
                    borderRadius: '8px',
                    border: 'none',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  }}
                  itemStyle={{ color: '#64748b' }}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Center label */}
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
              <div className="text-base md:text-xl font-bold text-slate-900">{data.total.toFixed(2)}</div>
              <div className="text-[9px] text-slate-500 font-medium uppercase tracking-wide">Total KM</div>
            </div>
          </div>

          {/* Full legend — all 7 segments in two rows */}
          <div className="mt-3 grid grid-cols-4 gap-x-2 gap-y-2 px-1 text-center w-full">
            <TooltipProvider>
              {LEGEND_ITEMS.map(item => (
                <UiTooltip key={item.key}>
                  <TooltipTrigger asChild>
                    <div className="flex flex-col items-center gap-1 cursor-help">
                      <span className="text-xs font-bold text-slate-900">
                        {(data[item.key] || 0).toFixed(2)}
                      </span>
                      <div className="flex items-center gap-1 justify-center w-full">
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="text-[10px] font-medium text-slate-500 truncate">
                          {item.label}
                        </span>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">{item.tooltip}</p>
                  </TooltipContent>
                </UiTooltip>
              ))}
            </TooltipProvider>
          </div>
        </>
      ) : (
        /* Empty state */
        <div className="h-[170px] w-full flex flex-col items-center justify-center text-slate-400">
          {loading ? (
            <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
          ) : (
            <>
              <PieChartIcon className="h-10 w-10 mb-2 text-slate-300" />
              <span className="text-sm font-medium">No distance data</span>
              <span className="text-xs text-slate-400 mt-0.5">No trips for this platform</span>
            </>
          )}
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
          {PLATFORMS.map(platform => (
            <PlatformDonut
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