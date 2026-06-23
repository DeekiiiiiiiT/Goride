import { ReactNode } from 'react';
import { Session } from '@supabase/supabase-js';
import { WIZARD_TOTAL_STEPS } from '../../lib/partner-onboarding-config';
import {
  OnboardingBottomNav,
  OnboardingHeader,
} from './OnboardingShell';
import { PartnerAccountFooter } from './PartnerAccountFooter';

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
  mainClassName = '',
}: OnboardingWizardShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background pb-28 font-body-lg text-on-background antialiased">
      <OnboardingHeader
        currentStep={currentStep}
        onBack={showBack ? onBack : undefined}
        showSetupTitle={currentStep === WIZARD_TOTAL_STEPS}
        showProgress={currentStep !== WIZARD_TOTAL_STEPS}
      />

      <main
        className={`mx-auto flex w-full max-w-2xl flex-1 flex-col gap-inset-md px-margin-mobile pt-28 md:pt-32 ${mainClassName}`}
      >
        {children}
        <PartnerAccountFooter email={session.user.email} className="mt-inset-md border-t border-outline-variant pt-inset-md" />
        <p className="pb-4 text-center text-label-sm text-on-surface-variant/70">
          © 2024 Roam Dash Partner •{' '}
          <a href="mailto:support@roamdash.com" className="text-primary underline">
            support@roamdash.com
          </a>
        </p>
      </main>

      {showBottomNav && onContinue && (
        <OnboardingBottomNav
          showBack={showBack && !!onBack}
          onBack={onBack}
          onContinue={onContinue}
          continueLabel={continueLabel}
          continueDisabled={continueDisabled}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}
