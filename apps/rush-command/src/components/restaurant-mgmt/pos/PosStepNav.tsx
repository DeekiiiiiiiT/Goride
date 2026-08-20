import type { PosStep } from './pos-types';

interface PosStepNavProps {
  step: PosStep;
}

const STEPS = [
  { key: 'register' as const, label: 'Menu', index: 0 },
  { key: 'checkout' as const, label: 'Order type', index: 1 },
  { key: 'payment' as const, label: 'Payment', index: 2 },
];

function activeIndex(step: PosStep) {
  if (step === 'payment' || step === 'success') return 2;
  if (step === 'checkout') return 1;
  return 0;
}

export default function PosStepNav({ step }: PosStepNavProps) {
  const current = activeIndex(step);

  return (
    <nav className="flex shrink-0 items-center border-b border-surface-variant bg-surface-container px-margin-mobile py-2 md:px-margin-tablet">
      <ol className="flex w-full items-center space-x-6 md:space-x-8">
        {STEPS.map((entry) => {
          const active = entry.index === current;
          const done = entry.index < current;
          return (
            <li
              key={entry.key}
              className={`relative top-px flex items-center pb-2 pt-2 ${
                active
                  ? 'border-b-2 border-primary font-bold text-primary'
                  : 'text-on-surface-variant'
              }`}
            >
              <span
                className={`mr-2 flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                  active
                    ? 'bg-primary text-on-primary'
                    : done
                      ? 'bg-primary-container text-on-primary-container'
                      : 'bg-surface-variant text-on-surface-variant'
                }`}
              >
                {entry.index + 1}
              </span>
              <span className="text-label-lg">{entry.label}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
