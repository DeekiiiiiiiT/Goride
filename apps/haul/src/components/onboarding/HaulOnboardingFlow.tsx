import React, { useState } from 'react';
import { HaulWelcomeScreen } from './HaulWelcomeScreen';
import { HaulOnboardingCarousel } from './HaulOnboardingCarousel';
import { markOnboardingComplete } from '../../lib/onboardingStorage';

export type AuthIntent = 'login' | 'signup';

type Phase = 'welcome' | 'carousel';

type Props = {
  onComplete: (intent: AuthIntent) => void;
};

export function HaulOnboardingFlow({ onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>('welcome');

  const finish = (intent: AuthIntent) => {
    markOnboardingComplete();
    onComplete(intent);
  };

  if (phase === 'welcome') {
    return (
      <HaulWelcomeScreen
        onGetStarted={() => setPhase('carousel')}
        onSignIn={() => finish('login')}
      />
    );
  }

  return (
    <HaulOnboardingCarousel
      onFinish={() => finish('signup')}
      onSkip={() => finish('login')}
    />
  );
}
