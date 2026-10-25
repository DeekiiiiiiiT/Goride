/**
 * Dec 2025–Jan 12 2026. Carry is pre-selected. Write-off needs a reason.
 * Nothing is posted until the owner confirms.
 */
import React, { useState } from 'react';
import { Button } from '../../ui/button';
import { settlementCommandsApi } from '../../../services/settlementCommandsApi';
import { toast } from 'sonner';

type WeekRow = { week: string; driverId: string; amount: number; closed: boolean };
type Choice = 'carry' | 'write_off';

export function LegacyWeeksPanel() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [weeks, setWeeks] = useState<WeekRow[]>([]);
  const [choice, setChoice] = useState<Record<string, Choice>>({});
  const [reason, setReason] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    try {
      const res = await settlementCommandsApi.legacyWeeks({ confirm: false });
      setWeeks(res.weeks || []);
      const next: Record<string, Choice> = {};
      for (const week of res.weeks || []) next[week.week] = 'carry';
      setChoice(next);
      setOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load older weeks');
    } finally {
      setLoading(false);
    }
  };

  const confirm = async () => {
    setLoading(true);
    try {
      await settlementCommandsApi.legacyWeeks({
        confirm: true,
        choices: weeks.map((week) => ({
          week: week.week,
          action: choice[week.week] || 'carry',
          reason: reason[week.week],
        })),
      });
      toast.success('Older weeks were posted onto the open week.');
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not post older weeks');
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <Button type="button" variant="outline" disabled={loading} onClick={() => void load()}>
        {loading ? 'Loading older weeks…' : 'Older weeks (Dec–Jan)'}
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 p-4 space-y-3">
      <p className="text-sm text-slate-700">
        These weeks are not recalculated. Carry keeps the amount and moves it to the open week. Write-off needs a reason.
      </p>
      {weeks.length === 0 ? <p className="text-sm text-slate-500">No older weeks are waiting.</p> : null}
      {weeks.map((week) => (
        <div key={`${week.driverId}-${week.week}`} className="grid gap-2 border-b border-slate-100 pb-2 sm:grid-cols-[8rem_8rem_1fr]">
          <span className="text-sm font-medium">{week.week}</span>
          <span className="text-sm tabular-nums">${week.amount.toFixed(2)}</span>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label>
              <input
                type="radio"
                checked={(choice[week.week] || 'carry') === 'carry'}
                onChange={() => setChoice((prev) => ({ ...prev, [week.week]: 'carry' }))}
              />{' '}
              Carry
            </label>
            <label>
              <input
                type="radio"
                checked={choice[week.week] === 'write_off'}
                onChange={() => setChoice((prev) => ({ ...prev, [week.week]: 'write_off' }))}
              />{' '}
              Write off
            </label>
            {choice[week.week] === 'write_off' ? (
              <input
                className="min-w-[16rem] rounded border border-slate-300 px-2 py-1"
                placeholder="Why this is written off"
                value={reason[week.week] || ''}
                onChange={(e) => setReason((prev) => ({ ...prev, [week.week]: e.target.value }))}
              />
            ) : null}
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <Button type="button" disabled={loading || weeks.length === 0} onClick={() => void confirm()}>
          Confirm
        </Button>
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
