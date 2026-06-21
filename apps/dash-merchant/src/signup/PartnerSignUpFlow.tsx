import { useState } from 'react';
import { INITIAL_SIGN_UP_DATA, SignUpFormData } from './types';
import RestaurantInfoStep from './steps/RestaurantInfoStep';
import LocationStep from './steps/LocationStep';
import BusinessDetailsStep from './steps/BusinessDetailsStep';
import VerificationStep from './steps/VerificationStep';
import BankDetailsStep from './steps/BankDetailsStep';

export type SignUpStep =
  | 'restaurant-info'
  | 'location'
  | 'business-details'
  | 'verification'
  | 'bank-details';

interface PartnerSignUpFlowProps {
  onBack: () => void;
  onComplete: (data: SignUpFormData) => void;
}

export default function PartnerSignUpFlow({ onBack, onComplete }: PartnerSignUpFlowProps) {
  const [step, setStep] = useState<SignUpStep>('restaurant-info');
  const [formData, setFormData] = useState<SignUpFormData>(INITIAL_SIGN_UP_DATA);

  const updateForm = (patch: Partial<SignUpFormData>) => {
    setFormData((current) => ({ ...current, ...patch }));
  };

  switch (step) {
    case 'restaurant-info':
      return (
        <RestaurantInfoStep
          data={formData}
          onChange={updateForm}
          onBack={onBack}
          onContinue={() => setStep('location')}
        />
      );
    case 'location':
      return (
        <LocationStep
          data={formData}
          onChange={updateForm}
          onBack={() => setStep('restaurant-info')}
          onContinue={() => setStep('business-details')}
        />
      );
    case 'business-details':
      return (
        <BusinessDetailsStep
          data={formData}
          onChange={updateForm}
          onBack={() => setStep('location')}
          onContinue={() => setStep('verification')}
        />
      );
    case 'verification':
      return (
        <VerificationStep
          data={formData}
          onChange={updateForm}
          onBack={() => setStep('business-details')}
          onContinue={() => setStep('bank-details')}
        />
      );
    case 'bank-details':
      return (
        <BankDetailsStep
          data={formData}
          onChange={updateForm}
          onSave={() => onComplete(formData)}
          onSkip={() => onComplete(formData)}
        />
      );
    default:
      return null;
  }
}
