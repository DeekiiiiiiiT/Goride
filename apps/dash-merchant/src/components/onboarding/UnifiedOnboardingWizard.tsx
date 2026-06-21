import { useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { isLocationComplete } from '@roam/location';
import { INITIAL_SIGN_UP_DATA, SignUpFormData } from '../../signup/types';
import RestaurantInfoStep from '../../signup/steps/RestaurantInfoStep';
import LocationStep from '../../signup/steps/LocationStep';
import BusinessDetailsStep from '../../signup/steps/BusinessDetailsStep';
import VerificationStep from '../../signup/steps/VerificationStep';
import BankDetailsStep from '../../signup/steps/BankDetailsStep';
import ContactHoursBrandingStep, {
  createDefaultHours,
  type DayHours,
} from './ContactHoursBrandingStep';
import {
  saveBankAccount,
  saveMerchantHours,
  submitMerchantApplication,
} from '../../lib/partner-api';

const DRAFT_KEY = 'roam_partner_wizard_draft';

type WizardStep =
  | 'restaurant-info'
  | 'location'
  | 'business-details'
  | 'contact-hours'
  | 'verification'
  | 'bank-details';

interface WizardDraft {
  step: WizardStep;
  formData: SignUpFormData;
  hours: DayHours[];
}

interface UnifiedOnboardingWizardProps {
  session: Session;
  onComplete: () => void;
}

function loadDraft(): WizardDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WizardDraft;
  } catch {
    return null;
  }
}

function saveDraft(step: WizardStep, formData: SignUpFormData, hours: DayHours[]) {
  const safe: SignUpFormData = {
    ...formData,
    idFrontFile: null,
    idBackFile: null,
    proofOfBusinessFile: null,
    accountNumber: '',
    routingNumber: '',
  };
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ step, formData: safe, hours }));
}

function clearDraft() {
  sessionStorage.removeItem(DRAFT_KEY);
}

export default function UnifiedOnboardingWizard({ session, onComplete }: UnifiedOnboardingWizardProps) {
  const draft = loadDraft();
  const [step, setStep] = useState<WizardStep>(draft?.step || 'restaurant-info');
  const [formData, setFormData] = useState<SignUpFormData>(() => ({
    ...INITIAL_SIGN_UP_DATA,
    ...draft?.formData,
    email: draft?.formData?.email || session.user.email || '',
  }));
  const [hours, setHours] = useState<DayHours[]>(draft?.hours || createDefaultHours());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    saveDraft(step, formData, hours);
  }, [step, formData, hours]);

  const updateForm = (patch: Partial<SignUpFormData>) => {
    setFormData((current) => ({ ...current, ...patch }));
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

      clearDraft();
      toast.success('Application submitted for review');
      onComplete();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit application');
    } finally {
      setSubmitting(false);
    }
  };

  switch (step) {
    case 'restaurant-info':
      return (
        <RestaurantInfoStep
          data={formData}
          onChange={updateForm}
          onBack={() => {}}
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
          onContinue={() => setStep('contact-hours')}
        />
      );
    case 'contact-hours':
      return (
        <ContactHoursBrandingStep
          data={formData}
          hours={hours}
          onChange={updateForm}
          onHoursChange={setHours}
          onBack={() => setStep('business-details')}
          onContinue={() => setStep('verification')}
        />
      );
    case 'verification':
      return (
        <VerificationStep
          data={formData}
          onChange={updateForm}
          onBack={() => setStep('contact-hours')}
          onContinue={() => setStep('bank-details')}
          enableUpload
        />
      );
    case 'bank-details':
      return (
        <BankDetailsStep
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
}
