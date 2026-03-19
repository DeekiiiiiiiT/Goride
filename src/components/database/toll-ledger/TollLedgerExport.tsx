import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { TollLedgerEntry } from '../../../types/toll-ledger';
import { toast } from 'sonner@2.0.3';
import type { RenderColumnDef } from './TollLedgerTable';

// ── CSV value helpers ───────────────────────────────────────────────────────

/** All exportable columns — includes fields not in the table view for completeness */
const EXPORT_COLUMNS: { key: string; label: string }[] = [
  { key: 'id', label: 'Entry ID' },
  { key: 'date', label: 'Date' },
  { key: 'time', label: 'Time' },
  { key: 'vehicleId', label: 'Vehicle ID' },
  { key: 'vehiclePlate', label: 'Vehicle Plate' },
  { key: 'driverId', label: 'Driver ID' },
  { key: 'driverName', label: 'Driver Name' },
  { key: 'plaza', label: 'Plaza / Location' },
  { key: 'type', label: 'Type' },
  { key: 'paymentMethod', label: 'Payment Method' },
  { key: 'amount', label: 'Amount' },
  { key: 'absAmount', label: 'Abs Amount' },
  { key: 'status', label: 'Status' },
  { key: 'description', label: 'Description' },
  { key: 'referenceTagId', label: 'Tag ID' },
  { key: 'batchId', label: 'Batch ID' },
  { key: 'reconciliationStatus', label: 'Recon Status' },
  { key: 'resolution', label: 'Resolution' },
  { key: 'matchedTripId', label: 'Matched Trip ID' },
  { key: 'matchedTripDate', label: 'Matched Trip Date' },
  { key: 'matchedTripPlatform', label: 'Trip Platform' },
  { key: 'matchedTripPickup', label: 'Trip Pickup' },
  { key: 'matchedTripDropoff', label: 'Trip Dropoff' },
  { key: 'reconciledAt', label: 'Reconciled At' },
  { key: 'reconciledBy', label: 'Reconciled By' },
  { key: 'tripTollCharges', label: 'Trip Toll Charges' },
  { key: 'refundAmount', label: 'Refund Amount' },
  { key: 'lossAmount', label: 'Loss Amount' },
  { key: 'hasSuggestions', label: 'Has Suggestions' },
  { key: 'isAmbiguous', label: 'Is Ambiguous' },
  { key: 'topSuggestionScore', label: 'Top Suggestion Score' },
  { key: 'topSuggestionTripId', label: 'Top Suggestion Trip ID' },
  { key: 'suggestionCount', label: 'Suggestion Count' },
];

/** Map a column key to a raw (non-JSX) string value for CSV */
function getRawValue(entry: TollLedgerEntry, key: string): string {
  const val = (entry as any)[key];
  if (val == null) return '';
  if (typeof val === 'number') return String(val);
  return String(val);
}

/** Escape a value for CSV (wrap in quotes if it contains comma, quote, or newline) */
function csvEscape(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n') || val.includes('\r')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

// ── Export logic ────────────────────────────────────────────────────────────

function buildCsv(entries: TollLedgerEntry[]): string {
  const header = EXPORT_COLUMNS.map(c => csvEscape(c.label)).join(',');
  const rows = entries.map(entry =>
    EXPORT_COLUMNS.map(c => csvEscape(getRawValue(entry, c.key))).join(',')
  );
  return [header, ...rows].join('\n');
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function generateFilename(): string {
  const ts = new Date().toISOString().slice(0, 10);
  return `toll_ledger_export_${ts}.csv`;
}

// ── Component ───────────────────────────────────────────────────────────────

interface TollLedgerExportProps {
  entries: TollLedgerEntry[];
  totalFiltered: number;
}

export function TollLedgerExport({ entries, totalFiltered }: TollLedgerExportProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = () => {
    if (entries.length === 0) {
      toast.error('No toll transactions to export');
      return;
    }

    setExporting(true);
    try {
      const csv = buildCsv(entries);
      downloadCsv(csv, generateFilename());
      toast.success(
        `Exported ${entries.length.toLocaleString()} toll transactions (${EXPORT_COLUMNS.length} columns)`
      );
    } catch (err: any) {
      console.error('Toll CSV export error:', err);
      toast.error('Export failed: ' + (err?.message || 'Unknown error'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={exporting || entries.length === 0}
      className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      title={
        entries.length > 0
          ? `Export ${entries.length.toLocaleString()} toll transactions as CSV`
          : 'No transactions to export'
      }
    >
      <Download className={`h-4 w-4 ${exporting ? 'animate-bounce' : ''}`} />
      Export
      {entries.length > 0 && (
        <span className="text-xs text-slate-400 dark:text-slate-500">
          ({entries.length.toLocaleString()})
        </span>
      )}
    </button>
  );
}
