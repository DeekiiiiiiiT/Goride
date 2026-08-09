import type { PackageMissionDeriveResult } from '@/app/freight/os/packageMissionStages';

type Props = {
  trackingLabel: string;
  statusLabel: string;
  mission: PackageMissionDeriveResult;
};

/** Sticky package mission ribbon. */
export function PackageMissionRibbon({ trackingLabel, statusLabel, mission }: Props) {
  const current = mission.stages.find((s) => s.id === mission.currentStageId);
  return (
    <div className="sticky top-16 z-20 rounded-xl border border-amber-200 bg-amber-50/95 px-4 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-amber-50/90">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-sm font-semibold text-slate-900">
            {trackingLabel}
          </p>
          <p className="mt-0.5 text-sm text-slate-700">
            Current: <span className="font-semibold">{current?.label ?? '—'}</span>
            <span className="text-slate-500"> · {mission.primaryAction}</span>
          </p>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-700 ring-1 ring-slate-200">
          {statusLabel}
        </span>
      </div>
      <ol className="mt-3 flex flex-wrap gap-1.5">
        {mission.stages.map((stage) => {
          const isCurrent = stage.id === mission.currentStageId;
          return (
            <li
              key={stage.id}
              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                stage.done
                  ? 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200'
                  : isCurrent
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-white text-slate-500 ring-1 ring-slate-200'
              }`}
            >
              {stage.done ? '✓ ' : isCurrent ? '→ ' : ''}
              {stage.label}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
