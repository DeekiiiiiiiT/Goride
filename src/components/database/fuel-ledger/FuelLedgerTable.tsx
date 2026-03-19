import React, { useState, useMemo, useCallback } from 'react';
import { FuelEntry } from '../../../types/fuel';
import { Copy, ChevronLeft, ChevronRight, Flag, ChevronUp, ChevronDown, ChevronsUpDown, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner@2.0.3';

// ── Column definition type ──────────────────────────────────────────────────

export interface ColumnDef {
  key: string;
  label: string;
  defaultVisible: boolean;
  group: 'core' | 'audit' | 'meta';
}

export interface RenderColumnDef extends ColumnDef {
  render: (entry: FuelEntry) => React.ReactNode;
  align?: 'left' | 'right';
  minWidth?: string;
  sortable?: boolean;
}

// ── Sort types ──────────────────────────────────────────────────────────────

export type SortDir = 'asc' | 'desc' | null;

function SortIcon({ dir }: { dir: SortDir }) {
  if (dir === 'asc') return <ChevronUp className="h-3 w-3 text-amber-600 dark:text-amber-400" />;
  if (dir === 'desc') return <ChevronDown className="h-3 w-3 text-amber-600 dark:text-amber-400" />;
  return <ChevronsUpDown className="h-3 w-3 opacity-0 group-hover/th:opacity-40 transition-opacity" />;
}

// ── Formatters ──────────────────────────────────────────────────────────────

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(iso: string | null | undefined, time?: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const datePart = d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    if (time) return `${datePart} ${time}`;
    return datePart;
  } catch {
    return iso;
  }
}

function truncateId(id: string | null | undefined): string {
  if (!id) return '—';
  return id.length > 8 ? '…' + id.slice(-8) : id;
}

