import React, { useMemo } from 'react';
import {
  DollarSign,
  Navigation,
  Loader2,
  Fuel,
  Info
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Progress } from '../ui/progress';
import {
  Tooltip,
  PieChart as RawPieChart,
  Pie,
  Cell
} from 'recharts';
import { SafeResponsiveContainer as ResponsiveContainer } from '../ui/SafeResponsiveContainer';
import { cn } from '../ui/utils';
import { Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

// ── Shared constants (exported for use by DriverDetail.tsx) ──
export const PLATFORM_COLORS: Record<string, string> = {
  Uber: '#3b82f6',
  InDrive: '#10b981',
  Roam: '#6366f1',
  Bolt: '#22c55e',
  Lyft: '#ec4899',
  Private: '#f59e0b',
  Cash: '#84cc16',
  Other: '#64748b'
};

export const getPlatformColor = (platform: string) => PLATFORM_COLORS[platform] || PLATFORM_COLORS['Other'];

// ── PieChart wrapper removed — use RawPieChart directly with explicit keys ──

// ── MetricCard (exported for use elsewhere in DriverDetail) ──
export function MetricCard({ title, value, trend, trendUp, target, progress, progressColor = "bg-indigo-600", subtext, icon, breakdown, action, tooltip, loading }: any) {
   return (
      <Card className={cn(loading && "animate-pulse")}>
         <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
               <div className="flex items-center gap-2">
                   <p className="text-sm font-medium text-slate-500">{title}</p>
                   {tooltip && (
                       <TooltipProvider>
                           <UiTooltip>
                               <TooltipTrigger>
                                   <Info className="h-3 w-3 text-slate-400" />
                               </TooltipTrigger>
                               <TooltipContent>
                                   <p className="max-w-[200px] text-xs">{tooltip}</p>
                               </TooltipContent>
                           </UiTooltip>
                       </TooltipProvider>
                   )}
               </div>
               {icon}
            </div>
            <div className="flex items-baseline gap-2 mt-2">
               {loading ? (
                   <div className="h-8 w-24 bg-slate-200 rounded animate-pulse"></div>
               ) : (
                   <h2 className="text-2xl font-bold">{value}</h2>
               )}
               {trend && !loading && (
                  <span className={`text-xs font-medium ${trendUp ? 'text-emerald-600' : 'text-rose-600'}`}>
                     {trend}
                  </span>
               )}
            </div>
            {(target || progress !== undefined) && (
               <div className="mt-3 space-y-1">
                  {target && <p className="text-xs text-slate-500">{target}</p>}
                  {progress !== undefined && (
                     <Progress value={loading ? 0 : progress} className="h-1.5" indicatorClassName={progressColor} />
                  )}
               </div>
            )}
            {subtext && !loading && <p className="text-xs text-slate-500 mt-1">{subtext}</p>}
            {loading && !target && !progress && <div className="h-3 w-32 bg-slate-100 rounded mt-2"></div>}
            
            {breakdown && breakdown.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                    {loading ? (
                        [1, 2].map(i => <div key={i} className="flex justify-between h-3 bg-slate-50 rounded"></div>)
                    ) : (
                        breakdown.map((item: any, index: number) => (
                            <div key={index} className="flex justify-between items-center text-xs">
                                <span className="text-slate-500 flex items-center gap-1.5">
                                    <span className={`w-2 h-2 rounded-full`} style={{ backgroundColor: item.color }}></span>
                                    {item.label}
                                </span>
                                <span className="font-medium text-slate-700">{item.value}</span>
                            </div>
                        ))
                    )}
                </div>
            )}
            
            {action && !loading && (
                <div className="mt-4 pt-2 border-t border-slate-100">
                    {action}
                </div>
            )}
         </CardContent>
      </Card>
   )
}

// ── Props ──
interface OverviewMetricsGridProps {
  resolvedFinancials: any;
  metrics: any;
  localLoading: boolean;
  isToday: boolean;
}

