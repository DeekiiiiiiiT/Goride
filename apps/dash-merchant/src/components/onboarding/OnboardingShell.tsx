import { ReactNode } from 'react';
import { MaterialIcon } from '../../signup/components/MaterialIcon';

export const ONBOARDING_STEPS = [
  { id: 1, icon: 'store', label: 'Info' },
  { id: 2, icon: 'location_on', label: 'Location' },
  { id: 3, icon: 'call', label: 'Contact' },
  { id: 4, icon: 'schedule', label: 'Hours' },
  { id: 5, icon: 'image', label: 'Brand' },
] as const;

const inputClass =
  'input-touch h-12 w-full rounded-lg border border-outline-variant bg-transparent px-4 text-body-sm text-on-surface outline-none transition-colors placeholder:text-on-surface-variant partner-field focus:border-primary-container focus:ring-1 focus:ring-primary-container';

export { inputClass };

interface OnboardingHeaderProps {
  showSetupTitle?: boolean;
}

interface OnboardingHeaderFullProps extends OnboardingHeaderProps {
  currentStep?: number;
}

export function OnboardingHeader({ showSetupTitle, currentStep }: OnboardingHeaderFullProps) {
  if (currentStep === 5) {
    return (
      <header className="fixed top-0 z-50 flex w-full flex-col border-b border-outline-variant bg-surface px-margin-mobile pb-sm safe-t safe-x">
        <div className="flex h-16 w-full items-center justify-between">
          <MaterialIcon name="restaurant" className="text-2xl text-primary" filled />
          <h1 className="text-headline-md font-semibold tracking-tight text-primary">Roam Dash Partner</h1>
          <div className="h-6 w-6" />
        </div>
        {currentStep && <OnboardingStepper currentStep={currentStep} variant="labeled" />}
      </header>
    );
  }

  if (showSetupTitle) {
    return (
      <header className="fixed top-0 z-50 flex h-16 w-full items-center justify-center border-b border-outline-variant bg-surface px-margin-mobile shadow-sm safe-t safe-x">
        <h1 className="text-headline-md font-semibold tracking-tight text-primary">Setup</h1>
      </header>
    );
  }

  return (
    <header className="fixed top-0 z-50 flex h-16 w-full items-center justify-center border-b border-outline-variant bg-surface/90 px-margin-mobile shadow-[0_4px_12px_rgba(0,0,0,0.02)] backdrop-blur-md safe-t safe-x">
      <div className="absolute left-margin-mobile flex items-center text-primary">
        <MaterialIcon name="restaurant" filled size={22} />
      </div>
      <h1 className="text-headline-md font-semibold tracking-tight text-primary">Roam Dash Partner</h1>
    </header>
  );
}

interface OnboardingStepperProps {
  currentStep: number;
  variant?: 'compact' | 'labeled';
}

