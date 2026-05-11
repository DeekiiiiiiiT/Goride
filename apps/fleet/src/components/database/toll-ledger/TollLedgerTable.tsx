import React, { useState, useCallback } from 'react';
import { TollLedgerEntry } from '../../../types/toll-ledger';
import {
  Copy,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner@2.0.3';

// ── Column definition type ──────────────────────────────────────────────────

export interface ColumnDef {
  key: string;
  label: string;
  defaultVisible: boolean;
  group: 'core' | 'reconciliation' | 'financial' | 'meta';
}

export interface RenderColumnDef extends ColumnDef {
  render: (entry: TollLedgerEntry) => React.ReactNode;
  align?: 'left' | 'right';
  minWidth?: string;
  sortable?: boolean;
}

// ── Sort types ──────────────────────────────────────────────────────────────

export type SortDir = 'asc' | 'desc' | null;

function SortIcon({ dir }: { dir: SortDir }) {
  if (dir === 'asc') return <ChevronUp className="h-3 w-3 text-rose-600 dark:text-rose-400" />;
  if (dir === 'desc') return <ChevronDown className="h-3 w-3 text-rose-600 dark:text-rose-400" />;
  return <ChevronsUpDown className="h-3 w-3 opacity-0 group-hover/th:opacity-40 transition-opacity" />;
}

// ── Formatters ──────────────────────────────────────────────────────────────

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '\u2014';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Format toll date for display. Date-only strings (YYYY-MM-DD) must be parsed as
 * local calendar dates — `new Date('2026-01-04')` is UTC midnight and shows as
 * Jan 3 in Jamaica (UTC-5), while filters still use the string 2026-01-04.
 */
function formatDate(iso: string | null | undefined, time?: string | null): string {
  if (!iso) return '\u2014';
  const s = iso.trim();
  try {
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(s);

    if (isDateOnly) {
      const [y, m, day] = s.split('-').map(Number);
      const t = time?.trim();
      const hasTime = t && /^\d{1,2}:\d{2}/.test(t);
      let d: Date;
      if (hasTime) {
        const parts = t.split(':').map((p) => parseInt(p, 10));
        const hh = parts[0] ?? 0;
        const mm = parts[1] ?? 0;
        const ss = parts[2] ?? 0;
        d = new Date(y, m - 1, day, hh, mm, ss);
      } else {
        d = new Date(y, m - 1, day);
      }
      if (isNaN(d.getTime())) return iso;
      if (hasTime) {
        return d.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });
      }
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }

    const d = new Date(s);
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
  if (!id) return '\u2014';
  return id.length > 8 ? '\u2026' + id.slice(-8) : id;
}

// ── Badge color maps ────────────────────────────────────────────────────────

const RECON_STATUS_COLORS: Record<string, string> = {
  Matched: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  Unmatched: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  Dismissed: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  Approved: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
};

const TOLL_TYPE_COLORS: Record<string, string> = {
  'Toll Usage': 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
  'Top-Up': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  Deduction: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
};

const STATUS_COLORS: Record<string, string> = {
  Approved: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  Pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  Rejected: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  Reconciled: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
};

function renderBadge(
  value: string | undefined,
  colorMap: Record<string, string>,
  labelMap?: Record<string, string>,
): React.ReactNode {
  if (!value) return '\u2014';
  const cls =
    colorMap[value] ||
    'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
  const label = labelMap ? labelMap[value] || value : value;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}
    >
      {label}
    </span>
  );
}

