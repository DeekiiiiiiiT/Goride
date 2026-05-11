import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { FuelEntry } from '../../../types/fuel';
import { toast } from 'sonner@2.0.3';
import type { RenderColumnDef } from './FuelLedgerTable';

// ── CSV value helpers ───────────────────────────────────────────────────────

/** Map a column key to a raw (non-JSX) string value for CSV */
function getRawValue(entry: FuelEntry, key: string): string {
  switch (key) {
    case 'id': return entry.id || '';
    case 'date': {
      let d = entry.date || '';
      if (entry.time) d += ' ' + entry.time;
      return d;
    }
    case 'vehicleId': return entry.vehicleId || '';
    case 'driverId': return entry.driverId || '';
    case 'amount': return entry.amount != null ? String(entry.amount) : '';
    case 'liters': return entry.liters != null ? String(entry.liters) : '';
    case 'pricePerLiter': return entry.pricePerLiter != null ? String(entry.pricePerLiter) : '';
    case 'odometer': return entry.odometer != null ? String(entry.odometer) : '';
    case 'location': return entry.location || entry.stationAddress || '';
    case 'paymentSource': return entry.paymentSource || '';
    case 'entryMode': return entry.entryMode || '';
    case 'type': return entry.type || '';
    case 'auditStatus': return entry.auditStatus || '';
    case 'entrySource': return entry.entrySource || '';
    case 'isFullTank': return entry.isFullTank != null ? (entry.isFullTank ? 'Yes' : 'No') : '';
    case 'isFlagged': return entry.isFlagged != null ? (entry.isFlagged ? 'Yes' : 'No') : '';
    case 'transactionId': return entry.transactionId || '';
    case 'matchedStationId': return entry.matchedStationId || '';
    case 'reconciliationStatus': return entry.reconciliationStatus || '';
    case 'anchorPeriodId': return entry.anchorPeriodId || '';
    case 'volumeContributed': return entry.volumeContributed != null ? String(entry.volumeContributed) : '';
    case 'geolocation': {
      const loc = entry.locationMetadata;
      if (loc && loc.lat != null && loc.lng != null) return `${loc.lat},${loc.lng}`;
      return '';
    }
    default: return '';
  }
}

/** Escape a value for CSV (wrap in quotes if it contains comma, quote, or newline) */
function csvEscape(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n') || val.includes('\r')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

// ── Export logic ────────────────────────────────────────────────────────────

function buildCsv(entries: FuelEntry[], columns: RenderColumnDef[]): string {
  const header = columns.map(c => csvEscape(c.label)).join(',');
  const rows = entries.map(entry =>
    columns.map(c => csvEscape(getRawValue(entry, c.key))).join(',')
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
  return `fuel_ledger_export_${ts}.csv`;
}

// ── Component ───────────────────────────────────────────────────────────────

interface FuelLedgerExportProps {
  entries: FuelEntry[];
  allColumns: RenderColumnDef[];
  visibleColumns: string[];
  totalFiltered: number;
}

export function FuelLedgerExport({ entries, allColumns, visibleColumns, totalFiltered }: FuelLedgerExportProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = () => {
    if (entries.length === 0) {
      toast.error('No fuel entries to export');
      return;
    }

    setExporting(true);
    try {
      const activeCols = allColumns.filter(c => visibleColumns.includes(c.key));
      const csv = buildCsv(entries, activeCols);
      downloadCsv(csv, generateFilename());
      toast.success(`Exported ${entries.length.toLocaleString()} fuel entries (${activeCols.length} columns)`);
    } catch (err: any) {
      console.error('Fuel CSV export error:', err);
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
      title={entries.length > 0 ? `Export ${entries.length.toLocaleString()} fuel entries as CSV` : 'No entries to export'}
    >
      <Download className={`h-4 w-4 ${exporting ? 'animate-bounce' : ''}`} />
      Export
      {entries.length > 0 && (
        <span className="text-xs text-slate-400 dark:text-slate-500">({entries.length.toLocaleString()})</span>
      )}
    </button>
  );
}