function formatNumber(value: number | null | undefined, decimals = 1): string {
  if (value == null) return '—';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// ── Payment source display label ────────────────────────────────────────────

const PAYMENT_SOURCE_LABELS: Record<string, string> = {
  RideShare_Cash: 'RideShare Cash',
  Gas_Card: 'Gas Card',
  Personal: 'Personal',
  Petty_Cash: 'Petty Cash',
};

function getPaymentSourceLabel(source: string | undefined): string {
  if (!source) return '—';
  return PAYMENT_SOURCE_LABELS[source] || source;
}

// ── Badge color maps ────────────────────────────────────────────────────────

const ENTRY_MODE_COLORS: Record<string, string> = {
  Anchor: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  Floating: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

const TYPE_COLORS: Record<string, string> = {
  Card_Transaction: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  Manual_Entry: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  Fuel_Manual_Entry: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  Reimbursement: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
};

const TYPE_LABELS: Record<string, string> = {
  Card_Transaction: 'Card Txn',
  Manual_Entry: 'Manual',
  Fuel_Manual_Entry: 'Fuel Manual',
  Reimbursement: 'Reimburse',
};

const AUDIT_STATUS_COLORS: Record<string, string> = {
  Clear: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  Observing: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  Flagged: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  'Auto-Resolved': 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
};

const SOURCE_COLORS: Record<string, string> = {
  'driver-portal': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  'admin-manual': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
  'admin-edit': 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  'bulk-import': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  'fuel-card': 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
};

const SOURCE_LABELS: Record<string, string> = {
  'driver-portal': 'Driver Portal',
  'admin-manual': 'Admin Manual',
  'admin-edit': 'Admin Edit',
  'bulk-import': 'Bulk Import',
  'fuel-card': 'Fuel Card',
};

const RECON_STATUS_COLORS: Record<string, string> = {
  Pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  Verified: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  Flagged: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  Observing: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  Archived: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

function renderBadge(value: string | undefined, colorMap: Record<string, string>, labelMap?: Record<string, string>): React.ReactNode {
  if (!value) return '—';
  const cls = colorMap[value] || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
  const label = labelMap ? (labelMap[value] || value) : value;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{label}</span>;
}

// ── Column definitions ──────────────────────────────────────────────────────

export const ALL_COLUMNS: RenderColumnDef[] = [
  // ── Core Fields (10, default-visible) ──
  {
    key: 'id',
    label: 'Entry ID',
    defaultVisible: true,
    group: 'core',
    render: (e) => truncateId(e.id),
    minWidth: '100px',
    sortable: true,
  },
  {
    key: 'date',
    label: 'Date',
    defaultVisible: true,
    group: 'core',
    render: (e) => formatDate(e.date, e.time),
    minWidth: '150px',
    sortable: true,
  },
  {
    key: 'vehicleId',
    label: 'Vehicle',
    defaultVisible: true,
    group: 'core',
    render: (e) => e.vehicleId ? truncateId(e.vehicleId) : '—',
    minWidth: '100px',
    sortable: true,
  },
  {
    key: 'driverId',
    label: 'Driver',
    defaultVisible: true,
    group: 'core',
    render: (e) => e.driverId ? truncateId(e.driverId) : '—',
    minWidth: '100px',
    sortable: true,
  },
  {
    key: 'amount',
    label: 'Cost ($)',
    defaultVisible: true,
    group: 'core',
    render: (e) => formatCurrency(e.amount),
    align: 'right',
    sortable: true,
  },
  {
    key: 'liters',
    label: 'Liters',
    defaultVisible: true,
    group: 'core',
    render: (e) => e.liters != null ? `${formatNumber(e.liters, 1)} L` : '—',
    align: 'right',
    sortable: true,
  },
  {
    key: 'pricePerLiter',
    label: '$/Liter',
    defaultVisible: true,
    group: 'core',
    render: (e) => e.pricePerLiter != null ? `$${formatNumber(e.pricePerLiter, 2)}` : '—',
    align: 'right',
    sortable: true,
  },
  {
    key: 'odometer',
    label: 'Odometer',
    defaultVisible: true,
    group: 'core',
    render: (e) => e.odometer != null ? formatNumber(e.odometer, 0) : '—',
    align: 'right',
    sortable: true,
  },
  {
    key: 'location',
    label: 'Station',
    defaultVisible: true,
    group: 'core',
    render: (e) => e.location || e.stationAddress || '—',
    minWidth: '160px',
    sortable: true,
  },
  {
    key: 'paymentSource',
    label: 'Payment Source',
    defaultVisible: true,
    group: 'core',
    render: (e) => getPaymentSourceLabel(e.paymentSource),
    sortable: true,
  },

  // ── Audit & Status Fields (4, default-visible) ──
  {
    key: 'entryMode',
    label: 'Entry Mode',
    defaultVisible: true,
    group: 'audit',
    render: (e) => renderBadge(e.entryMode, ENTRY_MODE_COLORS),
    sortable: true,
  },
  {
    key: 'type',
    label: 'Type',
    defaultVisible: true,
    group: 'audit',
    render: (e) => renderBadge(e.type, TYPE_COLORS, TYPE_LABELS),
    sortable: true,
  },
  {
    key: 'auditStatus',
    label: 'Audit Status',
    defaultVisible: true,
    group: 'audit',
    render: (e) => renderBadge(e.auditStatus, AUDIT_STATUS_COLORS),
    sortable: true,
  },
  {
    key: 'entrySource',
    label: 'Entry Source',
    defaultVisible: true,
    group: 'audit',
    render: (e) => renderBadge(e.entrySource, SOURCE_COLORS, SOURCE_LABELS),
    sortable: true,
  },

  // ── Metadata Fields (8, default NOT visible) ──
  {
    key: 'isFullTank',
    label: 'Full Tank?',
    defaultVisible: false,
    group: 'meta',
    render: (e) => {
      const val = (e as any).isFullTank;
      if (val == null) return '—';
      return val ? 'Yes' : 'No';
    },
    sortable: true,
  },
  {
    key: 'isFlagged',
    label: 'Flagged?',
    defaultVisible: false,
    group: 'meta',
    render: (e) => {
      if (!e.isFlagged) return '—';
      return (
        <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 text-xs font-medium">
          <Flag className="h-3 w-3" />
          Yes
        </span>
      );
    },
    sortable: true,
  },
  {
    key: 'transactionId',
    label: 'Linked Txn ID',
    defaultVisible: false,
    group: 'meta',
    render: (e) => truncateId(e.transactionId),
    minWidth: '100px',
    sortable: true,
  },
  {
    key: 'matchedStationId',
    label: 'Matched Station',
    defaultVisible: false,
    group: 'meta',
    render: (e) => truncateId(e.matchedStationId),
    minWidth: '100px',
    sortable: true,
  },
  {
    key: 'reconciliationStatus',
    label: 'Reconciliation',
    defaultVisible: false,
    group: 'meta',
    render: (e) => renderBadge(e.reconciliationStatus, RECON_STATUS_COLORS),
    sortable: true,
  },
  {
    key: 'anchorPeriodId',
    label: 'Anchor Period',
    defaultVisible: false,
    group: 'meta',
    render: (e) => e.anchorPeriodId ? <span className="font-mono text-xs">{truncateId(e.anchorPeriodId)}</span> : '—',
    minWidth: '100px',
    sortable: true,
  },
  {
    key: 'volumeContributed',
    label: 'Vol. Contributed',
    defaultVisible: false,
    group: 'meta',
    render: (e) => e.volumeContributed != null ? `${formatNumber(e.volumeContributed, 1)} L` : '—',
    align: 'right',
    sortable: true,
  },
  {
    key: 'geolocation',
    label: 'Geolocation',
    defaultVisible: false,
    group: 'meta',
    render: (e) => {
      const loc = e.locationMetadata;
      if (!loc || loc.lat == null || loc.lng == null) return '—';
      return <span className="font-mono text-xs">{loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}</span>;
    },
    minWidth: '140px',
    sortable: false,
  },
];

export const DEFAULT_VISIBLE_KEYS = ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key);

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

// ── Detail Panel ────────────────────────────────────────────────────────────

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-medium">{label}</span>
      <span className="text-sm text-slate-700 dark:text-slate-300">{value || '—'}</span>
    </div>
  );
}

