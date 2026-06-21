import { MaterialIcon } from '@/components/icons/MaterialIcon';

export type OrderStep = {
  id: string;
  label: string;
  icon?: string;
};

type Props = {
  steps: OrderStep[];
  currentIndex: number;
  className?: string;
};

export function OrderStatusStepper({ steps, currentIndex, className = '' }: Props) {
  const progress = steps.length > 1 ? (currentIndex / (steps.length - 1)) * 100 : 0;

  return (
    <div className={className}>
      <div className="relative mt-2">
        <div className="absolute top-1/2 left-0 w-full h-1 bg-surface-variant -translate-y-1/2 rounded-full" />
        <div
          className="absolute top-1/2 left-0 h-1 bg-primary -translate-y-1/2 rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
        <div className="flex justify-between relative z-10">
          {steps.map((step, i) => {
            const done = i < currentIndex;
            const active = i === currentIndex;
            return (
              <div
                key={step.id}
                className={`flex items-center justify-center border-2 border-surface shadow-sm rounded-full ${
                  active
                    ? 'w-6 h-6 bg-primary tracking-pulse-animation'
                    : done
                      ? 'w-4 h-4 bg-primary'
                      : 'w-4 h-4 bg-surface-variant'
                }`}
              >
                {active && step.icon && (
                  <MaterialIcon name={step.icon} className="text-[12px] text-on-primary" filled />
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex justify-between mt-2 text-[10px] text-label-sm text-on-surface-variant">
        {steps.map((step, i) => (
          <span
            key={step.id}
            className={i === currentIndex ? 'text-primary font-semibold' : i > currentIndex ? 'text-outline-variant' : ''}
          >
            {step.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export const DEFAULT_ORDER_STEPS: OrderStep[] = [
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'preparing', label: 'Preparing' },
  { id: 'on-way', label: 'On the Way', icon: 'two_wheeler' },
  { id: 'delivered', label: 'Delivered' },
];
