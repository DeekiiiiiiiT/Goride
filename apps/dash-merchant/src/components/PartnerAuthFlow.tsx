import { useState } from 'react';
import AuthEntryPage from '../components/store-tablet/AuthEntryPage';
import OnboardingCarouselPage from '../pages/OnboardingCarouselPage';
import LoginPage from '../pages/LoginPage';

type AuthStep = 'welcome' | 'onboarding' | 'login' | 'store-tablet';

interface PartnerAuthFlowProps {
  onLoginSuccess: () => void;
  onStoreTablet?: () => void;
  inviteMode?: boolean;
  onCancel?: () => void;
}

export default function PartnerAuthFlow({
  onLoginSuccess,
  onStoreTablet,
  inviteMode = false,
  onCancel,
}: PartnerAuthFlowProps) {
  const [step, setStep] = useState<AuthStep>(inviteMode ? 'login' : 'welcome');
  const [signUpMode, setSignUpMode] = useState(false);

  if (!inviteMode && step === 'welcome') {
    return (
      <AuthEntryPage
        onOwnerSignIn={() => {
          setSignUpMode(false);
          setStep('login');
        }}
        onStoreTablet={() => {
          if (onStoreTablet) {
            onStoreTablet();
            return;
          }
          window.location.href = '/tablet';
        }}
      />
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
      onApply={inviteMode ? undefined : () => setStep('onboarding')}
      onSuccess={onLoginSuccess}
    />
  );
}
