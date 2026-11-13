import React from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { TollV2SecondaryButton } from './TollV2Buttons';

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

export function TollV2ErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-900 sm:flex-row sm:items-center sm:justify-between"
      data-testid="toll-v2-error"
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <div>
          <p className="font-semibold">Couldn&apos;t load tolls</p>
          <p className="mt-0.5">Check your connection.</p>
        </div>
      </div>
      <TollV2SecondaryButton type="button" onClick={onRetry}>
        Try again
      </TollV2SecondaryButton>
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
