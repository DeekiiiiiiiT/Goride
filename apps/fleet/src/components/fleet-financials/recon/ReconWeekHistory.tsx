/**
 * Step 8 History (WRA-30, WRA-32): the week's decision log, with an
 * "All events / Show self-approved" filter. Read only.
 */
import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { fetchWeekHistory, type ReconHistoryItem } from '../../../services/reconApi';
import { cn } from '../../ui/utils';

export function filterHistory(items: ReconHistoryItem[], selfOnly: boolean): ReconHistoryItem[] {
  return selfOnly ? items.filter((i) => i.selfApproved) : items;
}

function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function ReconWeekHistory({
  line,
  weekKey,
  version,
}: {
  line: 'rideshare' | 'rush_delivery';
  weekKey: string;
  /** Refetch when the week changes. */
  version: number;
}) {
  const [selfOnly, setSelfOnly] = useState(false);
  const query = useQuery({
    queryKey: ['recon-week-history', line, weekKey, version],
    queryFn: () => fetchWeekHistory(line, weekKey),
    staleTime: 30_000,
    retry: false,
  });
  const items = useMemo(() => [...filterHistory(query.data ?? [], selfOnly)].reverse(), [query.data, selfOnly]);

  return (
    <section className="space-y-3 rounded-2xl border border-[#e5eeff] bg-white p-5" data-testid="recon-history">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-lg font-semibold text-[#0b1c30]">History</p>
        <div className="flex rounded-xl bg-[#eff4ff] p-1" role="radiogroup" aria-label="History filter">
          {[
            { id: false, label: 'All events' },
            { id: true, label: 'Show self-approved' },
          ].map((o) => (
            <button
              key={String(o.id)}
              type="button"
              role="radio"
              aria-checked={selfOnly === o.id}
              onClick={() => setSelfOnly(o.id)}
              className={cn(
                'h-8 rounded-lg px-3 text-[13px] font-semibold',
                selfOnly === o.id ? 'bg-[#030213] text-white' : 'text-[#0b1c30] hover:bg-white',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      {query.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-[#47464c]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading history…
        </p>
      ) : query.isError ? (
        <p className="text-sm text-[#ba1a1a]">Could not load the history.</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-[#47464c]">{selfOnly ? 'No self-approved actions on this week.' : 'Nothing recorded yet.'}</p>
      ) : (
        <ol className="space-y-3">
          {items.map((i) => (
            <li key={i.id} className="flex gap-3 text-sm">
              <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', i.status === 'rejected' || i.label.includes('failed') ? 'bg-[#ba1a1a]' : 'bg-[#0051d5]')} />
              <div className="min-w-0">
                <p className="font-medium text-[#0b1c30]">
                  {i.label}
                  {i.selfApproved ? (
                    <span className="ml-2 rounded-full bg-[#fef3c7] px-2 py-0.5 text-[11px] font-semibold text-[#92400e]">Self-approved</span>
                  ) : null}
                  {i.status === 'pending_approval' ? (
                    <span className="ml-2 rounded-full bg-[#fffbeb] px-2 py-0.5 text-[11px] font-semibold text-[#92400e]">Waiting</span>
                  ) : i.status === 'rejected' || i.status === 'withdrawn' || i.status === 'stale' ? (
                    <span className="ml-2 rounded-full bg-[#eff4ff] px-2 py-0.5 text-[11px] font-semibold text-[#47464c]">{i.status === 'stale' ? 'Out of date' : i.status === 'rejected' ? 'Rejected' : 'Withdrawn'}</span>
                  ) : null}
                </p>
                <p className="text-[13px] text-[#47464c]">
                  {when(i.at)} · {i.system ? 'Raised automatically' : i.by}
                  {i.approval && !i.selfApproved ? ` · ${i.approval}` : ''}
                </p>
                {i.reason ? <p className="text-[13px] text-[#0b1c30]">“{i.reason}”</p> : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
