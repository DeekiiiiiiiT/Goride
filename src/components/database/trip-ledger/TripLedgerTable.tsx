import React, { useState, useMemo, useCallback } from 'react';
import { Trip } from '../../../types/data';
import { Copy, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, ChevronsUpDown, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import type { ColumnDef } from './TripLedgerColumnToggle';

// ── Formatters ──────────────────────────────────────────────────────────────

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' ' +
      d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return '—';
  }
}

function formatDistance(km: number | null | undefined): string {
  if (km == null) return '—';
  return `${km.toFixed(1)} km`;
}

function formatDuration(min: number | null | undefined): string {
  if (min == null) return '—';
  if (min < 1) return '<1 min';
  if (min >= 60) {
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${Math.round(min)} min`;
}

function truncateId(id: string): string {
  if (!id) return '—';
  return id.length > 8 ? '…' + id.slice(-8) : id;
}

function formatPercent(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${v.toFixed(1)}%`;
}

// ── Net income helper ───────────────────────────────────────────────────────

function getNetIncome(t: Trip): number | null {
  if (t.netToDriver != null) return t.netToDriver;
  if (t.grossEarnings != null) return t.grossEarnings;
  if (t.amount != null) return t.amount;
  return null;
}

// ── Batch source label ──────────────────────────────────────────────────────

function getBatchLabel(trip: Trip): string {
  if ((trip as any).isManual) return 'Manual Entry';
  if ((trip as any).isLiveRecorded) return 'Live Recording';
  if (trip.batchId) return truncateId(trip.batchId);
  return '—';
}

// ── Platform & Status badges ────────────────────────────────────────────────

const PLATFORM_BADGE_CLASSES: Record<string, string> = {
  Uber: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  Lyft: 'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300',
  Bolt: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  InDrive: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  Roam: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
  GoRide: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300',
  Private: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  Cash: 'bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-300',
  Other: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

const STATUS_BADGE_CLASSES: Record<string, string> = {
  Completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  Cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  Processing: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
};

// ── Sorting ─────────────────────────────────────────────────────────────────

type SortDir = 'asc' | 'desc' | null;

/** Get a raw sortable value from a trip for a given column key */
function getSortValue(trip: Trip, key: string): string | number | null {
  switch (key) {
    case 'id': return trip.id || '';
    case 'date': return trip.date || '';
    case 'driver': return (trip.driverName || trip.driverId || '').toUpperCase();
    case 'vehicle': return trip.vehicleId || '';
    case 'platform': return trip.platform || '';
    case 'status': return trip.status || '';
    case 'distance': return trip.distance ?? null;
    case 'duration': return trip.duration ?? null;
    case 'amount': return trip.amount ?? null;
    case 'netIncome': return getNetIncome(trip);
    case 'paymentMethod': return trip.paymentMethod || '';
    case 'cashCollected': return trip.cashCollected ?? null;
    case 'tips': return trip.fareBreakdown?.tips ?? null;
    case 'surge': return trip.fareBreakdown?.surge ?? null;
    case 'tolls': return trip.tollCharges ?? null;
    case 'serviceFee': return trip.indriveServiceFee ?? null;
    case 'pickup': return trip.pickupLocation || '';
    case 'dropoff': return trip.dropoffLocation || '';
    case 'serviceCategory': return trip.serviceCategory || '';
    case 'batchSource': return trip.batchId || '';
    case 'efficiencyScore': return trip.efficiencyScore ?? null;
    default: return null;
  }
}

function compareValues(a: string | number | null, b: string | number | null, dir: 'asc' | 'desc'): number {
  // nulls always last
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  let cmp = 0;
  if (typeof a === 'number' && typeof b === 'number') {
    cmp = a - b;
  } else {
    cmp = String(a).localeCompare(String(b));
  }
  return dir === 'desc' ? -cmp : cmp;
}

// ── Column definitions (exported for use by ColumnToggle & Page) ────────────

export interface RenderColumnDef extends ColumnDef {
  render: (trip: Trip) => React.ReactNode;
  align?: 'left' | 'right';
  minWidth?: string;
  sortable?: boolean;
}

export const ALL_COLUMNS: RenderColumnDef[] = [
  // ── Core Fields (12 default-visible) ──
  {
    key: 'id', label: 'ID', defaultVisible: true, group: 'core',
    render: (t) => truncateId(t.id),
    minWidth: '100px', sortable: true,
  },
  {
    key: 'date', label: 'Date/Time', defaultVisible: true, group: 'core',
    render: (t) => formatDate(t.date),
    minWidth: '160px', sortable: true,
  },
  {
    key: 'driver', label: 'Driver', defaultVisible: true, group: 'core',
    render: (t) => {
      if (t.driverName?.trim()) return t.driverName.trim().toUpperCase();
      return t.driverId ? truncateId(t.driverId) : '—';
    },
    minWidth: '120px', sortable: true,
  },
  {
    key: 'vehicle', label: 'Vehicle', defaultVisible: true, group: 'core',
    render: (t) => t.vehicleId ? truncateId(t.vehicleId) : '—',
    minWidth: '100px', sortable: true,
  },
  {
    key: 'platform', label: 'Platform', defaultVisible: true, group: 'core',
    render: (t) => {
      const cls = PLATFORM_BADGE_CLASSES[t.platform] || PLATFORM_BADGE_CLASSES.Other;
      return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{t.platform}</span>;
    },
    sortable: true,
  },
  {
    key: 'status', label: 'Status', defaultVisible: true, group: 'core',
    render: (t) => {
      const cls = STATUS_BADGE_CLASSES[t.status] || STATUS_BADGE_CLASSES.Processing;
      return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{t.status}</span>;
    },
    sortable: true,
  },
  {
    key: 'distance', label: 'Distance', defaultVisible: true, group: 'core',
    render: (t) => formatDistance(t.distance),
    align: 'right', sortable: true,
  },
  {
    key: 'duration', label: 'Duration', defaultVisible: true, group: 'core',
    render: (t) => formatDuration(t.duration),
    align: 'right', sortable: true,
  },

  // ── Financial Fields ──
  {
    key: 'amount', label: 'Amount', defaultVisible: true, group: 'financial',
    render: (t) => formatCurrency(t.amount),
    align: 'right', sortable: true,
  },
  {
    key: 'netIncome', label: 'Net Income', defaultVisible: true, group: 'financial',
    render: (t) => formatCurrency(getNetIncome(t)),
    align: 'right', sortable: true,
  },
  {
    key: 'paymentMethod', label: 'Payment', defaultVisible: true, group: 'financial',
    render: (t) => t.paymentMethod || '—',
    sortable: true,
  },
  {
    key: 'cashCollected', label: 'Cash Collected', defaultVisible: true, group: 'financial',
    render: (t) => t.cashCollected ? formatCurrency(t.cashCollected) : '—',
    align: 'right', sortable: true,
  },
  {
    key: 'tips', label: 'Tips', defaultVisible: false, group: 'financial',
    render: (t) => t.fareBreakdown?.tips ? formatCurrency(t.fareBreakdown.tips) : '—',
    align: 'right', sortable: true,
  },
  {
    key: 'surge', label: 'Surge', defaultVisible: false, group: 'financial',
    render: (t) => t.fareBreakdown?.surge ? formatCurrency(t.fareBreakdown.surge) : '—',
    align: 'right', sortable: true,
  },
  {
    key: 'tolls', label: 'Tolls', defaultVisible: false, group: 'financial',
    render: (t) => t.tollCharges ? formatCurrency(t.tollCharges) : '—',
    align: 'right', sortable: true,
  },
  {
    key: 'serviceFee', label: 'Service Fee', defaultVisible: false, group: 'financial',
    render: (t) => t.indriveServiceFee ? formatCurrency(t.indriveServiceFee) : '—',
    align: 'right', sortable: true,
  },

  // ── Metadata Fields ──
  {
    key: 'pickup', label: 'Pickup', defaultVisible: false, group: 'meta',
    render: (t) => t.pickupLocation || '—',
    minWidth: '180px', sortable: true,
  },
  {
    key: 'dropoff', label: 'Dropoff', defaultVisible: false, group: 'meta',
    render: (t) => t.dropoffLocation || '—',
    minWidth: '180px', sortable: true,
  },
  {
    key: 'serviceCategory', label: 'Service Category', defaultVisible: false, group: 'meta',
    render: (t) => {
      if (!t.serviceCategory) return '—';
      if (t.serviceCategory === 'courier') return <span className="inline-flex items-center gap-1 text-xs"><span>📦</span> Courier</span>;
      return <span className="text-xs">Ride</span>;
    },
    sortable: true,
  },
  {
    key: 'batchSource', label: 'Batch Source', defaultVisible: false, group: 'meta',
    render: (t) => getBatchLabel(t),
    sortable: true,
  },
  {
    key: 'efficiencyScore', label: 'Efficiency', defaultVisible: false, group: 'meta',
    render: (t) => t.efficiencyScore != null ? `${Math.round(t.efficiencyScore)}/100` : '—',
    align: 'right', sortable: true,
  },
];

export const DEFAULT_VISIBLE_KEYS = ALL_COLUMNS.filter(c => c.defaultVisible).map(c => c.key);

/** Super Admin ledger config: merge saved labels + column order with ALL_COLUMNS render/sort logic. */
export function mergeTripLedgerActiveColumns(
  visibleColumns: string[],
  columnConfig?: { key: string; label: string; visible: boolean }[],
): RenderColumnDef[] {
  if (columnConfig != null && columnConfig.length > 0) {
    const out: RenderColumnDef[] = [];
    for (const c of columnConfig) {
      if (!c.visible) continue;
      const base = ALL_COLUMNS.find(ac => ac.key === c.key);
      if (!base) continue;
      const label = c.label?.trim() ? c.label.trim() : base.label;
      out.push({ ...base, label });
    }
    return out;
  }
  return ALL_COLUMNS.filter(col => visibleColumns.includes(col.key));
}

// ── Skeleton ────────────────────────────────────────────────────────────────

function SkeletonRow({ colCount }: { colCount: number }) {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: colCount }).map((_, i) => (
        <td key={i} className="px-3 py-3">
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-full" />
        </td>
      ))}
    </tr>
  );
}

