import { WIZARD_TOTAL_STEPS } from '../../lib/partner-onboarding-config';

const STEP_LABELS: Record<number, string> = {
  1: 'Business Profile',
  2: 'Location',
  3: 'Operations Setup',
  4: 'Contact & Hours',
  5: 'Verify & Compliance',
  6: 'Bank Details',
};

export function partnerWizardStepLabel(step: number): string {
  return STEP_LABELS[step] ?? 'Setup';
}

type Props = {
  currentStep: number;
  variant?: 'segments' | 'dots';
};

export function PartnerWizardProgress({ currentStep, variant = 'segments' }: Props) {
  if (variant === 'dots') {
    return (
      <div className="flex items-center gap-2">
        {Array.from({ length: WIZARD_TOTAL_STEPS }, (_, i) => {
          const n = i + 1;
          const active = n === currentStep;
          return (
            <div
              key={n}
              className={`h-1 rounded-full transition-all ${
                active ? 'w-6 bg-primary' : n < currentStep ? 'w-4 bg-primary/60' : 'w-2 bg-surface-container-highest'
              }`}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex w-full items-center gap-1">
      {Array.from({ length: WIZARD_TOTAL_STEPS }, (_, i) => {
        const n = i + 1;
        const done = n < currentStep;
        const active = n === currentStep;
        return (
          <div
            key={n}
            className={`h-2 flex-1 rounded-full transition-all ${
              done ? 'bg-primary' : active ? 'bg-primary ring-2 ring-primary ring-offset-2 ring-offset-surface' : 'bg-surface-container-highest'
            }`}
          />
        );
      })}
    </div>
  );
}

export function PartnerWizardMobileBanner({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex w-full items-center justify-between border-b border-outline-variant bg-surface px-margin-mobile py-2 md:hidden">
      <span className="text-label-md font-bold uppercase tracking-wider text-primary">
        {partnerWizardStepLabel(currentStep)}
      </span>
      <PartnerWizardProgress currentStep={currentStep} variant="dots" />
    </div>
  );
}
