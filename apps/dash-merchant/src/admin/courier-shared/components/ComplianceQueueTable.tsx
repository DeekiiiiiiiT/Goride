import React, { useState } from 'react';
import { Loader2, ChevronRight } from 'lucide-react';
import type { CourierComplianceRow } from '@roam/types/courier';
import { BlockerChips } from './ComplianceChecklist';

type Props = {
  rows: CourierComplianceRow[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (row: CourierComplianceRow) => void;
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

export function ComplianceQueueTable({ rows, loading, selectedId, onSelect }: Props) {
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
        <p className="text-slate-400">No couriers awaiting compliance review.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/50">
        <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Review queue</p>
      </div>
      <ul className="divide-y divide-slate-800 max-h-[calc(100vh-280px)] overflow-y-auto">
        {rows.map((row) => {
          const selected = selectedId === row.courier_id;
          return (
            <li key={row.courier_id}>
              <button
                type="button"
                onClick={() => onSelect(row)}
                className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors ${
                  selected
                    ? 'bg-emerald-500/10 border-l-2 border-l-emerald-500'
                    : 'hover:bg-slate-900/60 border-l-2 border-l-transparent'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-white truncate">
                      {row.courier_name || row.courier_email || 'Unknown'}
                    </span>
                    <StatusBadge status={row.account_status} />
                  </div>
                  {row.courier_email && row.courier_name && (
                    <p className="text-xs text-slate-500 truncate mt-0.5">{row.courier_email}</p>
                  )}
                  <div className="mt-2">
                    <BlockerChips blockers={row.blockers} />
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-600 shrink-0 mt-1" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
