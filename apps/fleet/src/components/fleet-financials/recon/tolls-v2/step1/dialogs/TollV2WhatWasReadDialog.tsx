import React, { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../../../ui/dialog';
import { Button } from '../../../../../ui/button';
import { TollV2SecondaryButton } from '../../TollV2Buttons';
import type { TollV2ImportReport, TollV2ImportReportRow } from '../tollV2ImportTypes';
import { fmtTollMinor, formatTimeJm } from '../../tollV2Format';
import { importRowStatusLabel, isImportProblemRow } from '../tollV2ImportReportFormat';

type Filter = 'all' | 'new' | 'already' | 'problems';

function rowMatchesFilter(row: TollV2ImportReportRow, filter: Filter): boolean {
  const s = String(row.status ?? '');
  if (filter === 'all') return true;
  if (filter === 'new') return s === 'new';
  if (filter === 'already') return s === 'unchanged' || s === 'trip_only';
  return isImportProblemRow(row);
}

export function TollV2WhatWasReadDialog({
  open,
  onOpenChange,
  report,
  onFixDriver,
  onWhichCar,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  report: TollV2ImportReport | null;
  onFixDriver: (row: TollV2ImportReportRow) => void;
  onWhichCar: (row: TollV2ImportReportRow) => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [visible, setVisible] = useState(50);

  const rows = report?.report ?? [];
  const counts = useMemo(
    () => ({
      all: rows.length,
      new: rows.filter((r) => r.status === 'new').length,
      already: rows.filter((r) => r.status === 'unchanged' || r.status === 'trip_only').length,
      problems: rows.filter(isImportProblemRow).length,
    }),
    [rows],
  );

  const filtered = useMemo(() => rows.filter((r) => rowMatchesFilter(r, filter)), [rows, filter]);
  const slice = filtered.slice(0, visible);

  const title = report?.fileName
    ? `What was read · ${report.fileName}`
    : 'What was read';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {report?.at ? (
            <p className="text-xs text-[#47464c]">
              Read {new Date(report.at).toLocaleString('en-JM', { timeZone: 'America/Jamaica' })}
            </p>
          ) : null}
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['all', 'All'],
              ['new', 'New'],
              ['already', 'Already in'],
              ['problems', 'Problems'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setFilter(key);
                setVisible(50);
              }}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                filter === key ? 'bg-[#030213] text-white' : 'border border-[#e5eeff] bg-white text-[#47464c]'
              }`}
            >
              {label} ({counts[key]})
            </button>
          ))}
        </div>
        <div className="overflow-x-auto rounded-xl border border-[#e5eeff]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#eff4ff] text-xs font-semibold text-[#47464c]">
              <tr>
                <th className="px-3 py-2">Row</th>
                <th className="px-3 py-2">What</th>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {slice.map((row, i) => {
                const status = importRowStatusLabel(row);
                const reason = String(row.reason ?? row.status ?? '');
                const isDriver = reason.includes('driver') || row.status === 'unknown_driver';
                const isPlate = reason.includes('plate') || reason.includes('vehicle') || row.status === 'unknown_plate';
                return (
                  <tr key={`${row.row ?? i}`} className="border-t border-[#e5eeff]">
                    <td className="px-3 py-2 tabular-nums">{row.row ?? i + 1}</td>
                    <td className="px-3 py-2">{String(row.ref ?? '—')}</td>
                    <td className="px-3 py-2">{formatTimeJm(String(row.occurred_at ?? ''))}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {typeof row.amount_minor === 'number' ? fmtTollMinor(row.amount_minor) : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs">{status}</td>
                    <td className="px-3 py-2">
                      {isDriver ? (
                        <Button type="button" size="sm" variant="outline" onClick={() => onFixDriver(row)}>
                          Fix driver
                        </Button>
                      ) : null}
                      {isPlate ? (
                        <Button type="button" size="sm" variant="outline" onClick={() => onWhichCar(row)}>
                          Which car?
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-[#47464c]">
          Showing {Math.min(visible, filtered.length)} of {filtered.length} rows
        </p>
        {visible < filtered.length ? (
          <Button type="button" variant="outline" onClick={() => setVisible((v) => v + 50)}>
            Show more
          </Button>
        ) : null}
        <DialogFooter>
          <TollV2SecondaryButton type="button" onClick={() => onOpenChange(false)}>
            Close
          </TollV2SecondaryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
