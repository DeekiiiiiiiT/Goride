import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INITIAL_SIGN_UP_DATA } from '../signup/types';
import {
  canContinueBusinessInfoStep,
  canContinueContactHoursStep,
  isValidBusinessEmail,
} from './partner-onboarding-validation';
import { needsOwnerOnboarding } from './go-live';
import {
  loadPartnerWizardDraft,
  savePartnerWizardDraft,
} from './partner-wizard-draft';
import {
  PARTNER_WIZARD_DRAFT_KEY,
  PARTNER_WIZARD_DRAFT_VERSION,
  clearPartnerWizardDraft,
} from './partnerAuth';
import type { DayHours } from '../components/onboarding/operating-hours';

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

  it('requires name, business type, phone, and email on step 1', () => {
    expect(canContinueBusinessInfoStep(INITIAL_SIGN_UP_DATA)).toBe(false);
    expect(
      canContinueBusinessInfoStep({
        ...INITIAL_SIGN_UP_DATA,
        restaurantName: 'Test Kitchen',
        businessType: 'restaurant',
      }),
    ).toBe(false);
    expect(
      canContinueBusinessInfoStep({
        ...INITIAL_SIGN_UP_DATA,
        restaurantName: 'Test Kitchen',
        businessType: 'restaurant',
        phone: '8765551234',
        email: 'owner@restaurant.com',
      }),
    ).toBe(true);
  });

  it('does not require cuisine on step 1 (collected on step 2)', () => {
    const data = {
      ...INITIAL_SIGN_UP_DATA,
      restaurantName: 'Test Kitchen',
      businessType: 'restaurant' as const,
      cuisineTypes: [],
      phone: '8765551234',
      email: 'owner@restaurant.com',
    };
    expect(canContinueBusinessInfoStep(data)).toBe(true);
  });

  it('requires phone and email on step 1', () => {
    const data = {
      ...INITIAL_SIGN_UP_DATA,
      restaurantName: 'Test Kitchen',
      businessType: 'restaurant' as const,
      cuisineTypes: ['Jamaican'],
      phone: '',
      email: '',
    };
    expect(canContinueBusinessInfoStep(data)).toBe(false);
    expect(canContinueContactHoursStep(data)).toBe(false);
  });
});

describe('needsOwnerOnboarding', () => {
  it('returns true for draft merchants', () => {
    expect(
      needsOwnerOnboarding({
        onboarding_status: 'draft',
        submitted_at: null,
        name: null,
      }),
    ).toBe(true);
  });

  it('returns false for submitted merchants with name', () => {
    expect(
      needsOwnerOnboarding({
        onboarding_status: 'submitted',
        submitted_at: '2026-01-01',
        name: 'Code Blue',
      }),
    ).toBe(false);
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
