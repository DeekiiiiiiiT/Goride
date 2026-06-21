import { useState } from 'react';
import WelcomePage from '../pages/WelcomePage';
import OnboardingCarouselPage from '../pages/OnboardingCarouselPage';
import LoginPage from '../pages/LoginPage';

type AuthStep = 'welcome' | 'onboarding' | 'login';

interface PartnerAuthFlowProps {
  onLoginSuccess: () => void;
}

export default function PartnerAuthFlow({ onLoginSuccess }: PartnerAuthFlowProps) {
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
      onBack={() => setStep(signUpMode ? 'onboarding' : 'welcome')}
      onApply={() => setStep('onboarding')}
      onSuccess={onLoginSuccess}
    />
  );
}
