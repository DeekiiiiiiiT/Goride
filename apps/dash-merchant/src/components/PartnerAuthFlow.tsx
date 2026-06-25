import { useState } from 'react';
import WelcomePage from '../pages/WelcomePage';
import OnboardingCarouselPage from '../pages/OnboardingCarouselPage';
import LoginPage from '../pages/LoginPage';

type AuthStep = 'welcome' | 'onboarding' | 'login';

interface PartnerAuthFlowProps {
  onLoginSuccess: () => void;
  inviteMode?: boolean;
  onCancel?: () => void;
}

export default function PartnerAuthFlow({
  onLoginSuccess,
  inviteMode = false,
  onCancel,
}: PartnerAuthFlowProps) {
  const [step, setStep] = useState<AuthStep>(inviteMode ? 'login' : 'welcome');
  const [signUpMode, setSignUpMode] = useState(false);

  if (!inviteMode && step === 'welcome') {
    return (
      <WelcomePage
        onGetStarted={() => setStep('onboarding')}
        onSignIn={() => {
          setSignUpMode(false);
          setStep('login');
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
