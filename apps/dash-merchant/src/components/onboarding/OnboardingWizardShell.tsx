import { ReactNode } from 'react';
import { Session } from '@supabase/supabase-js';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import {
  OnboardingBottomNav,
  OnboardingHeader,
} from './OnboardingShell';
import { PartnerAccountFooter } from './PartnerAccountFooter';
import { WIZARD_STEPS, WIZARD_TOTAL_STEPS } from '../../lib/partner-onboarding-config';

interface WizardStepperProps {
  currentStep: number;
}

function WizardStepper({ currentStep }: WizardStepperProps) {
  return (
    <div className="flex w-full items-center px-inset-sm py-inset-xs">
      {WIZARD_STEPS.map((step, index) => {
        const completed = currentStep > step.id;
        const active = currentStep === step.id;
        const isLast = index === WIZARD_STEPS.length - 1;

        return (
          <div key={step.key} className={`flex items-center ${isLast ? '' : 'flex-1'}`}>
            <div className="flex flex-col items-center gap-inset-base">
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

export interface OnboardingWizardShellProps {
  currentStep: number;
  session: Session;
  children: ReactNode;
  showBack?: boolean;
  onBack?: () => void;
  onContinue?: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
  isLoading?: boolean;
  showBottomNav?: boolean;
  bottomLayout?: 'row' | 'stacked';
  mainClassName?: string;
}

export default function OnboardingWizardShell({
  currentStep,
  session,
  children,
  showBack = true,
  onBack,
  onContinue,
  continueLabel = 'Continue',
  continueDisabled = false,
  isLoading = false,
  showBottomNav = true,
  bottomLayout = 'row',
  mainClassName = '',
}: OnboardingWizardShellProps) {
  const headerSetup = currentStep === 1;

  return (
    <div className="flex min-h-dvh flex-col bg-background pb-28 font-body-lg text-on-background antialiased">
      <OnboardingHeader showSetupTitle={headerSetup} currentStep={currentStep} />

      <main
        className={`mx-auto flex w-full max-w-lg flex-1 flex-col gap-inset-md px-margin-mobile pt-24 ${mainClassName}`}
      >
        <WizardStepper currentStep={currentStep} />
        {children}
        <p className="text-center text-label-sm text-on-surface-variant">
          Step {currentStep} of {WIZARD_TOTAL_STEPS}
        </p>
        <PartnerAccountFooter email={session.user.email} className="mt-inset-xs" />
      </main>

      {showBottomNav && onContinue && (
        <OnboardingBottomNav
          showBack={showBack && !!onBack}
          onBack={onBack}
          onContinue={onContinue}
          continueLabel={continueLabel}
          continueDisabled={continueDisabled}
          isLoading={isLoading}
          layout={bottomLayout}
        />
      )}
    </div>
  );
}
