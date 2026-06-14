import React, { useState } from 'react';
import { Loader2, ChevronRight } from 'lucide-react';
import type { DriverComplianceRow } from '@roam/types/driver';
import { BlockerChips } from './ComplianceChecklist';

type Props = {
  rows: DriverComplianceRow[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (row: DriverComplianceRow) => void;
};

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === 'active'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
      : status === 'pending'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
        : 'border-slate-600/40 bg-slate-500/10 text-slate-400';
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium border ${styles}`}>
      {status}
    </span>
  );
}

export function ComplianceQueueTable({
  rows,
  loading,
  selectedId,
  onSelect,
}: Props) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Loading queue…
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-12 text-center">
        <p className="text-slate-400">No drivers awaiting compliance review.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/50">
        <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Review queue</p>
        <p className="text-sm text-slate-400 mt-0.5">Select a driver to verify and approve</p>
      </div>
      <ul className="divide-y divide-slate-800 max-h-[calc(100vh-280px)] overflow-y-auto">
        {rows.map((row) => {
          const selected = selectedId === row.driver_id;
          return (
            <li key={row.driver_id}>
              <button
                type="button"
                onClick={() => onSelect(row)}
                className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors ${
                  selected ? 'bg-violet-500/10 border-l-2 border-l-violet-500' : 'hover:bg-slate-900/60 border-l-2 border-l-transparent'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-white truncate">
                      {row.driver_name || row.driver_email || 'Unknown'}
                    </span>
                    <StatusBadge status={row.account_status} />
                  </div>
                  {row.driver_email && row.driver_name && (
                    <p className="text-xs text-slate-500 truncate mt-0.5">{row.driver_email}</p>
                  )}
                  <div className="mt-2">
                    <BlockerChips blockers={row.blockers} />
                  </div>
                </div>
                <ChevronRight className={`w-4 h-4 shrink-0 mt-1 ${selected ? 'text-violet-400' : 'text-slate-600'}`} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Compact table for dashboard drilldown — links to full compliance page */
export function ComplianceQueueTableCompact({
  rows,
  loading,
}: {
  rows: DriverComplianceRow[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading…
      </div>
    );
  }
  if (!rows.length) {
    return <p className="text-center py-12 text-slate-500 text-sm">No drivers in queue.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-left text-slate-500 text-xs uppercase">
            <th className="px-4 py-2 font-medium">Driver</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">Blockers</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.driver_id} className="border-b border-slate-800/60">
              <td className="px-4 py-2 text-white">{row.driver_name || row.driver_email}</td>
              <td className="px-4 py-2 capitalize text-slate-400">{row.account_status}</td>
              <td className="px-4 py-2"><BlockerChips blockers={row.blockers} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
