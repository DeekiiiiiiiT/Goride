import React from 'react';
import { Zap } from 'lucide-react';

type Props = {
  online: boolean;
};

export function DriverHomeDemandCard({ online }: Props) {
  if (!online) return null;

  return (
    <div className="mb-8 flex items-center gap-4 rounded-2xl border border-emerald-500/10 bg-emerald-500/5 p-5">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-600">
        <Zap className="h-6 w-6 text-white" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <h4 className="font-semibold leading-tight text-emerald-700 dark:text-emerald-400">
          You&apos;re visible to riders
        </h4>
        <p className="text-sm text-emerald-600/80 dark:text-emerald-400/80">
          Stay in busy areas to receive more ride requests
        </p>
      </div>
      <span className="shrink-0 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white">
        Live
      </span>
    </div>
  );
}
