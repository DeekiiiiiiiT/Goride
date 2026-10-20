import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fromMoneyMinor, computeTagAccountRollForward } from '@roam/finance-core';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { ReconRunPayload } from '../../../services/reconApi';
import {
  fetchTagAccountRollForward,
  isReconUnavailable,
  postRunEvent,
} from '../../../services/reconApi';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { cn } from '../../ui/utils';

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
    return computeTagAccountRollForward({
      openingMinor: rollQuery.data.openingMinor,
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

  const saveStatement = async () => {
    if (statementMinor == null) return;
    setBusy(true);
    try {
      await postRunEvent(line, weekKey, {
        kind: 'tag_account_statement_closing',
        expectedVersion: run.run.version,
        payload: { statementClosingMinor: statementMinor },
      });
      await rollQuery.refetch();
      onRefresh();
    } finally {
      setBusy(false);
    }
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
              <span className="ml-2 text-xs font-normal text-slate-500">after week {data.priorWeekKey}</span>
            ) : (
              <span className="ml-2 text-xs font-normal text-slate-500">(no prior close — starts at 0)</span>
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
      </div>

      {hasStatement && !tied ? (
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
