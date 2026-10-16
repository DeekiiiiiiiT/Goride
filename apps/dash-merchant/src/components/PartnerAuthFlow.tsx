import { useState } from 'react';
import { useAppConfig } from '@roam/rush-app-config';
import { buildCommandTabletUrl } from '@roam/merchant-ops';
import OnboardingCarouselPage from '../pages/OnboardingCarouselPage';
import LoginPage from '../pages/LoginPage';
import { MaterialIcon } from '../signup/components/MaterialIcon';

type AuthStep = 'welcome' | 'onboarding' | 'login';
type PartnerSignupMode = 'open' | 'invite_only' | 'closed';

interface PartnerAuthFlowProps {
  onLoginSuccess: () => void;
  commandOrigin?: string;
  inviteMode?: boolean;
  onCancel?: () => void;
}

export default function PartnerAuthFlow({
  onLoginSuccess,
  commandOrigin,
  inviteMode = false,
  onCancel,
}: PartnerAuthFlowProps) {
  const appConfig = useAppConfig('partner');
  const signupMode =
    (appConfig.settings['partner.signup.mode'] as PartnerSignupMode | undefined) ?? 'open';
  const signupClosed = !inviteMode && signupMode === 'closed';
  const inviteOnly = !inviteMode && signupMode === 'invite_only';
  const [step, setStep] = useState<AuthStep>(inviteMode ? 'login' : 'welcome');
  const [signUpMode, setSignUpMode] = useState(false);

  if (!inviteMode && step === 'welcome') {
    return (
      <div className="flex min-h-dvh flex-col bg-surface px-margin-mobile py-inset-xl">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center text-center">
          <img src="/assets/logo.png" alt="" className="mb-inset-md h-24 w-24 object-contain" />
          <h1 className="text-headline-lg font-bold text-on-surface">Roam Partner</h1>
          <p className="mt-inset-sm text-body-md text-on-surface-variant">
            Accept Roam Rush delivery orders and manage your menu.
          </p>
          <button
            type="button"
            onClick={() => {
              setSignUpMode(false);
              setStep('login');
            }}
            className="mt-inset-lg w-full rounded-lg bg-primary px-inset-lg py-3 text-label-lg font-semibold text-on-primary"
          >
            Sign in
          </button>
          {signupClosed ? (
            <p className="mt-inset-sm text-body-sm text-on-surface-variant">
              New partner applications are currently closed.
            </p>
          ) : inviteOnly ? (
            <p className="mt-inset-sm text-body-sm text-on-surface-variant">
              Partner signup is invite only. Open the invite link you were sent to apply.
            </p>
          ) : (
            <button
              type="button"
              onClick={() => {
                setSignUpMode(true);
                setStep('onboarding');
              }}
              className="mt-inset-sm w-full rounded-lg border border-outline-variant px-inset-lg py-3 text-label-lg font-semibold text-on-surface"
            >
              Apply to join Roam Rush
            </button>
          )}
          <a
            href={commandOrigin ? `${commandOrigin}/tablet` : buildCommandTabletUrl()}
            className="mt-inset-lg inline-flex items-center gap-2 text-label-md font-semibold text-primary"
          >
            <MaterialIcon name="tablet" />
            Store tablet? Open Roam Command
          </a>
        </div>
      </div>
    );
  }

  if (!inviteMode && step === 'onboarding') {
    return (
      <OnboardingCarouselPage
        onComplete={() => {
          setSignUpMode(true);
          setStep('login');
        }}
      />
    );
  }

  return (
    <LoginPage
      initialSignUp={signUpMode}
      inviteMode={inviteMode}
      onBack={
        inviteMode
          ? onCancel
          : () => setStep(signUpMode ? 'onboarding' : 'welcome')
      }
      onApply={
        inviteMode || signupClosed || inviteOnly
          ? undefined
          : () => setStep('onboarding')
      }
      onSuccess={onLoginSuccess}
    />
  );
}
