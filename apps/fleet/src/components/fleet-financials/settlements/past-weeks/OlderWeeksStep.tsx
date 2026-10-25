import type { ReactNode } from 'react';
import { splitLegacyWriteOff } from '@roam/finance-core';
import { Button } from '../../../ui/button';
import { formatMoney } from '../../../business-finance/money';
import {
  owesPhrase,
  parseWriteOffAmount,
  postWeeksLabel,
  weekLabel,
  writeOffAmountOk,
  writeOffReasonOk,
} from '../../../../utils/pastWeeksCleanupCopy';
import { cn } from '../../../ui/utils';

type Week = { week: string; driverId: string; amount: number };
type Choice = 'carry' | 'write_off';

export function OlderWeeksStep({
  weeks,
  nameFor,
  choice,
  reason,
  writeOffAmount,
  onChoice,
  onReason,
  onWriteOffAmount,
  busy,
  footer,
  outlook,
  postsEnabled,
  onPost,
}: {
  weeks: Week[];
  nameFor: (driverId: string) => string;
  choice: Record<string, Choice>;
  reason: Record<string, string>;
  writeOffAmount: Record<string, string>;
  onChoice: (week: string, choice: Choice) => void;
  onReason: (week: string, value: string) => void;
  onWriteOffAmount: (week: string, value: string) => void;
  busy: boolean;
  footer: string;
  outlook: ReactNode;
  postsEnabled: boolean;
  onPost: () => void;
}) {
  const blocked = weeks.some((week) => {
    if ((choice[week.week] || 'carry') !== 'write_off') return false;
    return !writeOffReasonOk(reason[week.week]) || !writeOffAmountOk(week.amount, writeOffAmount[week.week]);
  });
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-700">
        These {weeks.length} weeks are from before the system. They won't be recalculated. Choose what to do with each balance.
      </p>
      {weeks.length === 0 ? (
        <p className="text-sm text-slate-600">Older weeks are done.</p>
      ) : (
        <div className="space-y-3">
          {weeks.map((week) => {
            const picked = choice[week.week] || 'carry';
            return (
              <div key={`${week.driverId}-${week.week}`} className="space-y-2 border-b border-slate-100 pb-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-medium text-slate-900">{weekLabel(week.week)}</p>
                  <p className="text-sm text-slate-800">{owesPhrase(week.amount, nameFor(week.driverId))}</p>
                </div>
                <div className="grid grid-cols-2 gap-1 rounded-md border border-slate-200 p-1">
                  <button
                    type="button"
                    className={cn('h-11 rounded px-2 text-sm', picked === 'carry' ? 'bg-slate-900 text-white' : 'text-slate-700')}
                    onClick={() => onChoice(week.week, 'carry')}
                  >
                    Keep it (move to this week)
                  </button>
                  <button
                    type="button"
                    className={cn('h-11 rounded px-2 text-sm', picked === 'write_off' ? 'bg-slate-900 text-white' : 'text-slate-700')}
                    onClick={() => onChoice(week.week, 'write_off')}
                  >
                    Write it off
                  </button>
                </div>
                {picked === 'write_off' ? (
                  <WriteOffFields
                    week={week.week}
                    balance={week.amount}
                    driverName={nameFor(week.driverId)}
                    amount={writeOffAmount[week.week] ?? Math.abs(week.amount).toFixed(2)}
                    reason={reason[week.week] || ''}
                    onAmount={(value) => onWriteOffAmount(week.week, value)}
                    onReason={(value) => onReason(week.week, value)}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      {weeks.length > 0 ? <p className="text-sm font-medium text-slate-900">{footer}</p> : null}
      {outlook}
      {weeks.length > 0 ? (
        <Button type="button" className="h-11" disabled={busy || blocked || !postsEnabled} onClick={onPost}>
          {postWeeksLabel(weeks.length)}
        </Button>
      ) : null}
    </div>
  );
}

function WriteOffFields({
  week,
  balance,
  driverName,
  amount,
  reason,
  onAmount,
  onReason,
}: {
  week: string;
  balance: number;
  driverName: string;
  amount: string;
  reason: string;
  onAmount: (value: string) => void;
  onReason: (value: string) => void;
}) {
  const cap = Math.abs(balance);
  const parsed = parseWriteOffAmount(amount);
  const tooHigh = parsed != null && parsed > cap + 0.01;
  const split = parsed != null && !tooHigh ? splitLegacyWriteOff(balance, parsed) : null;
  return (
    <div className="space-y-2">
      <label className="block text-sm text-slate-700">
        Amount to write off
        <input
          className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 text-sm"
          inputMode="decimal"
          placeholder={formatMoney(cap)}
          aria-label={`Amount to write off for ${weekLabel(week)}`}
          value={amount}
          onChange={(event) => onAmount(event.target.value)}
        />
      </label>
      {tooHigh ? (
        <p className="text-sm text-amber-900">That's more than this week's balance of {formatMoney(cap)}.</p>
      ) : split && split.keep !== 0 ? (
        <p className="text-sm text-slate-600">The rest stays: {owesPhrase(split.keep, driverName)}, moved to this week.</p>
      ) : split ? (
        <p className="text-sm text-slate-600">The whole balance is written off. Nothing from this week moves.</p>
      ) : (
        <p className="text-sm text-slate-600">Up to {formatMoney(cap)}. Anything left is kept and moved to this week.</p>
      )}
      <input
        className="h-11 w-full rounded-md border border-slate-300 px-3 text-sm"
        placeholder="Why this is written off"
        aria-label={`Reason for writing off ${weekLabel(week)}`}
        value={reason}
        onChange={(event) => onReason(event.target.value)}
      />
      {!writeOffReasonOk(reason) ? (
        <p className="text-sm text-amber-900">Add a short reason, at least a word like “done”.</p>
      ) : null}
    </div>
  );
}
