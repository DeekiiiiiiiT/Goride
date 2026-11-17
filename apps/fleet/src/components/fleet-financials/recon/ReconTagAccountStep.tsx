import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fromMoneyMinor, computeTagAccountRollForward } from '@roam/finance-core';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { ReconRunPayload } from '../../../services/reconApi';
import {
  fetchTagAccountRollForward,
  isReconUnavailable,
  postRunEvent,
  ReconApiError,
} from '../../../services/reconApi';
import { RECON_WEEK_CHANGED_EVENT } from '../../../services/reconWeekContext';
import { toast } from 'sonner';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { cn } from '../../ui/utils';

/** Done-test 9b: a refused save says so. 409 = someone else changed (or closed) the week. */
export function reportTagAccountSaveError(err: unknown) {
  if (err instanceof ReconApiError && err.status === 409) {
    window.dispatchEvent(
      new CustomEvent(RECON_WEEK_CHANGED_EVENT, { detail: { code: /closed/i.test(err.message) ? 'WEEK_CLOSED' : 'WEEK_CHANGED' } }),
    );
    return;
  }
  toast.error(err instanceof Error && err.message ? err.message : 'Could not save the tag account. Try again.');
}

function fmtMajor(minor: number): string {
  return fromMoneyMinor(minor as import('@roam/finance-core').MoneyMinor).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function ReconTagAccountStep({
  run,
  onRefresh,
}: {
  run: ReconRunPayload;
  onRefresh: () => void;
}) {
  const line = run.run.serviceLine as 'rideshare' | 'rush_delivery';
  const weekKey = run.run.weekKey;
  const [statementInput, setStatementInput] = useState('');
  const [busy, setBusy] = useState(false);
  /** WRA-48: show the typed-balance box instead of the Confirm card. */
  const [editing, setEditing] = useState(false);

  const rollQuery = useQuery({
    queryKey: ['recon-tag-account', line, weekKey],
    queryFn: () => fetchTagAccountRollForward(line, weekKey),
    staleTime: 15_000,
    retry: false,
  });

  const statementMinor = useMemo(() => {
    const raw = statementInput.trim().replace(/,/g, '');
    if (!raw) return rollQuery.data?.statementClosingMinor ?? null;
    const major = Number(raw);
    if (!Number.isFinite(major)) return null;
    return Math.round(major * 100);
  }, [statementInput, rollQuery.data?.statementClosingMinor]);

  const liveRoll = useMemo(() => {
    if (!rollQuery.data) return null;
    // First week (no earlier closing): the statement closing sets the opening, same as the server.
    const firstWeek = !rollQuery.data.priorWeekKey && statementMinor != null;
    return computeTagAccountRollForward({
      openingMinor: firstWeek
        ? statementMinor - rollQuery.data.topUpsMinor + rollQuery.data.tagUsageMinor
        : rollQuery.data.openingMinor,
      topUpsMinor: rollQuery.data.topUpsMinor,
      tagUsageMinor: rollQuery.data.tagUsageMinor,
      statementClosingMinor: statementMinor,
    });
  }, [rollQuery.data, statementMinor]);

  React.useEffect(() => {
    if (rollQuery.data?.statementClosingMinor != null && !statementInput) {
      setStatementInput(String(fromMoneyMinor(rollQuery.data.statementClosingMinor as import('@roam/finance-core').MoneyMinor)));
    }
  }, [rollQuery.data?.statementClosingMinor, statementInput]);

  const postClosing = async (closingMinor: number, confirmedExpected: boolean) => {
    setBusy(true);
    try {
      await postRunEvent(line, weekKey, {
        kind: 'tag_account_statement_closing',
        expectedVersion: run.run.version,
        payload: { statementClosingMinor: closingMinor, ...(confirmedExpected ? { confirmedExpected: true } : {}) },
      });
      setStatementInput(String(fromMoneyMinor(closingMinor as import('@roam/finance-core').MoneyMinor)));
      setEditing(false);
      await rollQuery.refetch();
      onRefresh();
    } catch (err) {
      reportTagAccountSaveError(err);
    } finally {
      setBusy(false);
    }
  };

  const saveStatement = async () => {
    if (statementMinor == null) return;
    await postClosing(statementMinor, false);
  };

  const varianceAction = async (action: 'missing_topup' | 'provider_fee' | 'investigate') => {
    setBusy(true);
    try {
      await postRunEvent(line, weekKey, {
        kind: 'tag_account_variance_action',
        expectedVersion: run.run.version,
        payload: {
          action,
          varianceMinor: liveRoll?.varianceMinor ?? null,
          statementClosingMinor: statementMinor,
          expectedClosingMinor: liveRoll?.expectedClosingMinor ?? null,
        },
      });
      onRefresh();
    } catch (err) {
      reportTagAccountSaveError(err);
    } finally {
      setBusy(false);
    }
  };

  if (rollQuery.isLoading) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading tag account…
      </div>
    );
  }

  if (rollQuery.isError && isReconUnavailable(rollQuery.error)) {
    return (
      <p className="text-sm text-slate-500">Tag account roll-forward is not available in this environment yet.</p>
    );
  }

  if (rollQuery.isError || !rollQuery.data || !liveRoll) {
    return <p className="text-sm text-rose-700">Could not load tag account for this week.</p>;
  }

  const data = rollQuery.data;
  const tied = liveRoll.ties;
  const hasStatement = statementMinor != null;
  // WRA-48: with an earlier closing, the app works the balance out itself
  // (opening + top-ups − usage) and the user confirms it against TransJam.
  const hasPrior = data.priorWeekKey != null;
  const workedOutMinor = computeTagAccountRollForward({
    openingMinor: data.openingMinor,
    topUpsMinor: data.topUpsMinor,
    tagUsageMinor: data.tagUsageMinor,
  }).expectedClosingMinor;
  const savedMinor = data.statementClosingMinor;
  const showConfirmCard = hasPrior && !editing && (savedMinor == null || data.ties);
  const staleConfirm =
    hasPrior && savedMinor != null && !data.ties && data.statementConfirmedFromExpected === true;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Match your toll provider&apos;s prepaid balance: opening (from last closed week) plus top-ups,
        minus tag usage, should equal the statement closing balance.
      </p>

      <dl className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">Opening balance</dt>
          <dd className="text-lg font-semibold tabular-nums text-slate-900">
            {fmtMajor(data.openingMinor)}
            {data.priorWeekKey ? (
              <span className="ml-2 text-xs font-normal text-slate-500" data-testid="tag-account-opening-source">
                after week {data.priorWeekKey}
                {data.carriedWeekKeys?.length
                  ? ` · includes ${data.carriedWeekKeys.length === 1 ? 'week' : 'weeks'} of ${data.carriedWeekKeys.join(', ')}`
                  : ''}
              </span>
            ) : data.openingFromStatement ? (
              <span className="ml-2 text-xs font-normal text-slate-500">
                (first week — worked out from the statement closing below)
              </span>
            ) : (
              <span className="ml-2 text-xs font-normal text-slate-500">
                (first week — enter the statement closing below; it sets the opening)
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Top-ups this week</dt>
          <dd className="text-lg font-semibold tabular-nums text-emerald-800">+ {fmtMajor(data.topUpsMinor)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Tag usage this week</dt>
          <dd className="text-lg font-semibold tabular-nums text-rose-800">− {fmtMajor(data.tagUsageMinor)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Expected closing</dt>
          <dd className="text-lg font-bold tabular-nums text-slate-900">{fmtMajor(liveRoll.expectedClosingMinor)}</dd>
        </div>
      </dl>

      {showConfirmCard ? (
        savedMinor == null ? (
          <div className="space-y-3 rounded-xl border border-[#c7d2fe] bg-[#eef2ff] p-4" data-testid="tag-confirm-card">
            <div>
              <p className="text-sm font-semibold text-slate-900">Balance at the end of this week</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">J${fmtMajor(workedOutMinor)}</p>
              <p className="mt-1 text-sm text-slate-600">
                Worked out from last week&apos;s closing, this week&apos;s top-ups and tolls. Check it matches your
                TransJam balance, then confirm.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={busy}
                onClick={() => void postClosing(workedOutMinor, true)}
                data-testid="tag-confirm-balance"
              >
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
                Confirm J${fmtMajor(workedOutMinor)}
              </Button>
              <Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(true)}>
                TransJam shows a different balance
              </Button>
            </div>
          </div>
        ) : (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4"
            data-testid="tag-confirmed-card"
          >
            <p className="flex items-center gap-2 text-sm text-emerald-900">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
              <span>
                Closing balance <strong className="tabular-nums">J${fmtMajor(savedMinor)}</strong> saved — it ties.
              </span>
            </p>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setEditing(true)}>
              Change balance
            </Button>
          </div>
        )
      ) : null}

      {staleConfirm && !editing ? (
        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" data-testid="tag-stale-confirm">
          <p>
            The toll files changed after you confirmed J${fmtMajor(savedMinor ?? 0)}. The balance now works out to{' '}
            <strong className="tabular-nums">J${fmtMajor(workedOutMinor)}</strong>.
          </p>
          <Button type="button" disabled={busy} onClick={() => void postClosing(workedOutMinor, true)}>
            Confirm J${fmtMajor(workedOutMinor)}
          </Button>
        </div>
      ) : null}

      {showConfirmCard ? null : (
      <div className="space-y-2 rounded-xl border border-slate-200 p-4">
        <Label htmlFor="tag-statement-closing">Statement closing balance</Label>
        <div className="flex flex-wrap gap-2">
          <Input
            id="tag-statement-closing"
            type="text"
            inputMode="decimal"
            placeholder="From provider statement"
            value={statementInput}
            onChange={(e) => setStatementInput(e.target.value)}
            className="max-w-xs tabular-nums"
          />
          <Button type="button" variant="secondary" disabled={busy || statementMinor == null} onClick={() => void saveStatement()}>
            Save closing
          </Button>
        </div>
        {hasStatement && liveRoll.varianceMinor != null ? (
          <div
            className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-2 text-sm',
              tied ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900',
            )}
          >
            {tied ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            )}
            <span>
              Variance:{' '}
              <strong className="tabular-nums">
                {liveRoll.varianceMinor >= 0 ? '+' : ''}
                {fmtMajor(liveRoll.varianceMinor)}
              </strong>
              {tied ? ' — ties' : ' — investigate or explain'}
            </span>
          </div>
        ) : null}
        {hasPrior && editing ? (
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setEditing(false)}>
            Back to the worked-out balance
          </Button>
        ) : null}
      </div>
      )}

      {!showConfirmCard && hasStatement && !tied ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void varianceAction('missing_topup')}>
            Missing top-up
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void varianceAction('provider_fee')}>
            Provider fee
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void varianceAction('investigate')}>
            Investigate
          </Button>
        </div>
      ) : null}
    </div>
  );
}