// ── Column definitions (22 columns across 4 groups) ────────────────────────

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
    key: 'vehiclePlate',
    label: 'Vehicle',
    defaultVisible: true,
    group: 'core',
    render: (e) => e.vehiclePlate || (e.vehicleId ? truncateId(e.vehicleId) : '\u2014'),
    minWidth: '100px',
    sortable: true,
  },
  {
    key: 'driverName',
    label: 'Driver',
    defaultVisible: true,
    group: 'core',
    render: (e) => e.driverName || (e.driverId ? truncateId(e.driverId) : '\u2014'),
    minWidth: '120px',
    sortable: true,
  },
  {
    key: 'plaza',
    label: 'Plaza / Location',
    defaultVisible: true,
    group: 'core',
    render: (e) =>
      e.plaza ? (
        <span title={e.plaza}>
          {e.plaza.length > 30 ? e.plaza.substring(0, 30) + '\u2026' : e.plaza}
        </span>
      ) : (
        '\u2014'
      ),
    minWidth: '160px',
    sortable: true,
  },
  {
    key: 'amount',
    label: 'Amount',
    defaultVisible: true,
    group: 'core',
    render: (e) => formatCurrency(e.amount),
    align: 'right',
    minWidth: '100px',
    sortable: true,
  },
  {
    key: 'type',
    label: 'Type',
    defaultVisible: true,
    group: 'core',
    render: (e) => renderBadge(e.type, TOLL_TYPE_COLORS),
    minWidth: '100px',
    sortable: true,
  },
  {
    key: 'reconciliationStatus',
    label: 'Recon Status',
    defaultVisible: true,
    group: 'core',
    render: (e) => renderBadge(e.reconciliationStatus, RECON_STATUS_COLORS),
    minWidth: '120px',
    sortable: true,
  },
  {
    key: 'status',
    label: 'Status',
    defaultVisible: true,
    group: 'core',
    render: (e) => renderBadge(e.status, STATUS_COLORS),
    minWidth: '90px',
    sortable: true,
  },
  {
    key: 'paymentMethod',
    label: 'Payment Method',
    defaultVisible: true,
    group: 'core',
    render: (e) => e.paymentMethod || '\u2014',
    minWidth: '120px',
    sortable: true,
  },

  // ── Reconciliation (5, default NOT visible) ──
  {
    key: 'matchedTripId',
    label: 'Matched Trip ID',
    defaultVisible: false,
    group: 'reconciliation',
    render: (e) => truncateId(e.matchedTripId),
    minWidth: '110px',
    sortable: true,
  },
  {
    key: 'matchedTripPlatform',
    label: 'Trip Platform',
    defaultVisible: false,
    group: 'reconciliation',
    render: (e) => e.matchedTripPlatform || '\u2014',
    minWidth: '110px',
    sortable: true,
  },
  {
    key: 'matchedTripPickup',
    label: 'Trip Pickup',
    defaultVisible: false,
    group: 'reconciliation',
    render: (e) =>
      e.matchedTripPickup ? (
        <span title={e.matchedTripPickup}>
          {e.matchedTripPickup.length > 30
            ? e.matchedTripPickup.substring(0, 30) + '\u2026'
            : e.matchedTripPickup}
        </span>
      ) : (
        '\u2014'
      ),
    minWidth: '140px',
    sortable: true,
  },
  {
    key: 'matchedTripDropoff',
    label: 'Trip Dropoff',
    defaultVisible: false,
    group: 'reconciliation',
    render: (e) =>
      e.matchedTripDropoff ? (
        <span title={e.matchedTripDropoff}>
          {e.matchedTripDropoff.length > 30
            ? e.matchedTripDropoff.substring(0, 30) + '\u2026'
            : e.matchedTripDropoff}
        </span>
      ) : (
        '\u2014'
      ),
    minWidth: '140px',
    sortable: true,
  },
  {
    key: 'resolution',
    label: 'Resolution',
    defaultVisible: false,
    group: 'reconciliation',
    render: (e) => e.resolution || '\u2014',
    minWidth: '120px',
    sortable: true,
  },

  // ── Financial (4, default NOT visible) ──
  {
    key: 'absAmount',
    label: 'Abs Amount',
    defaultVisible: false,
    group: 'financial',
    render: (e) => formatCurrency(e.absAmount),
    align: 'right',
    minWidth: '100px',
    sortable: true,
  },
  {
    key: 'tripTollCharges',
    label: 'Trip Toll Charges',
    defaultVisible: false,
    group: 'financial',
    render: (e) => {
      const v = typeof e.tripTollCharges === 'number' ? e.tripTollCharges : 0;
      return v ? formatCurrency(v) : '\u2014';
    },
    align: 'right',
    minWidth: '120px',
    sortable: true,
  },
  {
    key: 'refundAmount',
    label: 'Refund Amount',
    defaultVisible: false,
    group: 'financial',
    render: (e) => {
      const v = typeof e.refundAmount === 'number' ? e.refundAmount : 0;
      return v ? (
        <span className="text-green-600 dark:text-green-400">{formatCurrency(v)}</span>
      ) : (
        '\u2014'
      );
    },
    align: 'right',
    minWidth: '110px',
    sortable: true,
  },
  {
    key: 'lossAmount',
    label: 'Loss Amount',
    defaultVisible: false,
    group: 'financial',
    render: (e) => {
      const v = typeof e.lossAmount === 'number' ? e.lossAmount : 0;
      return v > 0 ? (
        <span className="text-red-600 dark:text-red-400 font-medium">{formatCurrency(v)}</span>
      ) : v ? (
        formatCurrency(v)
      ) : (
        '\u2014'
      );
    },
    align: 'right',
    minWidth: '110px',
    sortable: true,
  },

  // ── Metadata (3, default NOT visible) ──
  {
    key: 'referenceTagId',
    label: 'Tag ID',
    defaultVisible: false,
    group: 'meta',
    render: (e) => truncateId(e.referenceTagId),
    minWidth: '100px',
    sortable: true,
  },
  {
    key: 'batchId',
    label: 'Batch ID',
    defaultVisible: false,
    group: 'meta',
    render: (e) => truncateId(e.batchId),
    minWidth: '100px',
    sortable: true,
  },
  {
    key: 'description',
    label: 'Description',
    defaultVisible: false,
    group: 'meta',
    render: (e) =>
      e.description ? (
        <span title={e.description}>
          {e.description.length > 40
            ? e.description.substring(0, 40) + '\u2026'
            : e.description}
        </span>
      ) : (
        '\u2014'
      ),
    minWidth: '160px',
    sortable: false,
  },
];

