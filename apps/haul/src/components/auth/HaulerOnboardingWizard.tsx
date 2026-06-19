import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useHauler } from '../../contexts/HaulerContext';
import { saveHaulerOnboarding } from '../../utils/saveHaulerOnboarding';
import { saveHaulerDocuments, completeHaulerOnboarding } from '../../utils/saveHaulerDocuments';
import { HaulProfileSetupScreen, type ProfileSetupData } from './onboarding/HaulProfileSetupScreen';
import { HaulVehicleSetupScreen, type VehicleSetupData } from './onboarding/HaulVehicleSetupScreen';
import {
  HaulDocumentsUploadScreen,
  type DocumentsFormData,
} from './onboarding/HaulDocumentsUploadScreen';
import { HaulPermissionsScreen } from './onboarding/HaulPermissionsScreen';

type Step = 'profile' | 'vehicle' | 'documents' | 'permissions';

function resolveInitialStep(onboardingStep?: string | null): Step {
  if (onboardingStep === 'permissions') return 'permissions';
  if (onboardingStep === 'documents') return 'documents';
  return 'profile';
}

export function HaulerOnboardingWizard() {
  const { user } = useAuth();
  const { profile, refreshProfile } = useHauler();
  const [step, setStep] = useState<Step>(() => resolveInitialStep(profile?.onboardingStep));
  const [profileData, setProfileData] = useState<ProfileSetupData | null>(null);

  useEffect(() => {
    if (profile?.onboardingStep) {
      setStep(resolveInitialStep(profile.onboardingStep));
    }
  }, [profile?.onboardingStep]);

  const initialPhone = user?.phone ?? '';

  const handleProfileContinue = (data: ProfileSetupData) => {
    setProfileData(data);
    setStep('vehicle');
  };

  const handleVehicleComplete = async (vehicle: VehicleSetupData) => {
    if (!user || !profileData) return;
    await saveHaulerOnboarding(user, profileData, vehicle);
    await refreshProfile();
    setStep('documents');
  };

  const handleDocumentsContinue = async (data: DocumentsFormData) => {
    if (!user) return;
    await saveHaulerDocuments(user, data.uploads, data.consent);
    await refreshProfile();
    setStep('permissions');
  };

  const handlePermissionsContinue = async () => {
    if (!user) return;
    await completeHaulerOnboarding(user.id);
    await refreshProfile();
  };

  if (step === 'permissions') {
    return (
      <HaulPermissionsScreen
        onBack={() => setStep('documents')}
        onContinue={handlePermissionsContinue}
      />
    );
  }

  if (step === 'documents') {
    return (
      <HaulDocumentsUploadScreen
        onBack={profileData ? () => setStep('vehicle') : undefined}
        onSaveDraft={() => {}}
        onContinue={handleDocumentsContinue}
      />
    );
  }

  if (step === 'vehicle' && profileData) {
    return (
      <HaulVehicleSetupScreen
        profile={profileData}
        onBack={() => setStep('profile')}
        onComplete={handleVehicleComplete}
      />
    );
  }

  return (
    <HaulProfileSetupScreen
      initialPhone={initialPhone}
      onContinue={handleProfileContinue}
    />
  );
}
