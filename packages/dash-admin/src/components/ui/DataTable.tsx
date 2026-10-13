import React from 'react';
import { EmptyState } from './bits';

export type DataColumn<T> = {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
};

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  loading,
  error,
  emptyTitle,
  page,
  pageCount,
  onPage,
  onRow,
  totalLabel,
}: {
  columns: DataColumn<T>[];
  rows: T[];
  loading?: boolean;
  error?: string | null;
  emptyTitle: string;
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
  onRow?: (row: T) => void;
  totalLabel?: string;
}) {
  if (loading) {
    return <div className="py-16 text-center text-sm text-slate-400">Loading…</div>;
  }
  if (error) {
    return <EmptyState title="Could not load this list" body={error} />;
  }
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} />;
  }
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-800 overflow-x-auto bg-slate-900/60">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-slate-900 text-slate-400 text-left sticky top-0">
            <tr>
              {columns.map((col) => (
                <th key={col.key} className="px-4 py-3 font-medium">{col.header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.map((row) => (
              <tr
                key={row.id}
                onClick={onRow ? () => onRow(row) : undefined}
                className={onRow ? 'cursor-pointer hover:bg-slate-800/50' : undefined}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 text-slate-300">{col.cell(row)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm text-slate-400">
        <span>{totalLabel}</span>
        <div className="flex gap-2">
          <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="px-3 py-1 rounded-lg border border-slate-700 disabled:opacity-40">Prev</button>
          <span>{page} / {Math.max(pageCount, 1)}</span>
          <button type="button" disabled={page >= pageCount} onClick={() => onPage(page + 1)} className="px-3 py-1 rounded-lg border border-slate-700 disabled:opacity-40">Next</button>
        </div>
      </div>
    </div>
  );
}

export function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const body = [headers, ...rows].map((line) => line.map(escape).join(',')).join('\n');
  const blob = new Blob([body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