export const DEFAULT_VISIBLE_KEYS = ALL_COLUMNS.filter((c) => c.defaultVisible).map(
  (c) => c.key,
);

// ── Detail panel helper components ──────────────────────────────────────────

function copyToClipboard(text: string, e?: React.MouseEvent) {
  if (e) e.stopPropagation();
  navigator.clipboard.writeText(text).then(
    () => toast.success('Copied to clipboard'),
    () => toast.error('Failed to copy'),
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div className="col-span-full border-t border-slate-200 dark:border-slate-700 pt-3 mt-1">
      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {title}
      </h4>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-800 dark:text-slate-200 break-words">
        {value || '\u2014'}
      </dd>
    </div>
  );
}

function CopyField({ label, value }: { label: string; value: string | null | undefined }) {
  const display = value || '\u2014';
  return (
    <div className="space-y-0.5">
      <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-800 dark:text-slate-200 break-all">
        <span className="inline-flex items-center gap-1.5">
          <span className="font-mono text-xs">{display}</span>
          {value && (
            <button
              onClick={(e) => copyToClipboard(value, e)}
              className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              title="Copy"
            >
              <Copy className="h-3 w-3 text-slate-400" />
            </button>
          )}
        </span>
      </dd>
    </div>
  );
}

// ── Detail panel ────────────────────────────────────────────────────────────

