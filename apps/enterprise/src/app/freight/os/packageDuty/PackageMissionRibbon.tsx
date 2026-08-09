import type { PackageMissionDeriveResult } from '@/app/freight/os/packageMissionStages';

type Props = {
  trackingLabel: string;
  statusLabel: string;
  mission: PackageMissionDeriveResult;
};

/** Sticky package mission ribbon — tracking primary, quiet stage track. */
export function PackageMissionRibbon({ trackingLabel, statusLabel, mission }: Props) {
  const current = mission.stages.find((s) => s.id === mission.currentStageId);
  return (
    <div className="sticky top-16 z-20 rounded-xl border border-amber-200 bg-amber-50/95 px-4 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-amber-50/90">
      <div className="min-w-0">
        <p className="truncate font-mono text-sm font-semibold text-slate-900">
          {trackingLabel}
        </p>
        <p className="mt-0.5 text-sm text-slate-700">
          <span className="font-semibold">{current?.label ?? '—'}</span>
          <span className="text-slate-500"> · {mission.primaryAction}</span>
          <span className="text-slate-400"> · {statusLabel}</span>
        </p>
      </div>
      <ol className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
        {mission.stages.map((stage, i) => {
          const isCurrent = stage.id === mission.currentStageId;
          return (
            <li key={stage.id} className="flex items-center gap-1.5">
              {i > 0 ? <span className="text-slate-300" aria-hidden>·</span> : null}
              <span
                className={
                  stage.done
                    ? 'text-slate-500'
                    : isCurrent
                      ? 'font-semibold text-amber-900'
                      : 'text-slate-400'
                }
              >
                {stage.done ? `✓ ${stage.label}` : stage.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
