import React from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import type { StackedStopId } from '@/lib/mockStackedRoute';

const DEFAULT_STOP_IDS: StackedStopId[] = ['p1', 'p2', 'd1', 'd2'];

function stopShort(id: StackedStopId, index: number): string {
  if (id.startsWith('p-')) return `P${index + 1}`;
  if (id.startsWith('d-')) return `D${index - 1}`;
  if (id.startsWith('p')) return id.toUpperCase();
  if (id.startsWith('d')) return id.toUpperCase();
  return String(index + 1);
}

type StackedProgressStepperProps = {
  activeStopId: StackedStopId;
  completedStopIds: StackedStopId[];
  stopIds?: StackedStopId[];
  compact?: boolean;
};

export function StackedProgressStepper({
  activeStopId,
  completedStopIds,
  stopIds = DEFAULT_STOP_IDS,
  compact = false,
}: StackedProgressStepperProps) {
  const activeIndex = stopIds.findIndex((s) => s === activeStopId);
  const progressPct =
    stopIds.length > 1
      ? (Math.max(0, activeIndex) / (stopIds.length - 1)) * 100
      : 0;

  return (
    <div className="flex items-center justify-between relative w-full">
      <div className="absolute left-3 right-3 top-[14px] h-0.5 bg-surface-variant z-0" />
      <div
        className="absolute left-3 top-[14px] h-0.5 bg-primary z-0 transition-all duration-500"
        style={{ width: `calc(${Math.min(progressPct, 100)}% - 12px)` }}
      />

      {stopIds.map((stepId, index) => {
        const isCompleted = completedStopIds.includes(stepId);
        const isActive = stepId === activeStopId;
        const isDelivery = stepId.startsWith('d');
        const short = stopShort(stepId, index);

        return (
          <div key={stepId} className="flex flex-col items-center gap-1 relative z-10 bg-surface px-0.5">
            <div
              className={`rounded-full flex items-center justify-center border-2 transition-colors ${
                compact ? 'w-6 h-6' : isActive && !isCompleted ? 'w-8 h-8' : 'w-6 h-6'
              } ${
                isCompleted
                  ? 'bg-primary border-primary text-on-primary'
                  : isActive
                    ? isDelivery
                      ? 'bg-surface border-primary text-primary shadow-sm'
                      : 'bg-primary-container border-primary text-on-primary-container shadow-sm'
                    : 'bg-surface-variant border-surface text-muted'
              }`}
            >
              {isCompleted ? (
                <MaterialIcon name="check" className={compact ? 'text-[14px]' : 'text-base'} filled />
              ) : isActive && !isDelivery ? (
                <MaterialIcon name="restaurant" className="text-base" filled />
              ) : isActive && isDelivery ? (
                <div className="w-2.5 h-2.5 bg-primary rounded-full" />
              ) : (
                <span className="text-[11px] font-semibold">{short}</span>
              )}
            </div>
            <span
              className={`text-[11px] ${
                isActive ? 'text-primary font-bold' : isCompleted ? 'text-on-surface' : 'text-muted'
              }`}
            >
              {short}
            </span>
          </div>
        );
      })}
    </div>
  );
}
