import React from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { TollV2SecondaryButton } from './TollV2Buttons';
import { isTollReadAccessRefusal, TOLL_V2_NO_ACCESS_MESSAGE } from './tollV2ReadAccess';

export function TollV2EmptyCard() {
  return (
    <div
      className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-900"
      data-testid="toll-v2-empty"
    >
      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <div>
        <p className="font-semibold">No tolls this week</p>
        <p className="mt-0.5 text-emerald-800/90">Nothing arrived that needs a decision.</p>
      </div>
    </div>
  );
}

/**
 * The desk read failed. A permission refusal (P0001 / 42501) is not a connection problem: say what happened and
 * offer no retry, because a retry can never succeed.
 */
export function TollV2ErrorCard({ onRetry, error }: { onRetry: () => void; error?: unknown }) {
  const noAccess = isTollReadAccessRefusal(error);
  return (
    <div
      className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-900 sm:flex-row sm:items-center sm:justify-between"
      data-testid="toll-v2-error"
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <div>
          <p className="font-semibold">{noAccess ? 'No access to tolls' : "Couldn't load tolls"}</p>
          <p className="mt-0.5">{noAccess ? TOLL_V2_NO_ACCESS_MESSAGE : 'Check your connection.'}</p>
        </div>
      </div>
      {noAccess ? null : (
        <TollV2SecondaryButton type="button" onClick={onRetry}>
          Try again
        </TollV2SecondaryButton>
      )}
    </div>
  );
}

/** The weeks read failed where the take-backs card would be: the screen must not claim there is nothing to decide. */
export function TollV2WeeksErrorCard({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const noAccess = isTollReadAccessRefusal(error);
  return (
    <div
      className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50/80 p-3 text-sm text-rose-900 sm:flex-row sm:items-center sm:justify-between"
      role="alert"
      data-testid="toll-v2-weeks-error"
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>
          {noAccess
            ? TOLL_V2_NO_ACCESS_MESSAGE
            : "Couldn't load the Uber take-backs. Check your connection and try again."}
        </p>
      </div>
      {noAccess ? null : (
        <TollV2SecondaryButton type="button" onClick={onRetry}>
          Try again
        </TollV2SecondaryButton>
      )}
    </div>
  );
}

export function TollV2LoadingState() {
  return (
    <div className="flex h-48 items-center justify-center text-sm text-[#47464c]" data-testid="toll-v2-loading">
      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
      Loading tolls…
    </div>
  );
}
