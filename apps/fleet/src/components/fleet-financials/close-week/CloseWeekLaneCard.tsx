/**
 * Close Week lane card + identity row helpers (P-5 extract from CloseWeekPage).
 */
import React from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Button } from '../../ui/button';
import { cn } from '../../ui/utils';
import {
  LANE_LABEL,
  type CloseLane,
  type CloseLaneStatus,
} from '../../../utils/weekCloseBlockers';

const STATUS_CHROME: Record<CloseLaneStatus, { dot: string; text: string; label: string }> = {
  clear: { dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Clear' },
  blocked: { dot: 'bg-rose-500', text: 'text-rose-700', label: 'Blocked' },
  unverified: { dot: 'bg-amber-500', text: 'text-amber-800', label: 'Unverified' },
  pending: { dot: 'bg-amber-500', text: 'text-amber-700', label: 'Pending' },
  loading: { dot: 'bg-slate-300', text: 'text-slate-500', label: 'Loading' },
};

export function CloseWeekLaneCard({
  lane,
  icon,
  status,
  metrics,
  blockerLabels,
  warnLabels,
  provenance,
  onReview,
}: {
  lane: CloseLane;
  icon: React.ReactNode;
  status: CloseLaneStatus;
  metrics: { label: string; value: string; tone?: 'default' | 'warn' }[];
  blockerLabels: string[];
  warnLabels?: string[];
  provenance?: string;
  onReview: () => void;
}) {
  const chrome = STATUS_CHROME[status];
  return (
    <div className="flex flex-col rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <span className="text-slate-500">{icon}</span>
          {LANE_LABEL[lane]}
        </div>
        <span className={cn('flex items-center gap-1.5 text-xs font-medium', chrome.text)}>
          <span className={cn('h-2 w-2 rounded-full', chrome.dot)} />
          {status === 'loading' ? 'Loading…' : chrome.label}
        </span>
      </div>

      {provenance ? (
        <p className="mt-1 text-[11px] text-slate-500">{provenance}</p>
      ) : null}

      <dl className="mt-3 space-y-1.5">
        {metrics.map((m) => (
          <div key={m.label} className="flex items-baseline justify-between gap-2">
            <dt className="text-xs text-slate-500">{m.label}</dt>
            <dd
              className={cn(
                'text-sm font-medium tabular-nums',
                m.tone === 'warn' ? 'text-rose-700' : 'text-slate-900',
              )}
            >
              {m.value}
            </dd>
          </div>
        ))}
      </dl>

      {blockerLabels.length > 0 ? (
        <ul className="mt-3 space-y-1 border-t border-slate-100 pt-2">
          {blockerLabels.map((b, i) => (
            <li key={`b-${i}`} className="flex items-start gap-1.5 text-xs text-rose-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {(warnLabels || []).length > 0 ? (
        <ul className={cn('mt-2 space-y-1', blockerLabels.length === 0 && 'border-t border-slate-100 pt-2')}>
          {(warnLabels || []).map((w, i) => (
            <li key={`w-${i}`} className="flex items-start gap-1.5 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-3 h-8 w-full"
        onClick={onReview}
      >
        Review {LANE_LABEL[lane]}
        <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export function CloseWeekIdentityRow({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs text-slate-600">{label}</span>
      <span
        className={cn(
          'flex items-center gap-1.5 text-xs font-medium tabular-nums',
          ok ? 'text-emerald-700' : 'text-rose-700',
        )}
      >
        {value}
        {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
      </span>
    </div>
  );
}