// ── Expanded Detail Panel ───────────────────────────────────────────────────

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-medium">{label}</span>
      <span className="text-sm text-slate-700 dark:text-slate-300">{value || '—'}</span>
    </div>
  );
}

/**
 * Maps column keys to their value extractors for the detail panel.
 * This allows the detail panel to be data-driven by the column config.
 */
const DETAIL_FIELD_EXTRACTORS: Record<string, { label: string; getValue: (t: Trip) => React.ReactNode }> = {
  // Core fields
  id: { label: 'ID', getValue: (t) => <span className="font-mono text-xs">{t.id}</span> },
  date: { label: 'Date & Time', getValue: (t) => formatDate(t.date) },
  requestTime: { label: 'Request Time', getValue: (t) => formatDate(t.requestTime) },
  dropoffTime: { label: 'Dropoff Time', getValue: (t) => formatDate(t.dropoffTime) },
  platform: { label: 'Platform', getValue: (t) => t.platform },
  status: { label: 'Status', getValue: (t) => t.status },
  serviceType: { label: 'Service Type', getValue: (t) => t.serviceType || t.productType },
  serviceCategory: { label: 'Service Category', getValue: (t) => t.serviceCategory === 'courier' ? 'Courier' : t.serviceCategory === 'ride' ? 'Ride' : t.serviceCategory },
  driver: { label: 'Driver', getValue: (t) => t.driverName?.trim() ? t.driverName.trim().toUpperCase() : t.driverName || t.driverId },
  vehicle: { label: 'Vehicle', getValue: (t) => t.vehicleId },
  
  // Geography
  pickup: { label: 'Pickup', getValue: (t) => t.pickupLocation },
  dropoff: { label: 'Dropoff', getValue: (t) => t.dropoffLocation },
  pickupArea: { label: 'Pickup Area', getValue: (t) => t.pickupArea },
  dropoffArea: { label: 'Dropoff Area', getValue: (t) => t.dropoffArea },
  distance: { label: 'Distance', getValue: (t) => formatDistance(t.distance) },
  duration: { label: 'Duration', getValue: (t) => formatDuration(t.duration) },
  
  // Financial
  amount: { label: 'Amount', getValue: (t) => formatCurrency(t.amount) },
  grossEarnings: { label: 'Gross Earnings', getValue: (t) => formatCurrency(t.grossEarnings) },
  netIncome: { label: 'Net to Driver', getValue: (t) => formatCurrency(getNetIncome(t)) },
  paymentMethod: { label: 'Payment Method', getValue: (t) => t.paymentMethod },
  cashCollected: { label: 'Cash Collected', getValue: (t) => formatCurrency(t.cashCollected) },
  netPayout: { label: 'Net Payout', getValue: (t) => formatCurrency(t.netPayout) },
  tolls: { label: 'Toll Charges', getValue: (t) => formatCurrency(t.tollCharges) },
  
  // Fare breakdown
  baseFare: { label: 'Base Fare', getValue: (t) => formatCurrency(t.fareBreakdown?.baseFare) },
  tips: { label: 'Tips', getValue: (t) => formatCurrency(t.fareBreakdown?.tips) },
  waitTime: { label: 'Wait Time Fee', getValue: (t) => formatCurrency(t.fareBreakdown?.waitTime) },
  surge: { label: 'Surge', getValue: (t) => formatCurrency(t.fareBreakdown?.surge) },
  airportFees: { label: 'Airport Fees', getValue: (t) => formatCurrency(t.fareBreakdown?.airportFees) },
  timeAtStop: { label: 'Time at Stop', getValue: (t) => formatCurrency(t.fareBreakdown?.timeAtStop) },
  taxes: { label: 'Taxes', getValue: (t) => formatCurrency(t.fareBreakdown?.taxes) },
  
  // InDrive-specific
  serviceFee: { label: 'InDrive Service Fee', getValue: (t) => formatCurrency(t.indriveServiceFee) },
  indriveServiceFeePercent: { label: 'InDrive Fee %', getValue: (t) => formatPercent(t.indriveServiceFeePercent) },
  indriveNetIncome: { label: 'InDrive Net Income', getValue: (t) => formatCurrency(t.indriveNetIncome) },
  indriveBalanceDeduction: { label: 'Balance Deduction', getValue: (t) => formatCurrency(t.indriveBalanceDeduction) },
  
  // Analytics
  speed: { label: 'Speed', getValue: (t) => t.speed != null ? `${t.speed.toFixed(1)} km/h` : undefined },
  earningsPerKm: { label: 'Earnings/km', getValue: (t) => t.earningsPerKm != null ? formatCurrency(t.earningsPerKm) : undefined },
  earningsPerMin: { label: 'Earnings/min', getValue: (t) => t.earningsPerMin != null ? formatCurrency(t.earningsPerMin) : undefined },
  efficiencyScore: { label: 'Efficiency Score', getValue: (t) => t.efficiencyScore != null ? `${Math.round(t.efficiencyScore)}/100` : undefined },
  tripRating: { label: 'Trip Rating', getValue: (t) => t.tripRating != null ? `${t.tripRating}/5` : undefined },
  dayOfWeek: { label: 'Day of Week', getValue: (t) => t.dayOfWeek },
  
  // Metadata
  batchSource: { label: 'Batch ID', getValue: (t) => t.batchId ? <span className="font-mono text-xs">{t.batchId}</span> : undefined },
  anchorPeriod: { label: 'Anchor Period', getValue: (t) => t.anchorPeriodId ? <span className="font-mono text-xs">{t.anchorPeriodId}</span> : undefined },
  routeId: { label: 'Route ID', getValue: (t) => t.routeId },
  notes: { label: 'Notes', getValue: (t) => t.notes },
};