// ── The Grid Component ──
export function OverviewMetricsGrid({ resolvedFinancials, metrics, localLoading, isToday }: OverviewMetricsGridProps) {
  // Platform breakdowns computed from resolvedFinancials (ledger-preferred)
  const earningsBreakdown = useMemo(() =>
    Object.entries(resolvedFinancials.platformStats)
      .filter(([_, stats]: [string, any]) => stats.earnings > 0 || stats.completed > 0)
      .map(([label, stats]: [string, any]) => ({
        label,
        value: `$${stats.earnings.toFixed(2)}`,
        color: getPlatformColor(label)
      })),
    [resolvedFinancials]
  );

  const cashBreakdown = useMemo(() =>
    Object.entries(resolvedFinancials.platformStats)
      .filter(([_, stats]: [string, any]) => stats.cashCollected > 0)
      .map(([label, stats]: [string, any]) => ({
        label,
        value: `$${stats.cashCollected.toFixed(2)}`,
        color: '#f43f5e'
      })),
    [resolvedFinancials]
  );

  const tollsBreakdown = useMemo(() =>
    Object.entries(resolvedFinancials.platformStats)
      .filter(([_, stats]: [string, any]) => stats.tolls > 0)
      .map(([label, stats]: [string, any]) => ({
        label,
        value: `$${stats.tolls.toFixed(2)}`,
        color: getPlatformColor(label)
      })),
    [resolvedFinancials]
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 [&>:nth-child(1)]:order-1 [&>:nth-child(2)]:order-2 [&>:nth-child(3)]:order-3 [&>:nth-child(4)]:order-4 [&>:nth-child(5)]:order-5 [&>:nth-child(6)]:hidden [&>:nth-child(7)]:order-6">
      {/* Card 1: Period Earnings — breakdown now from resolvedFinancials */}
      <MetricCard
        title={isToday ? "Today's Earnings" : "Period Earnings"}
        subtext={resolvedFinancials.source === 'ledger' ? 'Ledger' : 'Trips fallback'}
        value={`$${resolvedFinancials.periodEarnings.toFixed(2)}`}
        trend={`${resolvedFinancials.trendPercent}% vs prev`}
        trendUp={resolvedFinancials.trendUp}
        icon={<DollarSign className="h-4 w-4 text-slate-500" />}
        loading={localLoading}
        breakdown={earningsBreakdown}
      />

      {/* Card 2: Cash Collected */}
      <MetricCard
        title="Cash Collected"
        value={`$${resolvedFinancials.cashCollected.toFixed(2)}`}
        icon={<DollarSign className="h-4 w-4 text-slate-500" />}
        tooltip="Total cash collected from trips during this period"
        loading={localLoading}
        breakdown={cashBreakdown}
      />

      {/* Card 3: Km Driven (operational — stays on metrics) */}
      <MetricCard
        title="Km Driven for Period"
        value={`${metrics.totalDistance.toFixed(1)} km`}
        icon={<Navigation className="h-4 w-4 text-slate-500" />}
        loading={localLoading}
        breakdown={Object.entries(metrics.platformStats)
          .filter(([_, stats]: [string, any]) => stats.distance > 0)
          .map(([label, stats]: [string, any]) => ({
            label,
            value: `${stats.distance.toFixed(1)} km`,
            color: getPlatformColor(label)
          }))}
      />

      {/* Card 4: Time Metrics Donut */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-500">Time Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[180px] w-full relative">
            {localLoading && (
              <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 flex items-center justify-center z-10 backdrop-blur-[1px]">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
              </div>
            )}
            <ResponsiveContainer width="100%" height="100%">
              <RawPieChart>
                <Pie
                  key="pie-time"
                  data={[
                    { name: 'Open Time', value: metrics.tripRatio.available, fill: '#1e3a8a' },
                    { name: 'Enroute Time', value: metrics.tripRatio.toTrip, fill: '#fbbf24' },
                    { name: 'On Trip Time', value: metrics.tripRatio.onTrip, fill: '#10b981' },
                    { name: 'Unavailable Time', value: metrics.tripRatio.unavailable, fill: '#94a3b8' }
                  ]}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={75}
                  paddingAngle={0}
                  dataKey="value"
                  startAngle={90}
                  endAngle={-270}
                  stroke="none"
                >
                </Pie>
                <Tooltip key="tt-time" formatter={(value: number) => [value.toFixed(2) + ' hrs', 'Duration']} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} itemStyle={{ color: '#64748b' }} />
              </RawPieChart>
            </ResponsiveContainer>
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
              <div className="text-2xl font-bold text-slate-900">{metrics.tripRatio.totalOnline.toFixed(2)}</div>
              <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">Hours Online</div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-4 gap-1 text-center px-2">
            <TooltipProvider>
              <UiTooltip>
                <TooltipTrigger asChild>
                  <div className="flex flex-col items-center gap-1 cursor-help">
                    <span className="text-sm font-bold text-slate-900">{metrics.tripRatio.available.toFixed(2)} h</span>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-[#1e3a8a]"></div>
                      <span className="text-xs font-medium text-slate-500">Open</span>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">The amount of time the driver was online and available to accept new trip requests (waiting for a "ping").</p>
                </TooltipContent>
              </UiTooltip>

              <UiTooltip>
                <TooltipTrigger asChild>
                  <div className="flex flex-col items-center gap-1 cursor-help">
                    <span className="text-sm font-bold text-slate-900">{metrics.tripRatio.toTrip.toFixed(2)} h</span>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-[#fbbf24]"></div>
                      <span className="text-xs font-medium text-slate-500">Enroute</span>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">The time spent traveling to a pickup location after accepting a request.</p>
                </TooltipContent>
              </UiTooltip>

              <UiTooltip>
                <TooltipTrigger asChild>
                  <div className="flex flex-col items-center gap-1 cursor-help">
                    <span className="text-sm font-bold text-slate-900">{metrics.tripRatio.onTrip.toFixed(2)} h</span>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-[#10b981]"></div>
                      <span className="text-xs font-medium text-slate-500">On Trip</span>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">The time spent with a passenger or delivery in the vehicle, from pickup to drop-off.</p>
                </TooltipContent>
              </UiTooltip>

              <UiTooltip>
                <TooltipTrigger asChild>
                  <div className="flex flex-col items-center gap-1 cursor-help">
                    <span className="text-sm font-bold text-slate-900">{metrics.tripRatio.unavailable.toFixed(2)} h</span>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-[#94a3b8]"></div>
                      <span className="text-xs font-medium text-slate-500">Unavail</span>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">The time the driver was logged into the system but marked as "Unavailable" (e.g., taking a break or paused).</p>
                </TooltipContent>
              </UiTooltip>
            </TooltipProvider>
          </div>
        </CardContent>
      </Card>

      {/* Card 5: Toll Refunded — breakdown now from resolvedFinancials */}
      <MetricCard
        title="Toll Refunded"
        value={`$${resolvedFinancials.totalTolls.toFixed(2)}`}
        subtext="Added to Debt (Cash Risk)"
        icon={<DollarSign className="h-4 w-4 text-slate-500" />}
        loading={localLoading}
        breakdown={tollsBreakdown}
      />

      {/* Card 6: Distance Metrics Donut */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-500">Distance Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          {metrics.distanceMetrics ? (
            <>
              <div className="h-[180px] w-full relative">
                {localLoading && (
                  <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 flex items-center justify-center z-10 backdrop-blur-[1px]">
                    <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
                  </div>
                )}
                <ResponsiveContainer width="100%" height="100%">
                  <RawPieChart>
                    <Pie
                      key="pie-dist"
                      data={[
                        { name: 'Open Dist', value: metrics.distanceMetrics.open, fill: '#1e3a8a' },
                        { name: 'Enroute Dist', value: metrics.distanceMetrics.enroute, fill: '#fbbf24' },
                        { name: 'On Trip Dist', value: metrics.distanceMetrics.onTrip, fill: '#10b981' },
                        { name: 'Unavailable Dist', value: metrics.distanceMetrics.unavailable, fill: '#94a3b8' },
                        { name: 'Rider Cancelled', value: metrics.distanceMetrics.riderCancelled || 0, fill: '#f97316' },
                        { name: 'Driver Cancelled', value: metrics.distanceMetrics.driverCancelled || 0, fill: '#ef4444' },
                        { name: 'Delivery Failed', value: metrics.distanceMetrics.deliveryFailed || 0, fill: '#475569' },
                      ].filter(d => d.value > 0)}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={75}
                      paddingAngle={0}
                      dataKey="value"
                      startAngle={90}
                      endAngle={-270}
                      stroke="none"
                    >
                      {[
                        { name: 'Open Dist', value: metrics.distanceMetrics.open, fill: '#1e3a8a' },
                        { name: 'Enroute Dist', value: metrics.distanceMetrics.enroute, fill: '#fbbf24' },
                        { name: 'On Trip Dist', value: metrics.distanceMetrics.onTrip, fill: '#10b981' },
                        { name: 'Unavailable Dist', value: metrics.distanceMetrics.unavailable, fill: '#94a3b8' },
                        { name: 'Rider Cancelled', value: metrics.distanceMetrics.riderCancelled || 0, fill: '#f97316' },
                        { name: 'Driver Cancelled', value: metrics.distanceMetrics.driverCancelled || 0, fill: '#ef4444' },
                        { name: 'Delivery Failed', value: metrics.distanceMetrics.deliveryFailed || 0, fill: '#475569' }
                      ].filter(d => d.value > 0).map((d, i) => (
                        <Cell key={`di-${i}`} fill={d.fill} />
                      ))}
                    </Pie>
                    <Tooltip key="tt-dist" formatter={(value: number) => [value.toFixed(2) + ' km', 'Distance']} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} itemStyle={{ color: '#64748b' }} />
                  </RawPieChart>
                </ResponsiveContainer>
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                  <div className="text-2xl font-bold text-slate-900">{metrics.distanceMetrics.total.toFixed(2)}</div>
                  <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">Total KM</div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-2 px-2 text-center">
                <TooltipProvider>
                  <UiTooltip>
                    <TooltipTrigger asChild>
                      <div className="flex flex-col items-center gap-1 cursor-help">
                        <span className="text-sm font-bold text-slate-900">{metrics.distanceMetrics.open.toFixed(2)}</span>
                        <div className="flex items-center gap-1.5 justify-center w-full">
                          <div className="w-2 h-2 rounded-full bg-[#1e3a8a] shrink-0"></div>
                          <span className="text-xs font-medium text-slate-500 truncate">Open</span>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">Distance traveled while the driver was online and waiting for a request.</p>
                    </TooltipContent>
                  </UiTooltip>

                  <UiTooltip>
                    <TooltipTrigger asChild>
                      <div className="flex flex-col items-center gap-1 cursor-help">
                        <span className="text-sm font-bold text-slate-900">{metrics.distanceMetrics.enroute.toFixed(2)}</span>
                        <div className="flex items-center gap-1.5 justify-center w-full">
                          <div className="w-2 h-2 rounded-full bg-[#fbbf24] shrink-0"></div>
                          <span className="text-xs font-medium text-slate-500 truncate">Enroute</span>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">Distance traveled while the driver was heading to the pickup location.</p>
                    </TooltipContent>
                  </UiTooltip>

                  <UiTooltip>
                    <TooltipTrigger asChild>
                      <div className="flex flex-col items-center gap-1 cursor-help">
                        <span className="text-sm font-bold text-slate-900">{metrics.distanceMetrics.onTrip.toFixed(2)}</span>
                        <div className="flex items-center gap-1.5 justify-center w-full">
                          <div className="w-2 h-2 rounded-full bg-[#10b981] shrink-0"></div>
                          <span className="text-xs font-medium text-slate-500 truncate">On Trip</span>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">Distance traveled during the actual trip (from pickup to destination).</p>
                    </TooltipContent>
                  </UiTooltip>

                  <UiTooltip>
                    <TooltipTrigger asChild>
                      <div className="flex flex-col items-center gap-1 cursor-help">
                        <span className="text-sm font-bold text-slate-900">{metrics.distanceMetrics.unavailable.toFixed(2)}</span>
                        <div className="flex items-center gap-1.5 justify-center w-full">
                          <div className="w-2 h-2 rounded-full bg-[#94a3b8] shrink-0"></div>
                          <span className="text-xs font-medium text-slate-500 truncate">Unavail</span>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">Distance traveled while the driver was in an unavailable or offline-equivalent state.</p>
                    </TooltipContent>
                  </UiTooltip>

                  {/* Cancellation stats */}
                  <UiTooltip>
                    <TooltipTrigger asChild>
                      <div className="flex flex-col items-center gap-1 cursor-help">
                        <span className="text-sm font-bold text-slate-900">{(metrics.distanceMetrics.riderCancelled || 0).toFixed(2)}</span>
                        <div className="flex items-center gap-1.5 justify-center w-full">
                          <div className="w-2 h-2 rounded-full bg-[#f97316] shrink-0"></div>
                          <span className="text-xs font-medium text-slate-500 truncate">Rider Cx</span>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">Distance traveled on trips cancelled by the rider.</p>
                    </TooltipContent>
                  </UiTooltip>

                  <UiTooltip>
                    <TooltipTrigger asChild>
                      <div className="flex flex-col items-center gap-1 cursor-help">
                        <span className="text-sm font-bold text-slate-900">{(metrics.distanceMetrics.driverCancelled || 0).toFixed(2)}</span>
                        <div className="flex items-center gap-1.5 justify-center w-full">
                          <div className="w-2 h-2 rounded-full bg-[#ef4444] shrink-0"></div>
                          <span className="text-xs font-medium text-slate-500 truncate">Driver Cx</span>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">Distance traveled on trips cancelled by the driver.</p>
                    </TooltipContent>
                  </UiTooltip>

                  <UiTooltip>
                    <TooltipTrigger asChild>
                      <div className="flex flex-col items-center gap-1 cursor-help">
                        <span className="text-sm font-bold text-slate-900">{(metrics.distanceMetrics.deliveryFailed || 0).toFixed(2)}</span>
                        <div className="flex items-center gap-1.5 justify-center w-full">
                          <div className="w-2 h-2 rounded-full bg-[#475569] shrink-0"></div>
                          <span className="text-xs font-medium text-slate-500 truncate">Failed</span>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">Distance traveled on failed deliveries.</p>
                    </TooltipContent>
                  </UiTooltip>
                </TooltipProvider>
              </div>
            </>
          ) : (
            <div className="h-[250px] flex flex-col items-center justify-center text-slate-400">
              <Navigation className="h-10 w-10 mb-2 opacity-20" />
              <p className="text-sm">No distance breakdown</p>
              <p className="text-xs mt-1">Upload "Time & Distance" Report</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Card 7: Fuel Usage Split Donut */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-500">Fuel Usage Split</CardTitle>
        </CardHeader>
        <CardContent>
          {metrics.fuelMetrics ? (
            <>
              <div className="h-[180px] w-full relative">
                {localLoading && (
                  <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 flex items-center justify-center z-10 backdrop-blur-[1px]">
                    <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
                  </div>
                )}
                <ResponsiveContainer width="100%" height="100%">
                  <RawPieChart>
                    <Pie
                      key="pie-fuel"
                      data={[
                        { name: 'Ride Share', value: metrics.fuelMetrics.rideShare, fill: '#10b981' },
                        { name: 'Company Ops', value: metrics.fuelMetrics.companyOps, fill: '#fbbf24' },
                        { name: 'Personal', value: metrics.fuelMetrics.personal, fill: '#ef4444' },
                        { name: 'Misc/Leakage', value: metrics.fuelMetrics.misc, fill: '#94a3b8' }
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={75}
                      paddingAngle={0}
                      dataKey="value"
                      startAngle={90}
                      endAngle={-270}
                      stroke="none"
                    >
                    </Pie>
                    <Tooltip key="tt-fuel" formatter={(value: number) => [value.toFixed(1) + ' L', 'Fuel']} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} itemStyle={{ color: '#64748b' }} />
                  </RawPieChart>
                </ResponsiveContainer>
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                  <div className="text-2xl font-bold text-slate-900">{metrics.fuelMetrics.total.toFixed(0)}</div>
                  <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">Total L</div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-1 text-center px-2">
                <TooltipProvider>
                  <UiTooltip>
                    <TooltipTrigger asChild>
                      <div className="flex flex-col items-center gap-1 cursor-help">
                        <span className="text-sm font-bold text-slate-900">{metrics.fuelMetrics.rideShare.toFixed(2)}</span>
                        <div className="flex items-center gap-1.5 justify-center w-full">
                          <div className="w-2 h-2 rounded-full bg-[#10b981] shrink-0"></div>
                          <span className="text-xs font-medium text-slate-500 truncate">RideShare</span>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">Fuel consumed during revenue-generating trips.</p>
                    </TooltipContent>
                  </UiTooltip>

                  <UiTooltip>
                    <TooltipTrigger asChild>
                      <div className="flex flex-col items-center gap-1 cursor-help">
                        <span className="text-sm font-bold text-slate-900">{metrics.fuelMetrics.companyOps.toFixed(2)}</span>
                        <div className="flex items-center gap-1.5 justify-center w-full">
                          <div className="w-2 h-2 rounded-full bg-[#fbbf24] shrink-0"></div>
                          <span className="text-xs font-medium text-slate-500 truncate">Com. Ops</span>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">Fuel consumed for company operations.</p>
                    </TooltipContent>
                  </UiTooltip>

                  <UiTooltip>
                    <TooltipTrigger asChild>
                      <div className="flex flex-col items-center gap-1 cursor-help">
                        <span className="text-sm font-bold text-slate-900">{metrics.fuelMetrics.personal.toFixed(2)}</span>
                        <div className="flex items-center gap-1.5 justify-center w-full">
                          <div className="w-2 h-2 rounded-full bg-[#ef4444] shrink-0"></div>
                          <span className="text-xs font-medium text-slate-500 truncate">Personal</span>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">Fuel consumed for personal use.</p>
                    </TooltipContent>
                  </UiTooltip>

                  <UiTooltip>
                    <TooltipTrigger asChild>
                      <div className="flex flex-col items-center gap-1 cursor-help">
                        <span className="text-sm font-bold text-slate-900">{metrics.fuelMetrics.misc.toFixed(2)}</span>
                        <div className="flex items-center gap-1.5 justify-center w-full">
                          <div className="w-2 h-2 rounded-full bg-[#94a3b8] shrink-0"></div>
                          <span className="text-xs font-medium text-slate-500 truncate">Leakage</span>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">Unaccounted fuel consumption or leakage.</p>
                    </TooltipContent>
                  </UiTooltip>
                </TooltipProvider>
              </div>
            </>
          ) : (
            <div className="h-[250px] flex flex-col items-center justify-center text-slate-400">
              <Fuel className="h-10 w-10 mb-2 opacity-20" />
              <p className="text-sm">No fuel data</p>
              <p className="text-xs mt-1">Requires Time & Distance</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}