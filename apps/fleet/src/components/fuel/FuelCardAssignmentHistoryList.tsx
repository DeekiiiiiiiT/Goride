/**
 * Newest-first card holder timeline (handoff vehicle snapshot is audit-only).
 */
import React from 'react';
import type { FuelCardAssignmentHistoryEntry } from '../../types/fuel';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';

function formatDay(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatRange(entry: FuelCardAssignmentHistoryEntry): string {
  const start = formatDay(entry.assignedAt);
  if (!entry.unassignedAt) return `${start} – Present`;
  return `${start} – ${formatDay(entry.unassignedAt)}`;
}

export function FuelCardAssignmentHistoryList({
  history,
  className = '',
  /** compact = dialog snippet; panel = full tab table */
  variant = 'compact',
}: {
  history?: FuelCardAssignmentHistoryEntry[];
  className?: string;
  variant?: 'compact' | 'panel';
}) {
  const rows = [...(history || [])].sort(
    (a, b) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime(),
  );

  if (variant === 'panel') {
    if (rows.length === 0) {
      return (
        <div className={`rounded-md border py-16 text-center text-sm text-slate-500 ${className}`}>
          No assignment history yet — it starts the next time this card is assigned or reassigned.
        </div>
      );
    }
    return (
      <div className={`rounded-md border overflow-x-auto ${className}`}>
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/80">
              <TableHead className="text-[11px] uppercase tracking-wide">Driver</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wide">Held card</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wide">
                Vehicle at handoff
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wide">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((e, i) => (
              <TableRow key={`${e.driverId}-${e.assignedAt}-${i}`}>
                <TableCell className="text-sm font-medium text-slate-800">
                  {e.driverName || e.driverId || 'Unknown'}
                </TableCell>
                <TableCell className="text-xs text-slate-600 whitespace-nowrap">
                  {formatRange(e)}
                </TableCell>
                <TableCell className="text-xs text-slate-600">
                  {e.vehicleLabelAtAssign || '—'}
                </TableCell>
                <TableCell className="text-xs">
                  {e.unassignedAt ? (
                    <span className="text-slate-500">Ended</span>
                  ) : (
                    <span className="font-medium text-emerald-700">Current</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div className={`space-y-1.5 ${className}`}>
      <p className="text-xs font-medium text-slate-700">Assignment history</p>
      {rows.length === 0 ? (
        <p className="text-[11px] text-slate-500">
          No history yet — will start on next assign.
        </p>
      ) : (
        <ul className="max-h-36 overflow-y-auto space-y-1.5 rounded-md border border-slate-100 bg-slate-50/80 p-2">
          {rows.map((e, i) => (
            <li key={`${e.driverId}-${e.assignedAt}-${i}`} className="text-[11px] text-slate-700">
              <div className="font-medium">{e.driverName || e.driverId || 'Unknown'}</div>
              <div className="text-slate-500">{formatRange(e)}</div>
              <div className="text-slate-500">
                Vehicle at handoff: {e.vehicleLabelAtAssign || '—'}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