export function OnboardingStepper({ currentStep, variant = 'compact' }: OnboardingStepperProps) {
  if (variant === 'labeled') {
    const progress = ((currentStep - 1) / (ONBOARDING_STEPS.length - 1)) * 100;
    return (
      <div className="relative mt-xs flex w-full items-center justify-between px-sm">
        <div className="absolute left-8 right-8 top-1/2 z-0 h-0.5 -translate-y-1/2 bg-surface-variant" />
        <div
          className="absolute left-8 top-1/2 z-0 h-0.5 -translate-y-1/2 bg-primary-container transition-all duration-300"
          style={{ width: `calc(${progress}% - 16px)` }}
        />
        {ONBOARDING_STEPS.map((step) => {
          const completed = currentStep > step.id;
          const active = currentStep === step.id;
          return (
            <div key={step.id} className="relative z-10 flex flex-col items-center gap-1">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full ${
                  completed
                    ? 'bg-primary-container text-on-primary'
                    : active
                      ? 'border-2 border-primary-container bg-surface text-primary-container'
                      : 'bg-surface-variant text-on-surface-variant'
                }`}
              >
                {completed ? (
                  <MaterialIcon name="check" filled size={14} />
                ) : (
                  <MaterialIcon name={step.icon} filled={active} size={14} />
                )}
              </div>
              <span
                className={`text-label-sm ${active ? 'text-primary-container' : 'text-on-surface-variant'}`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex w-full items-center px-sm py-xs">
      {ONBOARDING_STEPS.map((step, index) => {
        const completed = currentStep > step.id;
        const active = currentStep === step.id;
        const isLast = index === ONBOARDING_STEPS.length - 1;

        return (
          <div key={step.id} className={`flex items-center ${isLast ? '' : 'flex-1'}`}>
            <div className="flex flex-col items-center gap-base">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full shadow-sm ${
                  completed
                    ? 'bg-primary-container text-on-primary-container'
                    : active
                      ? 'bg-primary-container text-on-primary-container ring-2 ring-primary-container ring-offset-2 ring-offset-surface'
                      : 'bg-surface-container-high text-on-surface-variant'
                } ${active && !completed ? 'scale-110' : ''}`}
              >
                {completed ? (
                  <MaterialIcon name="check" filled size={16} />
                ) : active ? (
                  <MaterialIcon name={step.icon} filled size={16} />
                ) : (
                  <span className="text-label-md font-semibold">{step.id}</span>
                )}
              </div>
            </div>
            {!isLast && (
              <div
                className={`mx-2 h-0.5 flex-1 ${completed ? 'bg-primary-container' : 'bg-surface-container-high'}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

interface OnboardingBottomNavProps {
  onBack?: () => void;
  onContinue: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
  isLoading?: boolean;
  showBack?: boolean;
  layout?: 'row' | 'stacked';
}

export function OnboardingBottomNav({
  onBack,
  onContinue,
  continueLabel = 'Continue',
  continueDisabled = false,
  isLoading = false,
  showBack = true,
  layout = 'row',
}: OnboardingBottomNavProps) {
  const stacked = layout === 'stacked';

  return (
    <nav className="fixed bottom-0 z-50 flex w-full items-center justify-between gap-sm border-t border-outline-variant bg-surface px-margin-mobile py-sm pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
      {showBack && onBack ? (
        <button
          type="button"
          onClick={onBack}
          className={`flex items-center justify-center gap-2 rounded-lg border-2 border-secondary text-secondary transition-all hover:bg-secondary-fixed active:scale-[0.98] ${
            stacked ? 'h-12 flex-col rounded-xl px-6' : 'h-12 flex-1 border border-outline px-6 text-on-surface-variant'
          }`}
        >
          <MaterialIcon name="arrow_back" size={stacked ? 20 : 18} />
          <span className="text-label-md font-semibold">Back</span>
        </button>
      ) : null}
      <button
        type="button"
        onClick={onContinue}
        disabled={continueDisabled || isLoading}
        className={`flex items-center justify-center gap-2 rounded-lg bg-primary-container text-on-primary-container shadow-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${
          stacked
            ? 'h-12 flex-col rounded-xl px-6'
            : showBack
              ? 'h-12 flex-1 px-8'
              : 'h-12 w-full px-8'
        }`}
      >
        {isLoading ? (
          <div className="partner-spinner !h-5 !w-5 !border-2" role="status" aria-label="Loading" />
        ) : (
          <>
            {continueLabel === 'Create Restaurant' && (
              <MaterialIcon name="check_circle" size={stacked ? 20 : 18} />
            )}
            <span className="text-label-md font-semibold">{isLoading ? 'Please wait...' : continueLabel}</span>
            {continueLabel === 'Continue' && (
              <MaterialIcon name="arrow_forward" size={stacked ? 20 : 18} />
            )}
          </>
        )}
      </button>
    </nav>
  );
}

interface SectionCardProps {
  children: ReactNode;
  className?: string;
}

export function SectionCard({ children, className = '' }: SectionCardProps) {
  return (
    <div
      className={`flex flex-col gap-md rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

interface SectionHeaderProps {
  icon: string;
  title: string;
  subtitle: string;
  centered?: boolean;
}

export function SectionHeader({ icon, title, subtitle, centered = false }: SectionHeaderProps) {
  if (centered) {
    return (
      <div className="flex flex-col items-center gap-xs text-center">
        <div className="mb-xs flex h-12 w-12 items-center justify-center rounded-full bg-primary-container/20 text-primary-container">
          <MaterialIcon name={icon} size={24} />
        </div>
        <h2 className="text-headline-md font-semibold text-on-background">{title}</h2>
        <p className="text-body-sm text-on-surface-variant">{subtitle}</p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-xs">
      <div className="rounded-lg bg-surface-container-low p-2 text-primary-container">
        <MaterialIcon name={icon} />
      </div>
      <div>
        <h2 className="text-headline-md font-semibold text-on-surface">{title}</h2>
        <p className="mt-1 text-body-sm text-on-surface-variant">{subtitle}</p>
      </div>
    </div>
  );
}

export function TipCard({ children, icon = 'info' }: { children: ReactNode; icon?: string }) {
  return (
    <div className="flex items-start gap-sm rounded-lg border border-primary-container/20 bg-primary-container/10 p-sm">
      <MaterialIcon name={icon} className="shrink-0 text-primary-container" />
      <p className="text-body-sm text-on-surface-variant">{children}</p>
    </div>
  );
}

export function DayToggle({
  checked,
  onChange,
  id,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  id: string;
}) {
  return (
    <label className="relative inline-flex cursor-pointer items-center">
      <input
        id={id}
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div className="peer h-6 w-12 rounded-full bg-surface-variant transition-colors peer-checked:bg-primary-container peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-container/20 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-outline-variant after:bg-white after:transition-all peer-checked:after:translate-x-6" />
    </label>
  );
}
