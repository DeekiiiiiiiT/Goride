import { useState } from 'react';
import WelcomePage from '../pages/WelcomePage';
import OnboardingCarouselPage from '../pages/OnboardingCarouselPage';
import LoginPage from '../pages/LoginPage';
import PartnerSignUpFlow from '../signup/PartnerSignUpFlow';
import { INITIAL_SIGN_UP_DATA, SignUpFormData } from '../signup/types';

type AuthStep = 'welcome' | 'onboarding' | 'signup' | 'login';

interface PartnerAuthFlowProps {
  onLoginSuccess: () => void;
  onSignUpComplete: (data: SignUpFormData) => void;
}

export default function PartnerAuthFlow({ onLoginSuccess, onSignUpComplete }: PartnerAuthFlowProps) {
  const [step, setStep] = useState<AuthStep>('welcome');
  const [signUpMode, setSignUpMode] = useState(false);
  const [signUpData, setSignUpData] = useState<SignUpFormData>(INITIAL_SIGN_UP_DATA);

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
          setStep('signup');
        }}
      />
    );
  }

  if (step === 'signup') {
    return (
      <PartnerSignUpFlow
        onBack={() => setStep('onboarding')}
        onComplete={(data) => {
          setSignUpData(data);
          setSignUpMode(true);
          setStep('login');
        }}
      />
    );
  }

  return (
    <LoginPage
      initialSignUp={signUpMode}
      initialEmail={signUpData.email}
      onBack={() => setStep(signUpMode ? 'signup' : 'welcome')}
      onApply={() => setStep('onboarding')}
      onSuccess={() => {
        if (signUpMode) {
          onSignUpComplete(signUpData);
        } else {
          onLoginSuccess();
        }
      }}
    />
  );
}
