import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { Trip } from '../../../types/data';
import { toast } from 'sonner@2.0.3';
import { mergeTripLedgerActiveColumns, type RenderColumnDef } from './TripLedgerTable';

// ── CSV value helpers ───────────────────────────────────────────────────────

function getNetIncome(t: Trip): number | null {
  if (t.netToDriver != null) return t.netToDriver;
  if (t.grossEarnings != null) return t.grossEarnings;
  if (t.amount != null) return t.amount;
  return null;
}

/** Map a column key to a raw (non-JSX) string value for CSV */
function getRawValue(trip: Trip, key: string): string {
  switch (key) {
    case 'id': return trip.id || '';
    case 'date': return trip.date || '';
    case 'driver': return trip.driverName || trip.driverId || '';
    case 'vehicle': return trip.vehicleId || '';
    case 'platform': return trip.platform || '';
    case 'status': return trip.status || '';
    case 'distance': return trip.distance != null ? String(trip.distance) : '';
    case 'duration': return trip.duration != null ? String(trip.duration) : '';
    case 'amount': return trip.amount != null ? String(trip.amount) : '';
    case 'netIncome': {
      const n = getNetIncome(trip);
      return n != null ? String(n) : '';
    }
    case 'paymentMethod': return trip.paymentMethod || '';
    case 'cashCollected': return trip.cashCollected != null ? String(trip.cashCollected) : '';
    case 'tips': return trip.fareBreakdown?.tips != null ? String(trip.fareBreakdown.tips) : '';
    case 'surge': return trip.fareBreakdown?.surge != null ? String(trip.fareBreakdown.surge) : '';
    case 'tolls': return trip.tollCharges != null ? String(trip.tollCharges) : '';
    case 'serviceFee': return trip.indriveServiceFee != null ? String(trip.indriveServiceFee) : '';
    case 'pickup': return trip.pickupLocation || '';
    case 'dropoff': return trip.dropoffLocation || '';
    case 'serviceCategory': return trip.serviceCategory || '';
    case 'batchSource': return trip.batchId || '';
    case 'efficiencyScore': return trip.efficiencyScore != null ? String(trip.efficiencyScore) : '';
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

function buildCsv(trips: Trip[], columns: RenderColumnDef[]): string {
  const header = columns.map(c => csvEscape(c.label)).join(',');
  const rows = trips.map(trip =>
    columns.map(c => csvEscape(getRawValue(trip, c.key))).join(',')
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
  const now = new Date();
  const ts = now.toISOString().slice(0, 10);
  return `trip_ledger_export_${ts}.csv`;
}

// ── Component ───────────────────────────────────────────────────────────────

interface TripLedgerExportProps {
  trips: Trip[];
  visibleColumns: string[];
  /** When set (Super Admin), CSV headers use saved labels and column order from config. */
  columnConfig?: { key: string; label: string; visible: boolean }[];
  total: number;
}

export function TripLedgerExport({ trips, visibleColumns, columnConfig, total }: TripLedgerExportProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = () => {
    if (trips.length === 0) {
      toast.error('No trips to export');
      return;
    }

    setExporting(true);
    try {
      const activeCols = mergeTripLedgerActiveColumns(visibleColumns, columnConfig);
      const csv = buildCsv(trips, activeCols);
      downloadCsv(csv, generateFilename());
      toast.success(`Exported ${trips.length} trips (${activeCols.length} columns)`);
    } catch (err: any) {
      console.error('CSV export error:', err);
      toast.error('Export failed: ' + (err?.message || 'Unknown error'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={exporting || trips.length === 0}
      className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      title={trips.length > 0 ? `Export ${trips.length} trips on this page as CSV` : 'No trips to export'}
    >
      <Download className={`h-4 w-4 ${exporting ? 'animate-bounce' : ''}`} />
      Export
      {trips.length > 0 && (
        <span className="text-xs text-slate-400 dark:text-slate-500">({trips.length})</span>
      )}
    </button>
  );
}