/** Context info banner colors/messages by reconciliation status */
const CONTEXT_BANNERS: Record<string, { bg: string; text: string; getMessage: (entry: TollLedgerEntry) => string }> = {
  Unmatched: {
    bg: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800',
    text: 'text-amber-800 dark:text-amber-300',
    getMessage: () => 'This toll charge has not been matched to any trip. Use the Toll Reconciliation page to review suggestions and match it.',
  },
  Matched: {
    bg: 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800',
    text: 'text-green-800 dark:text-green-300',
    getMessage: (e) => `This toll charge was matched to trip ${e.matchedTripId ? truncateId(e.matchedTripId) : '\u2014'}${e.reconciledAt ? ` on ${formatDate(e.reconciledAt)}` : ''}.`,
  },
  Dismissed: {
    bg: 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700',
    text: 'text-slate-700 dark:text-slate-300',
    getMessage: (e) => `This toll charge was dismissed.${e.resolution ? ` Resolution: ${e.resolution}.` : ''}`,
  },
  Approved: {
    bg: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800',
    text: 'text-blue-800 dark:text-blue-300',
    getMessage: () => 'This cash toll claim was approved for reimbursement.',
  },
};

function TollDetailPanel({ entry }: { entry: TollLedgerEntry }) {
  const isMatched = entry.reconciliationStatus === 'Matched';
  const isUnmatched = entry.reconciliationStatus === 'Unmatched';

  // Financial: net impact
  const netImpact = (entry.refundAmount || 0) - (entry.lossAmount || 0);

  // Suggestions: has any data?
  const hasSuggestionData =
    entry.hasSuggestions || entry.isAmbiguous || entry.suggestionCount > 0 || entry.topSuggestionTripId;

  return (
    <div className="border-l-4 border-l-rose-400 bg-slate-50/80 dark:bg-slate-800/40 px-5 py-4">
      {/* Context info banner */}
      {entry.reconciliationStatus && CONTEXT_BANNERS[entry.reconciliationStatus] && (() => {
        const banner = CONTEXT_BANNERS[entry.reconciliationStatus!];
        return (
          <div className={`rounded-md border px-3 py-2 mb-4 text-xs ${banner.bg} ${banner.text}`}>
            {banner.getMessage(entry)}
          </div>
        );
      })()}
      <dl className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
        {/* Section 1: Core Information */}
        <SectionTitle title="Core Information" />
        <CopyField label="Entry ID" value={entry.id} />
        <DetailField label="Date & Time" value={formatDate(entry.date, entry.time)} />
        <DetailField label="Vehicle" value={entry.vehiclePlate ? `${entry.vehiclePlate} (${entry.vehicleId || '\u2014'})` : entry.vehicleId || undefined} />
        <DetailField label="Driver" value={entry.driverName ? `${entry.driverName} (${entry.driverId || '\u2014'})` : entry.driverId || undefined} />
        <DetailField label="Status" value={renderBadge(entry.status, STATUS_COLORS)} />

        {/* Section 2: Toll Details */}
        <SectionTitle title="Toll Details" />
        <DetailField label="Plaza / Location" value={entry.plaza} />
        <DetailField label="Type" value={renderBadge(entry.type, TOLL_TYPE_COLORS)} />
        <DetailField label="Amount" value={formatCurrency(entry.amount)} />
        <DetailField label="Absolute Amount" value={formatCurrency(entry.absAmount)} />
        <DetailField label="Payment Method" value={entry.paymentMethod} />
        <DetailField label="Description" value={entry.description} />

        {/* Section 3: Financial Impact (Matched only) */}
        {isMatched && (
          <>
            <SectionTitle title="Financial Impact" />
            <DetailField label="Trip Toll Charges" value={entry.tripTollCharges ? formatCurrency(entry.tripTollCharges) : undefined} />
            <DetailField
              label="Refund Amount"
              value={
                entry.refundAmount ? (
                  <span className="text-green-600 dark:text-green-400 font-medium">
                    {formatCurrency(entry.refundAmount)}
                  </span>
                ) : undefined
              }
            />
            <DetailField
              label="Loss Amount"
              value={
                entry.lossAmount && entry.lossAmount > 0 ? (
                  <span className="text-red-600 dark:text-red-400 font-medium">
                    {formatCurrency(entry.lossAmount)}
                  </span>
                ) : entry.lossAmount ? (
                  formatCurrency(entry.lossAmount)
                ) : undefined
              }
            />
            <DetailField
              label="Net Impact"
              value={
                <span
                  className={`font-semibold ${
                    netImpact > 0
                      ? 'text-green-600 dark:text-green-400'
                      : netImpact < 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {formatCurrency(netImpact)}
                </span>
              }
            />
          </>
        )}

        {/* Section 4: Reconciliation Details */}
        <SectionTitle title="Reconciliation Details" />
        <DetailField label="Reconciliation Status" value={renderBadge(entry.reconciliationStatus, RECON_STATUS_COLORS)} />
        <DetailField label="Resolution" value={entry.resolution} />
        <DetailField label="Reconciled At" value={entry.reconciledAt ? formatDate(entry.reconciledAt) : undefined} />
        <DetailField label="Reconciled By" value={entry.reconciledBy} />

        {/* Section 5: Matched Trip (Matched only) */}
        {isMatched && entry.matchedTripId && (
          <>
            <SectionTitle title="Matched Trip" />
            <CopyField label="Matched Trip ID" value={entry.matchedTripId} />
            <DetailField label="Trip Date" value={entry.matchedTripDate ? formatDate(entry.matchedTripDate) : undefined} />
            <DetailField label="Trip Platform" value={entry.matchedTripPlatform} />
            <DetailField label="Trip Pickup" value={entry.matchedTripPickup} />
            <DetailField label="Trip Dropoff" value={entry.matchedTripDropoff} />
          </>
        )}

        {/* Section 6: Suggestions (Unmatched only) */}
        {isUnmatched && hasSuggestionData && (
          <>
            <SectionTitle title="Suggestions" />
            <DetailField label="Has Suggestions?" value={entry.hasSuggestions === 'true' || entry.hasSuggestions === 'Yes' ? 'Yes' : 'No'} />
            <DetailField label="Is Ambiguous?" value={entry.isAmbiguous === 'true' || entry.isAmbiguous === 'Yes' ? 'Yes' : 'No'} />
            <DetailField label="Top Suggestion Score" value={entry.topSuggestionScore != null ? String(entry.topSuggestionScore) : undefined} />
            <CopyField label="Top Suggestion Trip ID" value={entry.topSuggestionTripId} />
            <DetailField label="Suggestion Count" value={entry.suggestionCount != null ? String(entry.suggestionCount) : undefined} />
          </>
        )}

        {/* Section 7: Reference & Metadata */}
        <SectionTitle title="Reference & Metadata" />
        <CopyField label="Reference Tag ID" value={entry.referenceTagId} />
        <CopyField label="Batch ID" value={entry.batchId} />
      </dl>
    </div>
  );
}

// ── Skeleton row ────────────────────────────────────────────────────────────

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-3 py-2.5">
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
        </td>
      ))}
    </tr>
  );
}

// ── Memoized data row ───────────────────────────────────────────────────────

/** Left-border color by reconciliation status (only shown when NOT expanded) */
const ROW_BORDER_COLORS: Record<string, string> = {
  Matched: 'border-l-2 border-l-green-400',
  Unmatched: 'border-l-2 border-l-red-400',
  Dismissed: 'border-l-2 border-l-slate-300',
  Approved: 'border-l-2 border-l-blue-400',
};

interface TollDataRowProps {
  entry: TollLedgerEntry;
  idx: number;
  activeCols: RenderColumnDef[];
  loading: boolean;
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
  onCopyId: (id: string, e: React.MouseEvent) => void;
}

const TollDataRow = React.memo(function TollDataRow({
  entry,
  idx,
  activeCols,
  loading,
  isExpanded,
  onToggleExpand,
  onCopyId,
}: TollDataRowProps) {
  const handleClick = () => {
    if (entry.id) onToggleExpand(entry.id);
  };

  return (
    <>
      <tr
        onClick={handleClick}
        className={`cursor-pointer transition-colors ${
          isExpanded
            ? 'bg-rose-50/50 dark:bg-rose-950/20'
            : idx % 2 === 0
            ? 'bg-white dark:bg-slate-900'
            : 'bg-slate-50/50 dark:bg-slate-800/20'
        } hover:bg-rose-50/40 dark:hover:bg-rose-950/20 ${
          loading ? 'opacity-60' : ''
        } ${
          !isExpanded && entry.reconciliationStatus && ROW_BORDER_COLORS[entry.reconciliationStatus]
            ? ROW_BORDER_COLORS[entry.reconciliationStatus]
            : ''
        }`}
      >
        {activeCols.map((col) => (
          <td
            key={col.key}
            className={`px-3 py-2.5 whitespace-nowrap ${
              col.align === 'right' ? 'text-right' : 'text-left'
            }`}
          >
            {col.key === 'id' ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="font-mono text-xs text-slate-600 dark:text-slate-400">
                  {col.render(entry)}
                </span>
                {entry.id && (
                  <button
                    onClick={(e) => onCopyId(entry.id, e)}
                    className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    title="Copy full ID"
                  >
                    <Copy className="h-3 w-3 text-slate-400" />
                  </button>
                )}
              </span>
            ) : (
              col.render(entry)
            )}
          </td>
        ))}
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={activeCols.length} className="p-0">
            <TollDetailPanel entry={entry} />
          </td>
        </tr>
      )}
    </>
  );
});

// ── Main component ──────────────────────────────────────────────────────────

interface TollLedgerTableProps {
  entries: TollLedgerEntry[];
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

export function TollLedgerTable({
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
}: TollLedgerTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const activeCols = ALL_COLUMNS.filter((c) => visibleColumns.includes(c.key));

  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const showFrom = totalFiltered === 0 ? 0 : page * pageSize + 1;
  const showTo = Math.min((page + 1) * pageSize, totalFiltered);

  const handleCopyId = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id).then(
      () => toast.success('ID copied to clipboard'),
      () => toast.error('Failed to copy'),
    );
  }, []);

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <div className="space-y-2">
      {/* Large dataset warning */}
      {totalFiltered > 5000 && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            Large dataset: <strong>{totalFiltered.toLocaleString()}</strong> entries loaded.
            Consider using filters to narrow results for better performance.
          </span>
        </div>
      )}

      {/* Table wrapper */}
      <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                {activeCols.map((col) => {
                  const isSortable = col.sortable !== false;
                  const isActive = sortKey === col.key;
                  const dir: SortDir = isActive ? sortDir : null;
                  return (
                    <th
                      key={col.key}
                      className={`px-3 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap group/th ${
                        col.align === 'right' ? 'text-right' : 'text-left'
                      } text-slate-500 dark:text-slate-400${
                        isSortable
                          ? ' cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-700/50'
                          : ''
                      }`}
                      style={{ minWidth: col.minWidth }}
                      onClick={isSortable ? () => onSort(col.key) : undefined}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        {isSortable && <SortIcon dir={dir} />}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading && entries.length === 0 ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <SkeletonRow key={`sk-${i}`} cols={activeCols.length} />
                ))
              ) : entries.length === 0 ? (
                <tr>
                  <td
                    colSpan={activeCols.length}
                    className="px-6 py-16 text-center text-slate-500 dark:text-slate-400"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-4xl">{'\uD83D\uDCED'}</span>
                      <span className="text-base font-medium">
                        No toll transactions found
                      </span>
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        Try adjusting your filters or import toll data first
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                entries.map((entry, idx) => (
                  <TollDataRow
                    key={entry.id || idx}
                    entry={entry}
                    idx={idx}
                    activeCols={activeCols}
                    loading={loading}
                    isExpanded={expandedId === entry.id}
                    onToggleExpand={handleToggleExpand}
                    onCopyId={handleCopyId}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-1 text-sm text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-3">
          <span>
            {totalFiltered > 0
              ? `${showFrom.toLocaleString()}\u2013${showTo.toLocaleString()} of ${totalFiltered.toLocaleString()}`
              : 'No results'}
          </span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs bg-white dark:bg-slate-900"
          >
            <option value={25}>25 / page</option>
            <option value={50}>50 / page</option>
            <option value={100}>100 / page</option>
          </select>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page === 0}
            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="px-2 text-xs font-medium">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages - 1}
            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}