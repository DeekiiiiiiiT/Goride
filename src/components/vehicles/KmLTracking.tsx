import React, { useEffect, useState, useMemo } from 'react';
import {
  Fuel,
  TrendingUp,
  TrendingDown,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Info,
  BarChart3,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  CalendarRange,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ComposedChart,
  Bar,
  Line,
  Legend,
} from 'recharts';
import { SafeResponsiveContainer } from '../ui/SafeResponsiveContainer';
import {
  format,
  subDays,
  subMonths,
  startOfDay,
  endOfDay,
  isWithinInterval,
  startOfWeek,
  endOfWeek,
  parseISO,
} from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { projectId, publicAnonKey } from '../../utils/supabase/info';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { DatePickerWithRange } from '../ui/date-range-picker';
import { PeriodWeekDropdown } from '../ui/PeriodWeekDropdown';
import { generateWeekOptionsForDateRange, ENTIRE_PERIOD_OPTION_ID } from '../../utils/periodWeekOptions';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-37f42386`;

interface KmLTrackingProps {
  vehicle: any;
}

interface FuelEntry {
  id: string;
  vehicleId: string;
  date: string;
  odometer: number;
  liters: number;
  amount?: number;
  station?: string;
  type?: string;
  isFlagged?: boolean;
  auditStatus?: string;
  anomalyReason?: string;
  metadata?: {
    isAnchor?: boolean;
    isSoftAnchor?: boolean;
    isFullTank?: boolean;
    distanceSinceAnchor?: number;
    actualKmPerLiter?: number;
    profileKmPerLiter?: number;
    rollingAvgKmPerLiter?: number;
    rollingAvgEntryCount?: number;
    efficiencyVariance?: number;
    efficiencyBaseline?: string;
    integrityStatus?: string;
    anomalyReason?: string;
    auditStatus?: string;
    cumulativeLitersAtEntry?: number;
    tankCapacityAtEntry?: number;
    [key: string]: any;
  };
}

interface CycleData {
  anchorEntry: FuelEntry;
  startOdo: number;
  endOdo: number;
  distance: number;
  fuelConsumed: number;
  actualKmL: number;
  entryCount: number;
  date: string;
  variance: number;
}

type PeriodPreset = 'all' | '7d' | '30d' | '90d' | '12m' | 'custom';

export function KmLTracking({ vehicle }: KmLTrackingProps) {
  const [entries, setEntries] = useState<FuelEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<'date' | 'kmL' | 'variance'>('date');
  const [sortAsc, setSortAsc] = useState(false);
  const [showAllEntries, setShowAllEntries] = useState(false);
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('all');
  const [customRange, setCustomRange] = useState<DateRange | undefined>(() => ({
    from: subDays(new Date(), 29),
    to: new Date(),
  }));
  const [selectedWeekKey, setSelectedWeekKey] = useState<number | null>(null);

  const vehicleId = vehicle.id || vehicle.licensePlate;

  const periodBounds = useMemo((): { start: Date; end: Date } | null => {
    if (periodPreset === 'all') return null;
    const end = endOfDay(new Date());
    if (periodPreset === 'custom') {
      if (!customRange?.from) return null;
      let start = startOfDay(customRange.from);
      let rangeEnd = customRange.to ? endOfDay(customRange.to) : endOfDay(customRange.from);
      if (start > rangeEnd) [start, rangeEnd] = [rangeEnd, start];
      return { start, end: rangeEnd };
    }
    switch (periodPreset) {
      case '7d':
        return { start: startOfDay(subDays(end, 6)), end };
      case '30d':
        return { start: startOfDay(subDays(end, 29)), end };
      case '90d':
        return { start: startOfDay(subDays(end, 89)), end };
      case '12m':
        return { start: startOfDay(subMonths(end, 12)), end };
      default:
        return null;
    }
  }, [periodPreset, customRange]);

  const periodLabel = useMemo(() => {
    if (periodPreset === 'all') return 'All time';
    if (periodPreset === 'custom' && customRange?.from) {
      const a = format(customRange.from, 'MMM d, yyyy');
      const b = customRange.to ? format(customRange.to, 'MMM d, yyyy') : a;
      return `${a} – ${b}`;
    }
    if (periodPreset === 'custom') return 'Custom range';
    const labels: Record<Exclude<PeriodPreset, 'all' | 'custom'>, string> = {
      '7d': 'Last 7 days',
      '30d': 'Last 30 days',
      '90d': 'Last 90 days',
      '12m': 'Last 12 months',
    };
    return labels[periodPreset];
  }, [periodPreset, customRange]);

  const filteredEntries = useMemo(() => {
    if (!periodBounds) return entries;
    return entries.filter(e => {
      const t = new Date(e.date);
      return !isNaN(t.getTime()) && isWithinInterval(t, periodBounds);
    });
  }, [entries, periodBounds]);

  const dataDateBounds = useMemo((): { start: Date; end: Date } | null => {
    let minT = Infinity;
    let maxT = -Infinity;
    for (const e of entries) {
      const t = new Date(e.date).getTime();
      if (!isNaN(t)) {
        minT = Math.min(minT, t);
        maxT = Math.max(maxT, t);
      }
    }
    if (minT === Infinity) return null;
    return { start: startOfDay(new Date(minT)), end: endOfDay(new Date(maxT)) };
  }, [entries]);

  const primaryRangeForWeeks = useMemo(() => {
    if (periodBounds) return periodBounds;
    return dataDateBounds;
  }, [periodBounds, dataDateBounds]);

  /** Shown on week picker when no week is selected — full bounds of the list, not “month of last entry” (which looked stuck on April). */
  const weekListRangeBanner = useMemo(() => {
    if (!primaryRangeForWeeks) return '';
    const a = primaryRangeForWeeks.start;
    const b = primaryRangeForWeeks.end;
    return `${format(a, 'MMM d, yyyy')} – ${format(b, 'MMM d, yyyy')}`;
  }, [primaryRangeForWeeks]);

  const weekOptionsForDropdown = useMemo(() => {
    if (!primaryRangeForWeeks) return [];
    return generateWeekOptionsForDateRange(primaryRangeForWeeks.start, primaryRangeForWeeks.end);
  }, [primaryRangeForWeeks]);

  const scopedEntries = useMemo(() => {
    if (selectedWeekKey === null) return filteredEntries;
    const ws = new Date(selectedWeekKey);
    const we = endOfWeek(ws, { weekStartsOn: 1 });
    return filteredEntries.filter(e => {
      const t = new Date(e.date);
      return !isNaN(t.getTime()) && isWithinInterval(t, { start: startOfDay(ws), end: endOfDay(we) });
    });
  }, [filteredEntries, selectedWeekKey]);

  const selectedWeekLabel = useMemo(() => {
    if (selectedWeekKey === null) return null;
    const ws = new Date(selectedWeekKey);
    const we = endOfWeek(ws, { weekStartsOn: 1 });
    return `${format(ws, 'MMM d')} – ${format(we, 'MMM d, yyyy')}`;
  }, [selectedWeekKey]);

  const selectedWeekRangeStrings = useMemo(() => {
    if (selectedWeekKey === null) return undefined;
    const ws = new Date(selectedWeekKey);
    const we = endOfWeek(ws, { weekStartsOn: 1 });
    return { start: format(ws, 'yyyy-MM-dd'), end: format(we, 'yyyy-MM-dd') };
  }, [selectedWeekKey]);

  useEffect(() => {
    setSelectedWeekKey(null);
  }, [periodPreset, customRange]);

  useEffect(() => {
    if (selectedWeekKey === null) return;
    const ok = weekOptionsForDropdown.some(w => {
      const d = parseISO(w.startDate);
      return startOfWeek(d, { weekStartsOn: 1 }).getTime() === selectedWeekKey;
    });
    if (!ok) setSelectedWeekKey(null);
  }, [weekOptionsForDropdown, selectedWeekKey]);

  useEffect(() => {
    fetchEntries();
  }, [vehicleId]);

  async function fetchEntries() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/fuel-entries?vehicleId=${encodeURIComponent(vehicleId)}&limit=5000`,
        { headers: { Authorization: `Bearer ${publicAnonKey}` } }
      );
      if (!res.ok) throw new Error(`Failed to load fuel entries: ${res.status}`);
      const data = await res.json();
      setEntries(data || []);
    } catch (e: any) {
      console.error('[KmLTracking] fetch error:', e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // Compute rolling average from entries (same logic as backend)
  const rollingAverage = useMemo(() => {
    const valid = scopedEntries
      .filter(e => (Number(e.odometer) || 0) > 0 && (Number(e.liters) || 0) > 0)
      .sort((a, b) => (Number(a.odometer) || 0) - (Number(b.odometer) || 0));

    if (valid.length < 3) return null;

    const firstOdo = Number(valid[0].odometer);
    const lastOdo = Number(valid[valid.length - 1].odometer);
    const totalDistance = lastOdo - firstOdo;
    const totalFuel = valid.slice(1).reduce((sum, e) => sum + (Number(e.liters) || 0), 0);

    if (totalDistance <= 0 || totalFuel <= 0) return null;

    return {
      avgKmPerLiter: Number((totalDistance / totalFuel).toFixed(2)),
      entryCount: valid.length,
      totalDistance,
      totalFuel: Number(totalFuel.toFixed(1)),
      firstOdo,
      lastOdo,
    };
  }, [scopedEntries]);

  /** Rolling average over the primary date filter only (ignores week drill-down). Used for cycle variance vs fleet-in-period baseline. */
  const rollingAveragePeriod = useMemo(() => {
    const valid = filteredEntries
      .filter(e => (Number(e.odometer) || 0) > 0 && (Number(e.liters) || 0) > 0)
      .sort((a, b) => (Number(a.odometer) || 0) - (Number(b.odometer) || 0));

    if (valid.length < 3) return null;

    const firstOdo = Number(valid[0].odometer);
    const lastOdo = Number(valid[valid.length - 1].odometer);
    const totalDistance = lastOdo - firstOdo;
    const totalFuel = valid.slice(1).reduce((sum, e) => sum + (Number(e.liters) || 0), 0);

    if (totalDistance <= 0 || totalFuel <= 0) return null;

    return {
      avgKmPerLiter: Number((totalDistance / totalFuel).toFixed(2)),
      entryCount: valid.length,
      totalDistance,
      totalFuel: Number(totalFuel.toFixed(1)),
      firstOdo,
      lastOdo,
    };
  }, [filteredEntries]);

  // Build cycles from the full primary-period entry stream, then optionally keep only cycles whose closing anchor falls in the selected week (dates match the week filter).
  const cycles = useMemo(() => {
    const valid = filteredEntries
      .filter(e => (Number(e.odometer) || 0) > 0)
      .sort((a, b) => {
        const dA = new Date(a.date).getTime();
        const dB = new Date(b.date).getTime();
        if (!isNaN(dA) && !isNaN(dB) && dA !== dB) return dA - dB;
        return (Number(a.odometer) || 0) - (Number(b.odometer) || 0);
      });

    const baseline =
      selectedWeekKey !== null
        ? rollingAverage?.avgKmPerLiter || 0
        : rollingAveragePeriod?.avgKmPerLiter || 0;

    const result: CycleData[] = [];
    let lastAnchorOdo = 0;
    let cumulativeFuel = 0;
    let cycleEntryCount = 0;

    for (const entry of valid) {
      const odo = Number(entry.odometer) || 0;
      const liters = Number(entry.liters) || 0;
      cumulativeFuel += liters;
      cycleEntryCount++;

      const isAnchor =
        entry.metadata?.isAnchor === true ||
        entry.metadata?.isSoftAnchor === true ||
        entry.metadata?.isFullTank === true;

      if (isAnchor && lastAnchorOdo > 0) {
        const distance = odo - lastAnchorOdo;
        if (distance > 0 && cumulativeFuel > 0) {
          const actualKmL = distance / cumulativeFuel;
          const variance = baseline > 0 ? (baseline - actualKmL) / baseline : 0;
          result.push({
            anchorEntry: entry,
            startOdo: lastAnchorOdo,
            endOdo: odo,
            distance,
            fuelConsumed: Number(cumulativeFuel.toFixed(1)),
            actualKmL: Number(actualKmL.toFixed(2)),
            entryCount: cycleEntryCount,
            date: entry.date,
            variance: Number(variance.toFixed(4)),
          });
        }
      }

      if (isAnchor) {
        lastAnchorOdo = odo;
        cumulativeFuel = 0;
        cycleEntryCount = 0;
      }
    }

    if (selectedWeekKey === null) return result;

    const ws = new Date(selectedWeekKey);
    const we = endOfWeek(ws, { weekStartsOn: 1 });
    const weekInterval = { start: startOfDay(ws), end: endOfDay(we) };
    return result.filter(c => {
      if (!c.date) return false;
      const t = new Date(c.date);
      return !isNaN(t.getTime()) && isWithinInterval(t, weekInterval);
    });
  }, [filteredEntries, rollingAveragePeriod, rollingAverage, selectedWeekKey]);

  const chartData = useMemo(() => {
    const base =
      selectedWeekKey !== null
        ? rollingAverage?.avgKmPerLiter || 0
        : rollingAveragePeriod?.avgKmPerLiter || 0;
    return cycles.map((c, i) => ({
      label: c.date ? format(new Date(c.date), 'MMM d') : `Cycle ${i + 1}`,
      date: c.date,
      actualKmL: c.actualKmL,
      baseline: base,
      threshold: base * 0.7,
      variance: Number((c.variance * 100).toFixed(1)),
    }));
  }, [cycles, rollingAverage, rollingAveragePeriod, selectedWeekKey]);

  // All entries with metadata for the detail table
  const allEntriesData = useMemo(() => {
    return scopedEntries
      .filter(e => (Number(e.odometer) || 0) > 0)
      .sort((a, b) => {
        if (sortField === 'date') {
          const diff = new Date(a.date).getTime() - new Date(b.date).getTime();
          return sortAsc ? diff : -diff;
        }
        if (sortField === 'kmL') {
          const aV = Number(a.metadata?.actualKmPerLiter) || 0;
          const bV = Number(b.metadata?.actualKmPerLiter) || 0;
          return sortAsc ? aV - bV : bV - aV;
        }
        if (sortField === 'variance') {
          const aV = Number(a.metadata?.efficiencyVariance) || 0;
          const bV = Number(b.metadata?.efficiencyVariance) || 0;
          return sortAsc ? aV - bV : bV - aV;
        }
        return 0;
      });
  }, [scopedEntries, sortField, sortAsc]);

  // Stats
  const stats = useMemo(() => {
    const flaggedCycles = cycles.filter(c => c.variance > 0.3);
    const passingCycles = cycles.filter(c => c.variance <= 0.3);
    const bestCycle = cycles.length > 0
      ? cycles.reduce((best, c) => c.actualKmL > best.actualKmL ? c : best, cycles[0])
      : null;
    const worstCycle = cycles.length > 0
      ? cycles.reduce((worst, c) => c.actualKmL < worst.actualKmL ? c : worst, cycles[0])
      : null;

    return { flaggedCycles: flaggedCycles.length, passingCycles: passingCycles.length, bestCycle, worstCycle };
  }, [cycles]);

  const tankCapacity = Number(vehicle?.fuelSettings?.tankCapacity) || Number(vehicle?.specifications?.tankCapacity) || 0;
  // efficiencyCity and fuelEconomy are stored as L/100km — convert to km/L for display
  const rawEfficiencyL100km = Number(vehicle?.specifications?.fuelEconomy) || Number(vehicle?.fuelSettings?.efficiencyCity) || 0;
  const profileKmL = rawEfficiencyL100km > 0 ? Number((100 / rawEfficiencyL100km).toFixed(2)) : 0;

  function toggleSort(field: 'date' | 'kmL' | 'variance') {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        <span className="ml-3 text-slate-500">Loading efficiency data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-3" />
          <p className="text-red-600 font-medium">{error}</p>
          <Button variant="outline" className="mt-4" onClick={fetchEntries}>
            <RefreshCw className="h-4 w-4 mr-2" /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (entries.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <Fuel className="h-8 w-8 text-slate-400 mx-auto mb-3" />
          <p className="text-slate-500">No fuel entries found for this vehicle.</p>
        </CardContent>
      </Card>
    );
  }

  const noEntriesInPeriod = filteredEntries.length === 0 && entries.length > 0;
  const noEntriesInWeek =
    scopedEntries.length === 0 && filteredEntries.length > 0 && selectedWeekKey !== null;

  /** Picking a week fixes Period to All time and disables the period control; any non–All time preset disables the week control. */
  const periodFilterLocked = selectedWeekKey !== null;
  const weekFilterLocked = periodPreset !== 'all';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Km/L Efficiency Tracking</h3>
          <p className="text-sm text-slate-500">
            {periodPreset === 'all' && !selectedWeekLabel ? (
              <>
                Rolling average computed from {entries.length} fuel entries using the fill-up method
              </>
            ) : (
              <>
                {periodPreset !== 'all' && (
                  <span className="text-slate-700 font-medium">{periodLabel}</span>
                )}
                {periodPreset !== 'all' && selectedWeekLabel && ' · '}
                {selectedWeekLabel && (
                  <span className="text-slate-700 font-medium">Week {selectedWeekLabel}</span>
                )}
                {(periodPreset !== 'all' || selectedWeekLabel) && (
                  <>
                    {' · '}
                    Rolling average from {scopedEntries.length} fuel entries in scope ({entries.length}{' '}
                    loaded)
                  </>
                )}
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-slate-400 hidden sm:block" aria-hidden />
            <Select
              value={periodPreset}
              disabled={periodFilterLocked}
              onValueChange={(v) => {
                const next = v as PeriodPreset;
                setPeriodPreset(next);
                if (next === 'custom' && !customRange?.from) {
                  setCustomRange({ from: subDays(new Date(), 29), to: new Date() });
                }
              }}
            >
              <SelectTrigger
                className="w-[160px] h-9"
                aria-label="Period"
                title={
                  periodFilterLocked
                    ? 'Clear the week filter (choose Entire selected period in the week menu) to change period'
                    : undefined
                }
              >
                <SelectValue placeholder="Period" />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
                <SelectItem value="12m">Last 12 months</SelectItem>
                <SelectItem value="custom">Custom range…</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {primaryRangeForWeeks && weekOptionsForDropdown.length > 0 && !noEntriesInPeriod && (
            <PeriodWeekDropdown
              optionsOverride={weekOptionsForDropdown}
              headerLabel={selectedWeekKey === null ? weekListRangeBanner : undefined}
              prependEntireOption
              selectedStart={selectedWeekRangeStrings?.start}
              selectedEnd={selectedWeekRangeStrings?.end}
              disabled={weekFilterLocked}
              title={
                weekFilterLocked
                  ? 'Switch Period to All time to filter by week'
                  : undefined
              }
              onSelect={period => {
                if (period.id === ENTIRE_PERIOD_OPTION_ID) {
                  setSelectedWeekKey(null);
                  return;
                }
                setPeriodPreset('all');
                const d = parseISO(period.startDate);
                setSelectedWeekKey(startOfWeek(d, { weekStartsOn: 1 }).getTime());
              }}
              buttonClassName="h-9 min-w-[220px] max-w-[260px] justify-between rounded-md border-sky-200 bg-white py-2 text-sm font-normal shadow-none hover:border-sky-300"
            />
          )}
          {periodPreset === 'custom' && (
            <DatePickerWithRange
              date={customRange}
              setDate={setCustomRange}
              className="w-auto"
            />
          )}
          <Button variant="outline" size="sm" onClick={fetchEntries}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </div>
      </div>

      {noEntriesInPeriod ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Fuel className="h-8 w-8 text-slate-400 mx-auto mb-3" />
            <p className="text-slate-600 font-medium">No fuel entries in this period</p>
            <p className="text-sm text-slate-500 mt-1">Try a wider range or switch to all time.</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => {
                setPeriodPreset('all');
              }}
            >
              Show all time
            </Button>
          </CardContent>
        </Card>
      ) : noEntriesInWeek ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Fuel className="h-8 w-8 text-slate-400 mx-auto mb-3" />
            <p className="text-slate-600 font-medium">No fuel entries in this week</p>
            <p className="text-sm text-slate-500 mt-1">
              Choose another week or use &quot;Entire selected period&quot; in the week menu.
            </p>
            <Button variant="outline" className="mt-4" onClick={() => setSelectedWeekKey(null)}>
              Clear week filter
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Rolling Average */}
        <Card className="border-l-4 border-l-indigo-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Rolling Average</CardTitle>
            <Activity className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900">
              {rollingAverage ? `${rollingAverage.avgKmPerLiter}` : '—'}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              km/L {rollingAverage ? `(from ${rollingAverage.entryCount} entries)` : '(insufficient data)'}
            </p>
            {profileKmL > 0 && rollingAverage && (
              <p className="text-xs mt-1">
                {rollingAverage.avgKmPerLiter >= profileKmL ? (
                  <span className="text-emerald-600">
                    {((rollingAverage.avgKmPerLiter / profileKmL - 1) * 100).toFixed(0)}% above profile spec ({profileKmL} km/L)
                  </span>
                ) : (
                  <span className="text-amber-600">
                    {((1 - rollingAverage.avgKmPerLiter / profileKmL) * 100).toFixed(0)}% below profile spec ({profileKmL} km/L)
                  </span>
                )}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Distance / Fuel */}
        <Card className="border-l-4 border-l-emerald-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Total Tracked</CardTitle>
            <BarChart3 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {rollingAverage ? `${rollingAverage.totalDistance.toLocaleString()} km` : '—'}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {rollingAverage ? `${rollingAverage.totalFuel.toLocaleString()} L consumed` : 'No data'}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Odo range: {rollingAverage ? `${rollingAverage.firstOdo.toLocaleString()} → ${rollingAverage.lastOdo.toLocaleString()}` : '—'}
            </p>
          </CardContent>
        </Card>

        {/* Cycle Results */}
        <Card className="border-l-4 border-l-amber-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Fill-Up Cycles</CardTitle>
            <Fuel className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {cycles.length}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              anchor-to-anchor cycles
            </p>
            <div className="flex items-center gap-3 mt-2">
              <span className="flex items-center gap-1 text-xs">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                <span className="text-emerald-600 font-medium">{stats.passingCycles} pass</span>
              </span>
              <span className="flex items-center gap-1 text-xs">
                <AlertTriangle className="h-3 w-3 text-red-500" />
                <span className="text-red-600 font-medium">{stats.flaggedCycles} flagged</span>
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Best / Worst */}
        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Range</CardTitle>
            <ArrowUpDown className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            {stats.bestCycle && stats.worstCycle ? (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                  <span className="text-lg font-bold text-emerald-600">{stats.bestCycle.actualKmL} km/L</span>
                  <span className="text-xs text-slate-400">best</span>
                </div>
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-red-500" />
                  <span className="text-lg font-bold text-red-600">{stats.worstCycle.actualKmL} km/L</span>
                  <span className="text-xs text-slate-400">worst</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Spread: {(stats.bestCycle.actualKmL - stats.worstCycle.actualKmL).toFixed(1)} km/L
                </p>
              </>
            ) : (
              <p className="text-slate-500 text-sm">Not enough cycles</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* How it works explainer */}
      <Card className="bg-slate-50 border-slate-200">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-indigo-500 mt-0.5 shrink-0" />
            <div className="text-sm text-slate-600 space-y-1">
              <p className="font-medium text-slate-700">How the Rolling Average is Calculated</p>
              <p>
                All fuel entries with a valid odometer and liters are sorted by odometer.
                <strong> Total distance</strong> = highest odo - lowest odo.
                <strong> Total fuel</strong> = sum of all liters <em>except the first entry</em> (the fill-up method: the first fill's fuel was burned before the tracking window).
                <strong> Rolling Avg</strong> = distance / fuel.
              </p>
              <p>
                Each fill-up <em>cycle</em> (anchor to anchor) is then compared:
                if the cycle's actual km/L is more than <strong>30%</strong> worse than the rolling average, it's flagged as High Consumption.
              </p>
              {(periodPreset !== 'all' || selectedWeekLabel) && (
                <p className="text-slate-500 pt-1">
                  {selectedWeekLabel ? (
                    <>
                      The chart and table list only cycles whose <strong>closing anchor date</strong> falls in{' '}
                      <strong>Week {selectedWeekLabel}</strong> (same dates as the summary cards). Period is locked to{' '}
                      <strong>All time</strong> until you clear the week (choose &quot;Entire selected period&quot; in the week menu).
                    </>
                  ) : (
                    <>
                      Numbers below reflect <strong>{periodLabel}</strong> (entry dates within the selected window).
                    </>
                  )}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Efficiency Chart */}
      {chartData.length >= 1 && (
        <Card>
          <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Efficiency per Fill-Up Cycle</CardTitle>
              <CardDescription>
                Actual km/L at each anchor vs. rolling average for the same scope as the table
                {selectedWeekLabel && <span className="text-slate-600"> · Week {selectedWeekLabel}</span>}
                {!selectedWeekLabel && periodPreset !== 'all' && (
                  <span className="text-slate-600"> · {periodLabel}</span>
                )}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="h-[320px]">
            <SafeResponsiveContainer width="100%" height="100%" minHeight={280}>
              <ComposedChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  label={{ value: 'km/L', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }}
                />
                <RechartsTooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                  formatter={(value: number, name: string) => {
                    const labels: Record<string, string> = {
                      actualKmL: 'Actual km/L',
                      baseline: 'Rolling Avg',
                      threshold: 'Flag Threshold (70%)',
                    };
                    return [typeof value === 'number' ? value.toFixed(2) : value, labels[name] || name];
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11 }}
                  formatter={(value: string) => {
                    const labels: Record<string, string> = {
                      actualKmL: 'Actual km/L',
                      baseline: 'Rolling Avg',
                      threshold: 'Flag Threshold',
                    };
                    return labels[value] || value;
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="baseline"
                  stroke="#6366f1"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="threshold"
                  stroke="#ef4444"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  dot={false}
                />
                <Bar
                  dataKey="actualKmL"
                  fill="#6366f1"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                  fillOpacity={0.8}
                />
              </ComposedChart>
            </SafeResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Fill-Up Cycle Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fill-Up Cycles (Anchor to Anchor)</CardTitle>
          <CardDescription>
            {selectedWeekLabel ? (
              <>
                Cycles that <strong>closed</strong> during <strong>Week {selectedWeekLabel}</strong> (date column = closing anchor). Variance vs that week&apos;s rolling average.
              </>
            ) : (
              <>
                Each row = one complete tank cycle for your <strong>date filter</strong> (left). Variance vs that period&apos;s rolling average.
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {cycles.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <Fuel className="h-6 w-6 mx-auto mb-2 text-slate-400" />
              <p>
                {selectedWeekKey
                  ? 'No fill-up cycle closed in this week. Try another week or another period.'
                  : 'No complete fill-up cycles found. Need at least two anchor points (full-tank events).'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">
                      <TooltipProvider><Tooltip><TooltipTrigger asChild>
                        <span className="flex items-center gap-1 cursor-help">Date <Info className="h-3 w-3 text-slate-400" /></span>
                      </TooltipTrigger><TooltipContent side="top" className="max-w-[220px]">
                        <p className="text-xs">The date of the fill-up that closed this cycle (the anchor point at the end).</p>
                      </TooltipContent></Tooltip></TooltipProvider>
                    </TableHead>
                    <TableHead className="text-right">
                      <TooltipProvider><Tooltip><TooltipTrigger asChild>
                        <span className="flex items-center justify-end gap-1 cursor-help">Start Odo <Info className="h-3 w-3 text-slate-400" /></span>
                      </TooltipTrigger><TooltipContent side="top" className="max-w-[220px]">
                        <p className="text-xs">Odometer reading at the start of this cycle — the previous full-tank anchor point.</p>
                      </TooltipContent></Tooltip></TooltipProvider>
                    </TableHead>
                    <TableHead className="text-right">
                      <TooltipProvider><Tooltip><TooltipTrigger asChild>
                        <span className="flex items-center justify-end gap-1 cursor-help">End Odo <Info className="h-3 w-3 text-slate-400" /></span>
                      </TooltipTrigger><TooltipContent side="top" className="max-w-[220px]">
                        <p className="text-xs">Odometer reading at the end of this cycle — the full-tank anchor that closed it.</p>
                      </TooltipContent></Tooltip></TooltipProvider>
                    </TableHead>
                    <TableHead className="text-right">
                      <TooltipProvider><Tooltip><TooltipTrigger asChild>
                        <span className="flex items-center justify-end gap-1 cursor-help">Distance <Info className="h-3 w-3 text-slate-400" /></span>
                      </TooltipTrigger><TooltipContent side="top" className="max-w-[240px]">
                        <p className="text-xs">Total km driven during this cycle (End Odo minus Start Odo).</p>
                      </TooltipContent></Tooltip></TooltipProvider>
                    </TableHead>
                    <TableHead className="text-right">
                      <TooltipProvider><Tooltip><TooltipTrigger asChild>
                        <span className="flex items-center justify-end gap-1 cursor-help">Fuel (L) <Info className="h-3 w-3 text-slate-400" /></span>
                      </TooltipTrigger><TooltipContent side="top" className="max-w-[260px]">
                        <p className="text-xs">Total liters of fuel consumed during this cycle — the sum of all fill-ups between the two anchor points.</p>
                      </TooltipContent></Tooltip></TooltipProvider>
                    </TableHead>
                    <TableHead className="text-right">
                      <TooltipProvider><Tooltip><TooltipTrigger asChild>
                        <span className="flex items-center justify-end gap-1 cursor-help">Fills <Info className="h-3 w-3 text-slate-400" /></span>
                      </TooltipTrigger><TooltipContent side="top" className="max-w-[240px]">
                        <p className="text-xs">Number of individual fill-up events within this cycle. Multiple partial fills can happen before the next full-tank anchor.</p>
                      </TooltipContent></Tooltip></TooltipProvider>
                    </TableHead>
                    <TableHead className="text-right">
                      <TooltipProvider><Tooltip><TooltipTrigger asChild>
                        <span className="flex items-center justify-end gap-1 cursor-help">Actual km/L <Info className="h-3 w-3 text-slate-400" /></span>
                      </TooltipTrigger><TooltipContent side="top" className="max-w-[260px]">
                        <p className="text-xs">The real fuel efficiency for this cycle: Distance ÷ Fuel. Higher is better — the vehicle went further on less fuel.</p>
                      </TooltipContent></Tooltip></TooltipProvider>
                    </TableHead>
                    <TableHead className="text-right">
                      <TooltipProvider><Tooltip><TooltipTrigger asChild>
                        <span className="flex items-center justify-end gap-1 cursor-help">Variance <Info className="h-3 w-3 text-slate-400" /></span>
                      </TooltipTrigger><TooltipContent side="top" className="max-w-[280px]">
                        <p className="text-xs">How this cycle compares to the vehicle's rolling average. A negative value (e.g. -40%) means worse efficiency; a positive value (e.g. +13%) means better than average.</p>
                      </TooltipContent></Tooltip></TooltipProvider>
                    </TableHead>
                    <TableHead className="text-center">
                      <TooltipProvider><Tooltip><TooltipTrigger asChild>
                        <span className="flex items-center justify-center gap-1 cursor-help">Status <Info className="h-3 w-3 text-slate-400" /></span>
                      </TooltipTrigger><TooltipContent side="top" className="max-w-[280px]">
                        <p className="text-xs"><strong>Normal</strong> = within acceptable range. <strong>Watch</strong> = 15–30% worse than average. <strong>Flagged</strong> = more than 30% worse — possible fuel waste or anomaly.</p>
                      </TooltipContent></Tooltip></TooltipProvider>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cycles.map((cycle, i) => {
                    const isFlagged = cycle.variance > 0.3;
                    const isWarning = cycle.variance > 0.15 && !isFlagged;
                    return (
                      <TableRow
                        key={i}
                        className={isFlagged ? 'bg-red-50/50' : isWarning ? 'bg-amber-50/50' : ''}
                      >
                        <TableCell className="text-sm font-medium">
                          {cycle.date ? format(new Date(cycle.date), 'MMM d, yyyy') : '—'}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {cycle.startOdo.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {cycle.endOdo.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums font-medium">
                          {cycle.distance.toLocaleString()} km
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {cycle.fuelConsumed} L
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {cycle.entryCount}
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className={`text-sm font-bold tabular-nums ${
                              isFlagged
                                ? 'text-red-600'
                                : isWarning
                                ? 'text-amber-600'
                                : 'text-emerald-600'
                            }`}
                          >
                            {cycle.actualKmL.toFixed(2)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className={`text-sm tabular-nums ${
                              cycle.variance > 0
                                ? cycle.variance > 0.3
                                  ? 'text-red-600 font-bold'
                                  : cycle.variance > 0.15
                                  ? 'text-amber-600'
                                  : 'text-slate-600'
                                : 'text-emerald-600'
                            }`}
                          >
                            {cycle.variance > 0 ? '-' : '+'}{Math.abs(cycle.variance * 100).toFixed(1)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          {isFlagged ? (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                              Flagged
                            </Badge>
                          ) : isWarning ? (
                            <Badge className="bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0">
                              Watch
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-100 text-emerald-700 text-[10px] px-1.5 py-0">
                              Normal
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* All Entries Detail */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">All Fuel Entries (Raw Data)</CardTitle>
            <CardDescription>
              Every fuel entry's stored efficiency metadata — click column headers to sort
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAllEntries(!showAllEntries)}
          >
            {showAllEntries ? (
              <><ChevronUp className="h-4 w-4 mr-1" /> Collapse</>
            ) : (
              <><ChevronDown className="h-4 w-4 mr-1" /> Show {allEntriesData.length} entries</>
            )}
          </Button>
        </CardHeader>
        {showAllEntries && (
          <CardContent>
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-white z-10">
                  <TableRow>
                    <TableHead
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => toggleSort('date')}
                    >
                      Date {sortField === 'date' && (sortAsc ? '↑' : '↓')}
                    </TableHead>
                    <TableHead className="text-right">Odometer</TableHead>
                    <TableHead className="text-right">Liters</TableHead>
                    <TableHead className="text-right">Dist Since Anchor</TableHead>
                    <TableHead
                      className="text-right cursor-pointer hover:bg-slate-50"
                      onClick={() => toggleSort('kmL')}
                    >
                      Actual km/L {sortField === 'kmL' && (sortAsc ? '↑' : '↓')}
                    </TableHead>
                    <TableHead className="text-right">Rolling Avg</TableHead>
                    <TableHead
                      className="text-right cursor-pointer hover:bg-slate-50"
                      onClick={() => toggleSort('variance')}
                    >
                      Variance {sortField === 'variance' && (sortAsc ? '↑' : '↓')}
                    </TableHead>
                    <TableHead className="text-center">Anchor</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allEntriesData.map((entry) => {
                    const m = entry.metadata || {};
                    const actualKmL = Number(m.actualKmPerLiter) || 0;
                    const rollingAvg = Number(m.rollingAvgKmPerLiter) || 0;
                    const variance = Number(m.efficiencyVariance) || 0;
                    const dist = Number(m.distanceSinceAnchor) || 0;
                    const isAnchor = m.isAnchor || m.isSoftAnchor;
                    const status = m.auditStatus || entry.auditStatus || 'Clean';
                    const anomaly = m.anomalyReason || entry.anomalyReason;

                    return (
                      <TableRow
                        key={entry.id}
                        className={
                          status === 'Flagged'
                            ? 'bg-red-50/40'
                            : status === 'Observing'
                            ? 'bg-amber-50/40'
                            : ''
                        }
                      >
                        <TableCell className="text-sm">
                          {entry.date ? format(new Date(entry.date), 'MMM d, yyyy') : '—'}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {(Number(entry.odometer) || 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {(Number(entry.liters) || 0).toFixed(1)}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {dist > 0 ? `${dist.toLocaleString()} km` : '—'}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums font-medium">
                          {actualKmL > 0 ? actualKmL.toFixed(2) : '—'}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums text-slate-500">
                          {rollingAvg > 0 ? rollingAvg.toFixed(2) : '—'}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {variance !== 0 ? (
                            <span className={
                              variance > 0.3 ? 'text-red-600 font-bold' :
                              variance > 0.15 ? 'text-amber-600' :
                              variance > 0 ? 'text-slate-600' :
                              'text-emerald-600'
                            }>
                              {variance > 0 ? '-' : '+'}{Math.abs(variance * 100).toFixed(1)}%
                            </span>
                          ) : '—'}
                        </TableCell>
                        <TableCell className="text-center">
                          {isAnchor ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-indigo-300 text-indigo-600">
                                    {m.isFullTank || m.isAnchor ? 'Hard' : 'Soft'}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">
                                    {m.isFullTank || m.isAnchor
                                      ? 'Manual full-tank anchor'
                                      : 'System-detected: cumulative fuel >= 100% tank'}
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {status === 'Flagged' ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                    Flagged
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">{anomaly || 'Anomaly detected'}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : status === 'Observing' ? (
                            <Badge className="bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0">
                              Observing
                            </Badge>
                          ) : status === 'Resolved' || status === 'Auto-Resolved' ? (
                            <Badge className="bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0">
                              {status}
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-100 text-emerald-700 text-[10px] px-1.5 py-0">
                              Clean
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        )}
      </Card>
        </>
      )}
    </div>
  );
}