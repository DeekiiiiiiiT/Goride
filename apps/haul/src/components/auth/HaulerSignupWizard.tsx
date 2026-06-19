import React, { useState } from 'react';
import type { CreateAccountResult } from './HaulCreateAccountScreen';
import { HaulCreateAccountScreen } from './HaulCreateAccountScreen';
import { HaulVerifyAccountScreen } from './HaulVerifyAccountScreen';
import { HaulerEmailConfirmScreen } from './HaulerEmailConfirmScreen';

type Step = 'create' | 'verify-phone' | 'email-confirm';

type Props = {
  onLogin: () => void;
};

export function HaulerSignupWizard({ onLogin }: Props) {
  const [step, setStep] = useState<Step>('create');
  const [phoneE164, setPhoneE164] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');

  const handleCreateSuccess = (result: CreateAccountResult) => {
    if (result.kind === 'phone') {
      setPhoneE164(result.phoneE164);
      setStep('verify-phone');
      return;
    }
    if (result.kind === 'email') {
      setPendingEmail(result.email);
      setStep('email-confirm');
      return;
    }
    // session: AuthProvider picks up the new session automatically
  };

  if (step === 'verify-phone') {
    return (
      <HaulVerifyAccountScreen
        phoneE164={phoneE164}
        onVerified={() => {}}
        onBack={onLogin}
      />
    );
  }

  if (step === 'email-confirm') {
    return (
      <div className="relative flex min-h-[100dvh] flex-col items-center justify-center bg-[#0b1326] p-4 text-[#dae2fd] antialiased md:p-12">
        <div className="relative z-10 w-full max-w-[420px] rounded-xl border border-[#534434] bg-[#171f33]/90 p-6 shadow-2xl backdrop-blur-md md:p-8">
          <HaulerEmailConfirmScreen
            email={pendingEmail}
            onBack={() => setStep('create')}
            onSignIn={onLogin}
          />
        </div>
      </div>
    );
  }

  return <HaulCreateAccountScreen onSuccess={handleCreateSuccess} onLogin={onLogin} />;
}