function CopyField({ label, value }: { label: string; value: string | undefined }) {
  const handleCopy = () => {
    if (!value) return;
    navigator.clipboard
      .writeText(value)
      .then(() => toast.success(`${label} copied`))
      .catch(() => toast.error('Failed to copy'));
  };
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-medium">{label}</span>
      {value ? (
        <button
          onClick={(e) => { e.stopPropagation(); handleCopy(); }}
          className="inline-flex items-center gap-1 text-sm font-mono text-slate-700 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 transition-colors text-left"
          title={`Click to copy: ${value}`}
        >
          <span className="truncate max-w-[200px]">{value}</span>
          <Copy className="h-3 w-3 shrink-0 opacity-60" />
        </button>
      ) : (
        <span className="text-sm text-slate-700 dark:text-slate-300">—</span>
      )}
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div className="col-span-full border-t border-slate-200 dark:border-slate-700 pt-3 mt-1">
      <h5 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</h5>
    </div>
  );
}

function FuelDetailPanel({ entry, colSpan }: { entry: FuelEntry; colSpan: number }) {
  const loc = entry.locationMetadata;
  const geo = entry.geofenceMetadata;
  const meta = entry.metadata;

  // Collect extra metadata keys not explicitly rendered
  const knownMetaKeys = new Set([
    'isEdited', 'lastEditedAt', 'editReason',
    'isDebit', 'isCredit',
    'observationReason', 'observationStartedAt', 'expectedAnchorDate',
    'predictedEconomy', 'varianceFromBaseline',
  ]);
  const extraMetaEntries: [string, any][] = [];
  if (meta) {
    for (const [k, v] of Object.entries(meta)) {
      if (!knownMetaKeys.has(k) && v != null && v !== '') {
        extraMetaEntries.push([k, v]);
      }
    }
  }

  return (
    <tr>
      <td colSpan={colSpan} className="p-0">
        <div className="bg-slate-50 dark:bg-slate-800/50 border-l-4 border-l-amber-400 dark:border-l-amber-500 border-t border-b border-slate-200 dark:border-slate-700 px-6 py-4">
          {/* Title */}
          <div className="flex items-center gap-2 mb-3">
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Fuel Entry Details</h4>
            <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">{entry.id}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
            {/* ── Section 1: Core Information ── */}
            <SectionTitle title="Core Information" />
            <CopyField label="Entry ID" value={entry.id} />
            <DetailField label="Date & Time" value={formatDate(entry.date, entry.time)} />
            <DetailField label="Vehicle ID" value={entry.vehicleId} />
            <DetailField label="Driver ID" value={entry.driverId} />
            <DetailField label="Entry Source" value={
              entry.entrySource
                ? renderBadge(entry.entrySource, SOURCE_COLORS, SOURCE_LABELS)
                : undefined
            } />

            {/* ── Section 2: Fuel Details ── */}
            <SectionTitle title="Fuel Details" />
            <DetailField label="Amount (Cost)" value={formatCurrency(entry.amount)} />
            <DetailField label="Liters (Volume)" value={entry.liters != null ? `${formatNumber(entry.liters, 1)} L` : undefined} />
            <DetailField label="Price per Liter" value={entry.pricePerLiter != null ? `$${formatNumber(entry.pricePerLiter, 3)}` : undefined} />
            <DetailField label="Full Tank?" value={(entry as any).isFullTank != null ? ((entry as any).isFullTank ? 'Yes' : 'No') : undefined} />
            <DetailField label="Payment Source" value={getPaymentSourceLabel(entry.paymentSource)} />
            <DetailField label="Entry Mode" value={renderBadge(entry.entryMode, ENTRY_MODE_COLORS)} />
            <DetailField label="Type" value={renderBadge(entry.type, TYPE_COLORS, TYPE_LABELS)} />

            {/* ── Section 3: Location ── */}
            <SectionTitle title="Location" />
            <DetailField label="Station" value={entry.location} />
            <DetailField label="Station Address" value={entry.stationAddress} />
            <DetailField label="Matched Station ID" value={entry.matchedStationId} />
            <DetailField label="Geolocation" value={
              loc && loc.lat != null && loc.lng != null
                ? <span className="font-mono text-xs">{loc.lat.toFixed(6)}, {loc.lng.toFixed(6)}</span>
                : undefined
            } />
            <DetailField label="Geofence Status" value={
              geo
                ? `${geo.isInside ? 'Inside' : 'Outside'} (${geo.distanceMeters}m)`
                : undefined
            } />
            <DetailField label="Location Status" value={entry.locationStatus} />
            <DetailField label="Deviation Reason" value={entry.deviationReason} />

            {/* ── Section 4: Odometer & Efficiency ── */}
            <SectionTitle title="Odometer & Efficiency" />
            <DetailField label="Odometer Reading" value={entry.odometer != null ? formatNumber(entry.odometer, 0) : undefined} />
            <DetailField label="Odometer Image" value={
              entry.odometerImageUrl
                ? <a href={entry.odometerImageUrl} target="_blank" rel="noopener noreferrer" className="text-amber-600 dark:text-amber-400 hover:underline text-xs truncate max-w-[200px] inline-block">View Image</a>
                : undefined
            } />
            <DetailField label="Anchor Period ID" value={entry.anchorPeriodId ? <span className="font-mono text-xs">{entry.anchorPeriodId}</span> : undefined} />
            <DetailField label="Volume Contributed" value={entry.volumeContributed != null ? `${formatNumber(entry.volumeContributed, 1)} L` : undefined} />
            <DetailField label="Is Carryover?" value={entry.isCarryover != null ? (entry.isCarryover ? 'Yes' : 'No') : undefined} />
            <DetailField label="Carryover Volume" value={entry.carryoverVolume != null ? `${formatNumber(entry.carryoverVolume, 1)} L` : undefined} />

            {/* ── Section 5: Audit & Reconciliation ── */}
            <SectionTitle title="Audit & Reconciliation" />
            <DetailField label="Audit Status" value={renderBadge(entry.auditStatus, AUDIT_STATUS_COLORS)} />
            <DetailField label="Flagged?" value={
              entry.isFlagged
                ? <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 text-xs font-medium"><Flag className="h-3 w-3" />Yes</span>
                : entry.isFlagged === false ? 'No' : undefined
            } />
            <DetailField label="Reconciliation Status" value={renderBadge(entry.reconciliationStatus, RECON_STATUS_COLORS)} />
            <CopyField label="Linked Transaction ID" value={entry.transactionId} />

            {/* ── Section 6: Metadata ── */}
            {meta && (
              <>
                <SectionTitle title="Metadata" />
                <DetailField label="Is Edited?" value={meta.isEdited != null ? (meta.isEdited ? 'Yes' : 'No') : undefined} />
                <DetailField label="Last Edited At" value={meta.lastEditedAt} />
                <DetailField label="Edit Reason" value={meta.editReason} />
                <DetailField label="Observation Reason" value={meta.observationReason} />
                <DetailField label="Observation Started At" value={meta.observationStartedAt} />
                <DetailField label="Expected Anchor Date" value={meta.expectedAnchorDate} />
                <DetailField label="Predicted Economy" value={meta.predictedEconomy != null ? `${formatNumber(meta.predictedEconomy, 2)} km/L` : undefined} />
                <DetailField label="Variance from Baseline" value={meta.varianceFromBaseline != null ? `${formatNumber(meta.varianceFromBaseline, 1)}%` : undefined} />
                {extraMetaEntries.map(([k, v]) => (
                  <DetailField key={k} label={k} value={typeof v === 'object' ? JSON.stringify(v) : String(v)} />
                ))}
              </>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── Memoized Data Row ───────────────────────────────────────────────────────

interface FuelDataRowProps {
  entry: FuelEntry;
  idx: number;
  activeCols: RenderColumnDef[];
  loading: boolean;
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
  onCopyId: (id: string) => void;
}

const FuelDataRow = React.memo(function FuelDataRow({
  entry,
  idx,
  activeCols,
  loading,
  isExpanded,
  onToggleExpand,
  onCopyId,
}: FuelDataRowProps) {
  return (
    <>
      <tr
        onClick={() => onToggleExpand(entry.id)}
        className={`group transition-colors cursor-pointer ${
          isExpanded
            ? 'bg-amber-50/50 dark:bg-amber-950/20'
            : idx % 2 === 1
              ? 'bg-slate-50/50 dark:bg-slate-800/20'
              : ''
        } hover:bg-slate-50 dark:hover:bg-slate-800/40 ${loading ? 'opacity-50' : ''}`}
      >
        {activeCols.map((col) => {
          // Special handling for ID column (copy-to-clipboard)
          if (col.key === 'id') {
            return (
              <td key={col.key} className="px-3 py-2.5 whitespace-nowrap">
                <button
                  onClick={(e) => { e.stopPropagation(); onCopyId(entry.id); }}
                  className="inline-flex items-center gap-1 text-xs font-mono text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                  title={`Click to copy: ${entry.id}`}
                >
                  {col.render(entry)}
                  <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100" />
                </button>
              </td>
            );
          }

          const isAmount = col.key === 'amount';
          return (
            <td
              key={col.key}
              className={`px-3 py-2.5 whitespace-nowrap text-sm tabular-nums ${
                col.align === 'right' ? 'text-right' : 'text-left'
              } ${
                isAmount
                  ? 'font-medium text-slate-800 dark:text-slate-200'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
              style={col.minWidth ? { minWidth: col.minWidth } : undefined}
            >
              {col.render(entry)}
            </td>
          );
        })}
      </tr>
      {isExpanded && <FuelDetailPanel entry={entry} colSpan={activeCols.length} />}
    </>
  );
});

// ── Main Component ──────────────────────────────────────────────────────────

interface FuelLedgerTableProps {
  entries: FuelEntry[];
  loading: boolean;
  visibleColumns: string[];
  page: number;
  pageSize: number;
  totalFiltered: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  sortKey: string | null;
  sortDir: SortDir;
  onSort: (key: string) => void;
}

export function FuelLedgerTable({
  entries,
  loading,
  visibleColumns,
  page,
  pageSize,
  totalFiltered,
  onPageChange,
  onPageSizeChange,
  sortKey,
  sortDir,
  onSort,
}: FuelLedgerTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const rangeStart = totalFiltered === 0 ? 0 : page * pageSize + 1;
  const rangeEnd = Math.min((page + 1) * pageSize, totalFiltered);

  // Filter columns to only visible ones, preserving order from ALL_COLUMNS
  const activeCols = useMemo(
    () => ALL_COLUMNS.filter((c) => visibleColumns.includes(c.key)),
    [visibleColumns]
  );

  const handleCopyId = useCallback((id: string) => {
    navigator.clipboard
      .writeText(id)
      .then(() => toast.success('Entry ID copied'))
      .catch(() => toast.error('Failed to copy ID'));
  }, []);

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <div className="flex flex-col">
      {/* Large dataset warning */}
      {totalFiltered > 5000 && (
        <div className="flex items-center gap-2 px-4 py-2.5 mb-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            Large dataset: <strong>{totalFiltered.toLocaleString()}</strong> entries loaded.
            Consider using filters to narrow results for better performance.
          </span>
        </div>
      )}

      {/* Table container with horizontal scroll */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
          {/* Header */}
          <thead className="bg-slate-50 dark:bg-slate-800/60 sticky top-0 z-10">
            <tr>
              {activeCols.map((col) => {
                const isSorted = sortKey === col.key;
                const currentDir: SortDir = isSorted ? sortDir : null;
                const canSort = col.sortable !== false;
                return (
                  <th
                    key={col.key}
                    className={`px-3 py-3 text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider whitespace-nowrap group/th ${
                      col.align === 'right' ? 'text-right' : 'text-left'
                    } ${canSort ? 'cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors' : ''}`}
                    style={col.minWidth ? { minWidth: col.minWidth } : undefined}
                    onClick={canSort ? () => onSort(col.key) : undefined}
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
            {loading && entries.length === 0 &&
              Array.from({ length: 8 }).map((_, i) => (
                <SkeletonRow key={`skel-${i}`} colCount={activeCols.length} />
              ))}

            {/* Empty state */}
            {!loading && entries.length === 0 && (
              <tr>
                <td colSpan={activeCols.length} className="px-6 py-16 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <div className="text-slate-400 dark:text-slate-500 text-lg font-medium">
                      No fuel entries found
                    </div>
                    <p className="text-sm text-slate-400 dark:text-slate-500">
                      There are no fuel records to display. Import fuel data to get started.
                    </p>
                  </div>
                </td>
              </tr>
            )}

            {/* Data rows */}
            {entries.map((entry, idx) => (
              <FuelDataRow
                key={entry.id || `row-${idx}`}
                entry={entry}
                idx={idx}
                activeCols={activeCols}
                loading={loading}
                isExpanded={expandedId === entry.id}
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
          {totalFiltered === 0
            ? 'No records'
            : `Showing ${rangeStart}–${rangeEnd} of ${totalFiltered.toLocaleString()} fuel entries`}
        </div>

        {/* Right: controls */}
        <div className="flex items-center gap-3">
          {/* Page size selector */}
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-slate-500 dark:text-slate-400">Rows:</label>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="text-xs border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          {/* Page info */}
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Page {totalFiltered === 0 ? 0 : page + 1} of {totalPages}
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
