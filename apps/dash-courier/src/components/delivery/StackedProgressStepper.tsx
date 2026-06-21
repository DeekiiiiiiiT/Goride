import React from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import type { StackedStopId } from '@/lib/mockStackedRoute';

const STOP_META: { id: StackedStopId; short: string; icon: string; deliveryIcon?: string }[] = [
  { id: 'p1', short: 'P1', icon: 'check' },
  { id: 'p2', short: 'P2', icon: 'restaurant' },
  { id: 'd1', short: 'D1', icon: 'home' },
  { id: 'd2', short: 'D2', icon: 'home' },
];

type StackedProgressStepperProps = {
  activeStopId: StackedStopId;
  completedStopIds: StackedStopId[];
  compact?: boolean;
};

export function StackedProgressStepper({
  activeStopId,
  completedStopIds,
  compact = false,
}: StackedProgressStepperProps) {
  const activeIndex = STOP_META.findIndex((s) => s.id === activeStopId);
  const progressPct =
    STOP_META.length > 1
      ? (Math.max(0, activeIndex) / (STOP_META.length - 1)) * 100
      : 0;

  return (
    <div className="flex items-center justify-between relative w-full">
      <div className="absolute left-3 right-3 top-[14px] h-0.5 bg-surface-variant z-0" />
      <div
        className="absolute left-3 top-[14px] h-0.5 bg-primary z-0 transition-all duration-500"
        style={{ width: `calc(${Math.min(progressPct, 100)}% - 12px)` }}
      />

      {STOP_META.map((step) => {
        const isCompleted = completedStopIds.includes(step.id);
        const isActive = step.id === activeStopId;
        const isDelivery = step.id.startsWith('d');

        return (
          <div key={step.id} className="flex flex-col items-center gap-1 relative z-10 bg-surface px-0.5">
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
              ) : isActive && step.id === 'p2' ? (
                <MaterialIcon name="restaurant" className="text-base" filled />
              ) : isActive && isDelivery ? (
                <div className="w-2.5 h-2.5 bg-primary rounded-full" />
              ) : isActive ? (
                <MaterialIcon name="restaurant" className="text-base" filled />
              ) : (
                <span className="text-[11px] font-semibold">{step.short}</span>
              )}
            </div>
            <span
              className={`text-[11px] ${
                isActive ? 'text-primary font-bold' : isCompleted ? 'text-on-surface' : 'text-muted'
              }`}
            >
              {step.short}
            </span>
          </div>
        );
      })}
    </div>
  );
}
