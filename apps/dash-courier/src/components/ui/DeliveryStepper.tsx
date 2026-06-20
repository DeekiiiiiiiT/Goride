import React from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';

export type DeliveryStep = {
  id: string;
  label: string;
  status: 'completed' | 'active' | 'pending';
};

type DeliveryStepperProps = {
  steps: DeliveryStep[];
};

export function DeliveryStepper({ steps }: DeliveryStepperProps) {
  const activeIndex = steps.findIndex((s) => s.status === 'active');
  const completedCount = steps.filter((s) => s.status === 'completed').length;
  const progressPct =
    steps.length > 1 ? ((completedCount + (activeIndex >= 0 ? 0.5 : 0)) / (steps.length - 1)) * 100 : 0;

  return (
    <div className="flex items-center justify-between relative w-full">
      <div className="absolute left-4 right-4 top-[22px] h-0.5 bg-surface-variant z-0" />
      <div
        className="absolute left-4 top-[22px] h-0.5 bg-primary-container z-0 transition-all duration-500"
        style={{ width: `calc(${Math.min(progressPct, 100)}% - 32px)` }}
      />
      {steps.map((step) => (
        <div key={step.id} className="flex flex-col items-center gap-1 relative z-10">
          <div
            className={`w-11 h-11 rounded-full flex items-center justify-center border-2 transition-colors ${
              step.status === 'completed'
                ? 'bg-primary-container border-primary-container text-on-primary-container'
                : step.status === 'active'
                  ? 'bg-surface border-primary text-primary shadow-md'
                  : 'bg-surface border-surface-variant text-muted'
            }`}
          >
            {step.status === 'completed' ? (
              <MaterialIcon name="check" className="text-lg" filled />
            ) : (
              <MaterialIcon name="local_shipping" className="text-lg" />
            )}
          </div>
          <span
            className={`text-[11px] font-medium ${
              step.status === 'active' ? 'text-primary' : 'text-muted'
            }`}
          >
            {step.label}
          </span>
        </div>
      ))}
    </div>
  );
}
