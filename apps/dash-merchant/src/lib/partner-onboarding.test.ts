import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INITIAL_SIGN_UP_DATA } from '../signup/types';
import {
  canContinueBusinessInfoStep,
  canContinueContactHoursStep,
  isValidBusinessEmail,
} from './partner-onboarding-validation';
import {
  loadPartnerWizardDraft,
  savePartnerWizardDraft,
} from './partner-wizard-draft';
import {
  PARTNER_WIZARD_DRAFT_KEY,
  PARTNER_WIZARD_DRAFT_VERSION,
  clearPartnerWizardDraft,
} from './partnerAuth';
import type { DayHours } from '../components/onboarding/ContactHoursBrandingContent';

const defaultHours: DayHours[] = Array.from({ length: 7 }, () => ({
  open: '09:00',
  close: '21:00',
  isClosed: false,
}));

const sessionStore = new Map<string, string>();

beforeEach(() => {
  sessionStore.clear();
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => sessionStore.get(key) ?? null,
    setItem: (key: string, value: string) => {
      sessionStore.set(key, value);
    },
    removeItem: (key: string) => {
      sessionStore.delete(key);
    },
  });
});

describe('partner-onboarding-validation', () => {
  it('validates business email', () => {
    expect(isValidBusinessEmail('owner@restaurant.com')).toBe(true);
    expect(isValidBusinessEmail('not-an-email')).toBe(false);
  });

  it('requires name, business type, and cuisine on step 1', () => {
    expect(canContinueBusinessInfoStep(INITIAL_SIGN_UP_DATA)).toBe(false);
    expect(
      canContinueBusinessInfoStep({
        ...INITIAL_SIGN_UP_DATA,
        restaurantName: 'Test Kitchen',
        businessType: 'restaurant',
        cuisineTypes: ['Jamaican'],
      }),
    ).toBe(true);
  });

  it('does not require phone/email on step 1 (collected on step 4)', () => {
    const data = {
      ...INITIAL_SIGN_UP_DATA,
      restaurantName: 'Test Kitchen',
      businessType: 'restaurant' as const,
      cuisineTypes: ['Jamaican'],
      phone: '',
      email: '',
    };
    expect(canContinueBusinessInfoStep(data)).toBe(true);
    expect(canContinueContactHoursStep(data)).toBe(false);
  });
});

describe('partner-wizard-draft', () => {
  it('round-trips draft with current version', () => {
    clearPartnerWizardDraft();
    const formData = {
      ...INITIAL_SIGN_UP_DATA,
      restaurantName: 'Draft Test',
      businessType: 'restaurant' as const,
      cuisineTypes: ['Pizza'],
    };
    savePartnerWizardDraft('location', formData, defaultHours);
    const loaded = loadPartnerWizardDraft();
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.draft.version).toBe(PARTNER_WIZARD_DRAFT_VERSION);
      expect(loaded.draft.step).toBe('location');
      expect(loaded.draft.formData.restaurantName).toBe('Draft Test');
    }
    clearPartnerWizardDraft();
  });

  it('rejects stale draft versions', () => {
    clearPartnerWizardDraft();
    sessionStorage.setItem(
      PARTNER_WIZARD_DRAFT_KEY,
      JSON.stringify({
        version: 1,
        step: 'restaurant-info',
        formData: INITIAL_SIGN_UP_DATA,
        hours: defaultHours,
      }),
    );
    const loaded = loadPartnerWizardDraft();
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) {
      expect(loaded.reason).toBe('version_mismatch');
    }
    expect(sessionStorage.getItem(PARTNER_WIZARD_DRAFT_KEY)).toBeNull();
  });
});
