import type { SignUpFormData } from '../signup/types';
import type { DayHours } from '../components/onboarding/ContactHoursBrandingContent';
import {
  PARTNER_WIZARD_DRAFT_KEY,
  PARTNER_WIZARD_DRAFT_VERSION,
  clearPartnerWizardDraft,
} from './partnerAuth';
import type { WizardStepId } from './partner-onboarding-config';

export interface PartnerWizardDraft {
  version: number;
  step: WizardStepId;
  formData: SignUpFormData;
  hours: DayHours[];
}

export type LoadPartnerWizardDraftResult =
  | { ok: true; draft: PartnerWizardDraft }
  | { ok: false; reason: 'missing' | 'invalid' | 'version_mismatch' };

export function savePartnerWizardDraft(
  step: WizardStepId,
  formData: SignUpFormData,
  hours: DayHours[],
): void {
  const safe: SignUpFormData = {
    ...formData,
    idFrontFile: null,
    idBackFile: null,
    proofOfBusinessFile: null,
    accountNumber: '',
    routingNumber: '',
  };
  const payload: PartnerWizardDraft = {
    version: PARTNER_WIZARD_DRAFT_VERSION,
    step,
    formData: safe,
    hours,
  };
  sessionStorage.setItem(PARTNER_WIZARD_DRAFT_KEY, JSON.stringify(payload));
}

export function loadPartnerWizardDraft(): LoadPartnerWizardDraftResult {
  try {
    const raw = sessionStorage.getItem(PARTNER_WIZARD_DRAFT_KEY);
    if (!raw) return { ok: false, reason: 'missing' };

    const parsed = JSON.parse(raw) as Partial<PartnerWizardDraft>;
    if (!parsed.step || !parsed.formData) {
      clearPartnerWizardDraft();
      return { ok: false, reason: 'invalid' };
    }

    if (parsed.version !== PARTNER_WIZARD_DRAFT_VERSION) {
      clearPartnerWizardDraft();
      return { ok: false, reason: 'version_mismatch' };
    }

    return {
      ok: true,
      draft: {
        version: PARTNER_WIZARD_DRAFT_VERSION,
        step: parsed.step,
        formData: parsed.formData,
        hours: parsed.hours ?? [],
      },
    };
  } catch {
    clearPartnerWizardDraft();
    return { ok: false, reason: 'invalid' };
  }
}