/** Default detail fields shown when no column config is provided */
const DEFAULT_DETAIL_KEYS = [
  'date', 'requestTime', 'dropoffTime', 'platform', 'status', 'serviceType', 'serviceCategory', 'driver', 'vehicle',
  'pickup', 'dropoff', 'pickupArea', 'dropoffArea', 'distance', 'duration',
  'amount', 'grossEarnings', 'netIncome', 'paymentMethod', 'cashCollected', 'netPayout', 'tolls',
  'baseFare', 'tips', 'waitTime', 'surge', 'airportFees', 'timeAtStop', 'taxes',
  'speed', 'earningsPerKm', 'earningsPerMin', 'efficiencyScore', 'tripRating', 'dayOfWeek',
  'batchSource', 'anchorPeriod', 'routeId', 'notes',
];

interface TripDetailPanelProps {
  trip: Trip;
  colSpan: number;
  columnConfig?: ColumnConfig[];
}

function TripDetailPanel({ trip, colSpan, columnConfig }: TripDetailPanelProps) {
  // Determine which fields to show based on column config
  const fieldsToShow = columnConfig
    ? columnConfig.filter(c => c.visible).map(c => c.key)
    : DEFAULT_DETAIL_KEYS;

  // Include InDrive-specific fields if trip has InDrive data
  const hasIndriveData = trip.indriveServiceFee != null;
  const indriveKeys = ['serviceFee', 'indriveServiceFeePercent', 'indriveNetIncome', 'indriveBalanceDeduction'];
  
  // Include cancellation fields if trip is cancelled
  const isCancelled = trip.status === 'Cancelled';
  
  return (
    <tr>
      <td colSpan={colSpan} className="p-0">
        <div className="bg-slate-50 dark:bg-slate-800/50 border-t border-b border-slate-200 dark:border-slate-700 px-6 py-4">
          {/* Title */}
          <div className="flex items-center gap-2 mb-4">
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Trip Details</h4>
            <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">{trip.id}</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-6 gap-y-3">
            {fieldsToShow.map(key => {
              const extractor = DETAIL_FIELD_EXTRACTORS[key];
              if (!extractor) {
                // Handle custom columns - show raw value from trip
                const customValue = (trip as any)[key];
                if (customValue === undefined || customValue === null) return null;
                const configCol = columnConfig?.find(c => c.key === key);
                return (
                  <DetailField 
                    key={key} 
                    label={configCol?.label || key} 
                    value={String(customValue)} 
                  />
                );
              }
              const value = extractor.getValue(trip);
              if (value === undefined || value === null || value === '') return null;
              const cfgLabel = columnConfig?.find(cc => cc.key === key)?.label?.trim();
              const displayLabel = cfgLabel || extractor.label;
              return <DetailField key={key} label={displayLabel} value={value} />;
            })}
            
            {/* Always show InDrive fields if trip has InDrive data */}
            {hasIndriveData && !columnConfig && indriveKeys.map(key => {
              const extractor = DETAIL_FIELD_EXTRACTORS[key];
              if (!extractor) return null;
              const value = extractor.getValue(trip);
              if (value === undefined || value === null) return null;
              return <DetailField key={key} label={extractor.label} value={value} />;
            })}
            
            {/* Always show cancellation fields if cancelled */}
            {isCancelled && (
              <>
                <DetailField label="Cancelled By" value={trip.cancelledBy} />
                <DetailField label="Cancellation Reason" value={trip.cancellationReason} />
                <DetailField label="Estimated Loss" value={formatCurrency(trip.estimatedLoss)} />
              </>
            )}
            
            {/* Uber prior period adjustment */}
            {trip.uberPriorPeriodAdjustment != null && Math.abs(trip.uberPriorPeriodAdjustment) > 0.0001 && (
              <DetailField label="Adj. previous periods" value={formatCurrency(trip.uberPriorPeriodAdjustment)} />
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── Memoized Data Row ───────────────────────────────────────────────────────

interface DataRowProps {
  trip: Trip;
  idx: number;
  activeCols: RenderColumnDef[];
  loading: boolean;
  isExpanded: boolean;
  columnConfig?: ColumnConfig[];
  onToggleExpand: (id: string) => void;
  onCopyId: (id: string) => void;
}

const DataRow = React.memo(function DataRow({ trip, idx, activeCols, loading, isExpanded, columnConfig, onToggleExpand, onCopyId }: DataRowProps) {
  return (
    <>
      <tr
        onClick={() => onToggleExpand(trip.id)}
        className={`
          group transition-colors cursor-pointer
          ${isExpanded ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : idx % 2 === 1 ? 'bg-slate-50/50 dark:bg-slate-800/20' : ''}
          hover:bg-slate-50 dark:hover:bg-slate-800/40
          ${loading ? 'opacity-50' : ''}
        `}
      >
        {activeCols.map(col => {
          // Special handling for ID column (copy-to-clipboard button)
          if (col.key === 'id') {
            return (
              <td key={col.key} className="px-3 py-2.5 whitespace-nowrap">
                <button
                  onClick={(e) => { e.stopPropagation(); onCopyId(trip.id); }}
                  className="inline-flex items-center gap-1 text-xs font-mono text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                  title={`Click to copy: ${trip.id}`}
                >
                  {col.render(trip)}
                  <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100" />
                </button>
              </td>
            );
          }

          // Special styling for certain columns
          const isNetIncome = col.key === 'netIncome';
          const isAmount = col.key === 'amount';
          const isDriver = col.key === 'driver';

          return (
            <td
              key={col.key}
              className={`px-3 py-2.5 whitespace-nowrap text-sm tabular-nums
                ${col.align === 'right' ? 'text-right' : 'text-left'}
                ${isNetIncome ? 'font-medium text-emerald-700 dark:text-emerald-400' : ''}
                ${isAmount ? 'font-medium text-slate-800 dark:text-slate-200' : ''}
                ${isDriver ? 'max-w-[150px] truncate text-slate-700 dark:text-slate-300' : ''}
                ${!isNetIncome && !isAmount && !isDriver ? 'text-slate-600 dark:text-slate-400' : ''}
              `}
              style={col.minWidth ? { minWidth: col.minWidth } : undefined}
            >
              {col.render(trip)}
            </td>
          );
        })}
      </tr>
      {isExpanded && <TripDetailPanel trip={trip} colSpan={activeCols.length} columnConfig={columnConfig} />}
    </>
  );
});

// ── Sort indicator icon ─────────────────────────────────────────────────────

function SortIcon({ dir }: { dir: SortDir }) {
  if (dir === 'asc') return <ChevronUp className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />;
  if (dir === 'desc') return <ChevronDown className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />;
  return <ChevronsUpDown className="h-3 w-3 opacity-0 group-hover/th:opacity-40 transition-opacity" />;
}

// ── Column Config type (matches LedgerColumnSettings) ───────────────────────

export interface ColumnConfig {
  key: string;
  label: string;
  visible: boolean;
  custom?: boolean;
}

// ── Main Component ──────────────────────────────────────────────────────────

interface TripLedgerTableProps {
  trips: Trip[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  visibleColumns: string[];
  columnConfig?: ColumnConfig[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export function TripLedgerTable({
  trips,
  total,
  page,
  pageSize,
  loading,
  visibleColumns,
  columnConfig,
  onPageChange,
  onPageSizeChange,
}: TripLedgerTableProps) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : page * pageSize + 1;
  const rangeEnd = Math.min((page + 1) * pageSize, total);

  const activeCols = useMemo(
    () => mergeTripLedgerActiveColumns(visibleColumns, columnConfig),
    [visibleColumns, columnConfig]
  );

  // Sort trips client-side
  const sortedTrips = useMemo(() => {
    if (!sortKey || !sortDir) return trips;
    return [...trips].sort((a, b) =>
      compareValues(getSortValue(a, sortKey), getSortValue(b, sortKey), sortDir)
    );
  }, [trips, sortKey, sortDir]);

  // Cycle sort: none → asc → desc → none
  const handleSort = useCallback((key: string) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir('asc');
    } else if (sortDir === 'asc') {
      setSortDir('desc');
    } else {
      setSortKey(null);
      setSortDir(null);
    }
  }, [sortKey, sortDir]);

  const handleCopyId = useCallback((id: string) => {
    navigator.clipboard.writeText(id).then(() => {
      toast.success('Trip ID copied');
    }).catch(() => {
      toast.error('Failed to copy ID');
    });
  }, []);

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  }, []);

  return (
    <div className="flex flex-col">
      {/* Large dataset warning */}
      {total > 5000 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-2.5 mb-3">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-300">
            <span className="font-medium">{total.toLocaleString()} trips</span> match your filters. Consider narrowing by date range, platform, or driver name for faster performance.
          </p>
        </div>
      )}

      {/* Table container with horizontal scroll */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
          {/* Sticky header */}
          <thead className="bg-slate-50 dark:bg-slate-800/60 sticky top-0 z-10">
            <tr>
              {activeCols.map(col => {
                const isSorted = sortKey === col.key;
                const currentDir: SortDir = isSorted ? sortDir : null;
                const canSort = col.sortable !== false;
                return (
                  <th
                    key={col.key}
                    className={`px-3 py-3 text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider whitespace-nowrap group/th ${col.align === 'right' ? 'text-right' : 'text-left'} ${canSort ? 'cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors' : ''}`}
                    style={col.minWidth ? { minWidth: col.minWidth } : undefined}
                    onClick={canSort ? () => handleSort(col.key) : undefined}
                    title={canSort ? `Sort by ${col.label}` : undefined}
                  >
                    <span className={`inline-flex items-center gap-1 ${col.align === 'right' ? 'flex-row-reverse' : ''}`}>
                      {col.label}
                      {canSort && <SortIcon dir={currentDir} />}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
            {/* Loading state */}
            {loading && trips.length === 0 && (
              Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={`skel-${i}`} colCount={activeCols.length} />)
            )}

            {/* Empty state */}
            {!loading && trips.length === 0 && (
              <tr>
                <td colSpan={activeCols.length} className="px-6 py-16 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <div className="text-slate-400 dark:text-slate-500 text-lg font-medium">No trips found</div>
                    <p className="text-sm text-slate-400 dark:text-slate-500">There are no trip records to display. Import trip data to get started.</p>
                  </div>
                </td>
              </tr>
            )}

            {/* Data rows */}
            {sortedTrips.map((trip, idx) => (
              <DataRow
                key={trip.id || `row-${idx}`}
                trip={trip}
                idx={idx}
                activeCols={activeCols}
                loading={loading}
                isExpanded={expandedId === trip.id}
                columnConfig={columnConfig}
                onToggleExpand={handleToggleExpand}
                onCopyId={handleCopyId}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-1 py-3 mt-2">
        {/* Left: range info */}
        <div className="text-sm text-slate-500 dark:text-slate-400">
          {total === 0
            ? 'No records'
            : `Showing ${rangeStart}–${rangeEnd} of ${total.toLocaleString()} trips`}
        </div>

        {/* Right: controls */}
        <div className="flex items-center gap-3">
          {/* Page size selector */}
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-slate-500 dark:text-slate-400">Rows:</label>
            <select
              value={pageSize}
              onChange={e => onPageSizeChange(Number(e.target.value))}
              className="text-xs border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          {/* Page info */}
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Page {total === 0 ? 0 : page + 1} of {totalPages}
          </span>

          {/* Prev / Next */}
          <div className="flex gap-1">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page === 0 || loading}
              className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages - 1 || loading}
              className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
