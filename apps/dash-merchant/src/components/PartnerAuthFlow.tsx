import { useState } from 'react';
import WelcomePage from '../pages/WelcomePage';
import OnboardingCarouselPage from '../pages/OnboardingCarouselPage';
import LoginPage from '../pages/LoginPage';

type AuthStep = 'welcome' | 'onboarding' | 'login';

interface PartnerAuthFlowProps {
  onLoginSuccess: () => void;
  inviteMode?: boolean;
}

export default function PartnerAuthFlow({ onLoginSuccess, inviteMode = false }: PartnerAuthFlowProps) {
  const [step, setStep] = useState<AuthStep>('welcome');
  const [signUpMode, setSignUpMode] = useState(false);

  if (step === 'welcome') {
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

  if (step === 'onboarding') {
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
      onBack={() => setStep(signUpMode ? 'onboarding' : 'welcome')}
      onApply={() => setStep('onboarding')}
      onSuccess={onLoginSuccess}
    />
  );
}
