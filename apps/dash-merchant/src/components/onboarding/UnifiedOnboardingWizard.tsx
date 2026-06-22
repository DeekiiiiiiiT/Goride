import { useEffect, useRef, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { isLocationComplete } from '@roam/location';
import { getBusinessTypeConfig } from '@roam/vertical-config';
import { INITIAL_SIGN_UP_DATA, SignUpFormData } from '../../signup/types';
import BusinessInfoStep from './BusinessInfoStep';
import { useMerchantBusinessTypes } from '../../hooks/useMerchantBusinessTypes';
import LocationStepContent from './LocationStepContent';
import BusinessDetailsStepContent from './BusinessDetailsStepContent';
import ContactHoursBrandingContent, { createDefaultHours, type DayHours } from './ContactHoursBrandingContent';
import VerificationStepContent from './VerificationStepContent';
import BankDetailsStepContent from './BankDetailsStepContent';
import OnboardingWizardShell from './OnboardingWizardShell';
import {
  bootstrapPartnerMerchant,
  saveBankAccount,
  saveMerchantHours,
  saveOnboardingDraft,
  submitMerchantApplication,
} from '../../lib/partner-api';
import {
  type WizardStepId,
  wizardStepNumber,
  nextWizardStep,
  prevWizardStep,
} from '../../lib/partner-onboarding-config';
import { canContinueWizardStep } from '../../lib/partner-onboarding-validation';
import {
  formDataToOnboardingDraft,
  hoursFromOnboardingDraft,
  isWizardStepId,
  onboardingDraftToFormData,
} from '../../lib/partner-onboarding-draft-sync';
import {
  loadPartnerWizardDraft,
  savePartnerWizardDraft,
} from '../../lib/partner-wizard-draft';
import { clearPartnerWizardDraft } from '../../lib/partnerAuth';
import type { Merchant } from '../../hooks/useMerchant';

interface UnifiedOnboardingWizardProps {
  session: Session;
  serverMerchant?: Merchant | null;
  onComplete: () => void;
}

function initFormData(session: Session, draftData?: Partial<SignUpFormData>): SignUpFormData {
  return {
    ...INITIAL_SIGN_UP_DATA,
    ...draftData,
    email: draftData?.email || session.user.email || '',
  };
}

function resolveInitialState(
  session: Session,
  serverMerchant?: Merchant | null,
) {
  const defaultHours = createDefaultHours();
  const sessionDraft = loadPartnerWizardDraft();

  if (serverMerchant?.onboarding_status === 'draft') {
    const serverDraft = serverMerchant.onboarding_draft as Record<string, unknown> | undefined;
    const stepKey = isWizardStepId(serverMerchant.wizard_step_key)
      ? serverMerchant.wizard_step_key
      : sessionDraft.ok
        ? sessionDraft.draft.step
        : 'restaurant-info';
    return {
      step: stepKey as WizardStepId,
      formData: initFormData(
        session,
        onboardingDraftToFormData(serverDraft, session.user.email || ''),
      ),
      hours: hoursFromOnboardingDraft(serverDraft, defaultHours),
      versionMismatch: false,
    };
  }

  return {
    step: (sessionDraft.ok ? sessionDraft.draft.step : 'restaurant-info') as WizardStepId,
    formData: initFormData(session, sessionDraft.ok ? sessionDraft.draft.formData : undefined),
    hours: sessionDraft.ok && sessionDraft.draft.hours.length > 0
      ? sessionDraft.draft.hours
      : defaultHours,
    versionMismatch: !sessionDraft.ok && sessionDraft.reason === 'version_mismatch',
  };
}

export default function UnifiedOnboardingWizard({
  session,
  serverMerchant,
  onComplete,
}: UnifiedOnboardingWizardProps) {
  const initial = useState(() => resolveInitialState(session, serverMerchant))[0];
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { sections } = useMerchantBusinessTypes();

  const [step, setStep] = useState<WizardStepId>(initial.step);
  const [formData, setFormData] = useState<SignUpFormData>(initial.formData);
  const [hours, setHours] = useState<DayHours[]>(initial.hours);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (initial.versionMismatch) {
      toast.info('Your saved progress was reset. Please start again.');
    }
  }, [initial.versionMismatch]);

  const stepNumber = wizardStepNumber(step);
  const enableUpload = true;
  const typeConfig = getBusinessTypeConfig(sections, formData.businessType);

  useEffect(() => {
    savePartnerWizardDraft(step, formData, hours);

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void saveOnboardingDraft({
        wizardStepKey: step,
        wizardStep: stepNumber,
        draft: formDataToOnboardingDraft(formData, hours) as Record<string, unknown>,
      }).catch(() => undefined);
    }, 500);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [step, formData, hours, stepNumber]);

  useEffect(() => {
    if (step !== 'verification') return;
    void bootstrapPartnerMerchant().catch(() => undefined);
  }, [step]);

  const updateForm = (patch: Partial<SignUpFormData>) => {
    setFormData((current) => ({ ...current, ...patch }));
  };

  const goNext = () => {
    const next = nextWizardStep(step);
    if (next) setStep(next);
  };

  const goBack = () => {
    const prev = prevWizardStep(step);
    if (prev) setStep(prev);
  };

  const handleSubmitApplication = async (skipBank = false) => {
    if (!isLocationComplete(formData.location)) {
      toast.error('Please confirm your restaurant location on the map');
      setStep('location');
      return;
    }

    setSubmitting(true);
    try {
      const loc = formData.location!;
      const address = [loc.streetAddress, loc.city, loc.postalCode].filter(Boolean).join(', ');
      const result = await submitMerchantApplication({
        name: formData.restaurantName,
        phone: formData.phone,
        email: formData.email,
        address,
        businessType: formData.businessType || undefined,
        cuisineTypes: formData.cuisineTypes,
        inventoryCategories: formData.inventoryCategories,
        cuisineType: formData.cuisineTypes[0],
        streetAddress: loc.streetAddress,
        city: loc.city,
        postalCode: loc.postalCode,
        lat: loc.lat,
        lng: loc.lng,
        businessRegistrationNumber: formData.businessRegistrationNumber || undefined,
        taxId: formData.taxId || undefined,
        avgPrepTimeMins: parseInt(formData.avgPrepTime.replace(/\D/g, ''), 10) || 15,
        deliveryRadiusKm: parseInt(formData.deliveryRadius.replace(/\D/g, ''), 10) || 5,
        ownerFullName: formData.ownerFullName,
        description: formData.description || undefined,
        website: formData.website || undefined,
        logoUrl: formData.logoUrl || undefined,
        coverImageUrl: formData.coverImageUrl || undefined,
      });
      const merchant = (result as { merchant: { id: string } }).merchant;

      await saveMerchantHours(
        merchant.id,
        hours.map((h, index) => ({
          dayOfWeek: index,
          openTime: h.open,
          closeTime: h.close,
          isClosed: h.isClosed,
        })),
      );

      if (!skipBank && formData.bankName && formData.accountNumber) {
        await saveBankAccount({
          bankName: formData.bankName,
          accountHolderName: formData.accountHolderName,
          accountNumber: formData.accountNumber,
          routingNumber: formData.routingNumber,
          accountType: formData.accountType,
        });
      }

      clearPartnerWizardDraft();
      toast.success('Application submitted for review');
      onComplete();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit application');
    } finally {
      setSubmitting(false);
    }
  };

  const canContinue = canContinueWizardStep(step, formData, hours, { enableUpload, typeConfig });

  const renderStepContent = () => {
    switch (step) {
      case 'restaurant-info':
        return <BusinessInfoStep data={formData} onChange={updateForm} />;
      case 'location':
        return <LocationStepContent data={formData} onChange={updateForm} />;
      case 'business-details':
        return (
          <BusinessDetailsStepContent
            data={formData}
            onChange={updateForm}
            typeConfig={typeConfig}
            stepNumber={stepNumber}
          />
        );
      case 'contact-hours':
        return (
          <ContactHoursBrandingContent
            data={formData}
            hours={hours}
            onChange={updateForm}
            onHoursChange={setHours}
          />
        );
      case 'verification':
        return (
          <VerificationStepContent
            data={formData}
            onChange={updateForm}
            enableUpload={enableUpload}
            typeConfig={typeConfig}
          />
        );
      case 'bank-details':
        return (
          <BankDetailsStepContent
            data={formData}
            onChange={updateForm}
            onSave={() => void handleSubmitApplication(false)}
            onSkip={() => void handleSubmitApplication(true)}
            isSubmitting={submitting}
          />
        );
      default:
        return null;
    }
  };

  if (step === 'bank-details') {
    return (
      <OnboardingWizardShell
        currentStep={stepNumber}
        session={session}
        showBack
        onBack={goBack}
        showBottomNav={false}
      >
        {renderStepContent()}
      </OnboardingWizardShell>
    );
  }

  return (
    <OnboardingWizardShell
      currentStep={stepNumber}
      session={session}
      showBack={stepNumber > 1}
      onBack={goBack}
      onContinue={goNext}
      continueDisabled={!canContinue}
      isLoading={submitting}
    >
      {renderStepContent()}
    </OnboardingWizardShell>
  );
}
