import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { createIdempotencyKey } from '@/lib/idempotencyKey';
import { getItemTemplate } from '@/lib/haulage/catalog';
import type {
  HaulageBookingDraft,
  HaulageCategoryId,
  HaulageFreightItem,
  HaulagePendingItem,
  HaulagePlace,
  HaulageStep,
} from '@/lib/haulage/types';
import { HAULAGE_STEPS } from '@/lib/haulage/types';

const INITIAL_DRAFT: HaulageBookingDraft = {
  categoryId: null,
  items: [],
  pickup: null,
  dropoff: null,
  pickupTime: '10:00',
  paymentMethodId: null,
};

type HaulageBookingContextValue = {
  draft: HaulageBookingDraft;
  step: HaulageStep;
  stepIndex: number;
  stepCount: number;
  pendingItem: HaulagePendingItem | null;
  specSheetOpen: boolean;
  setCategory: (categoryId: HaulageCategoryId) => void;
  setPendingItem: (pending: HaulagePendingItem | null) => void;
  openSpecSheet: (pending: HaulagePendingItem) => void;
  closeSpecSheet: () => void;
  addFreightItem: (
    item: Omit<HaulageFreightItem, 'clientId'>,
  ) => void;
  updateFreightItem: (clientId: string, patch: Partial<HaulageFreightItem>) => void;
  removeFreightItem: (clientId: string) => void;
  setPickup: (place: HaulagePlace | null) => void;
  setDropoff: (place: HaulagePlace | null) => void;
  setPickupTime: (time: string) => void;
  setPaymentMethodId: (id: string) => void;
  goToStep: (step: HaulageStep) => void;
  goNext: () => void;
  goBack: () => boolean;
  reset: () => void;
  canAdvanceFromStep: (step: HaulageStep) => boolean;
};

const HaulageBookingContext = createContext<HaulageBookingContextValue | null>(null);

function createClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return createIdempotencyKey();
}

export function HaulageBookingProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraft] = useState<HaulageBookingDraft>(INITIAL_DRAFT);
  const [step, setStep] = useState<HaulageStep>('category');
  const [pendingItem, setPendingItem] = useState<HaulagePendingItem | null>(null);
  const [specSheetOpen, setSpecSheetOpen] = useState(false);

  const stepIndex = HAULAGE_STEPS.indexOf(step);
  const stepCount = HAULAGE_STEPS.length;

  const setCategory = useCallback((categoryId: HaulageCategoryId) => {
    setDraft((prev) => ({ ...prev, categoryId, items: [] }));
    setStep('items');
  }, []);

  const openSpecSheet = useCallback((pending: HaulagePendingItem) => {
    setPendingItem(pending);
    setSpecSheetOpen(true);
  }, []);

  const closeSpecSheet = useCallback(() => {
    setSpecSheetOpen(false);
    setPendingItem(null);
  }, []);

  const addFreightItem = useCallback((item: Omit<HaulageFreightItem, 'clientId'>) => {
    setDraft((prev) => ({
      ...prev,
      items: [...prev.items, { ...item, clientId: createClientId() }],
    }));
    closeSpecSheet();
  }, [closeSpecSheet]);

  const updateFreightItem = useCallback(
    (clientId: string, patch: Partial<HaulageFreightItem>) => {
      setDraft((prev) => ({
        ...prev,
        items: prev.items.map((item) =>
          item.clientId === clientId ? { ...item, ...patch } : item,
        ),
      }));
    },
    [],
  );

  const removeFreightItem = useCallback((clientId: string) => {
    setDraft((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.clientId !== clientId),
    }));
  }, []);

  const setPickup = useCallback((place: HaulagePlace | null) => {
    setDraft((prev) => ({ ...prev, pickup: place }));
  }, []);

  const setDropoff = useCallback((place: HaulagePlace | null) => {
    setDraft((prev) => ({ ...prev, dropoff: place }));
  }, []);

  const setPickupTime = useCallback((time: string) => {
    setDraft((prev) => ({ ...prev, pickupTime: time }));
  }, []);

  const setPaymentMethodId = useCallback((id: string) => {
    setDraft((prev) => ({ ...prev, paymentMethodId: id }));
  }, []);

  const canAdvanceFromStep = useCallback(
    (current: HaulageStep): boolean => {
      switch (current) {
        case 'category':
          return draft.categoryId != null;
        case 'items':
          return draft.items.length > 0;
        case 'locations':
          return draft.pickup != null && draft.dropoff != null;
        case 'review':
          return true;
        case 'payment':
          return draft.paymentMethodId != null;
        default:
          return false;
      }
    },
    [draft],
  );

  const goToStep = useCallback((next: HaulageStep) => {
    setStep(next);
  }, []);

  const goNext = useCallback(() => {
    const idx = HAULAGE_STEPS.indexOf(step);
    if (idx < 0 || idx >= HAULAGE_STEPS.length - 1) return;
    if (!canAdvanceFromStep(step)) return;
    setStep(HAULAGE_STEPS[idx + 1]);
  }, [step, canAdvanceFromStep]);

  const goBack = useCallback((): boolean => {
    const idx = HAULAGE_STEPS.indexOf(step);
    if (idx <= 0) return false;
    setStep(HAULAGE_STEPS[idx - 1]);
    return true;
  }, [step]);

  const reset = useCallback(() => {
    setDraft(INITIAL_DRAFT);
    setStep('category');
    setPendingItem(null);
    setSpecSheetOpen(false);
  }, []);

  const value = useMemo<HaulageBookingContextValue>(
    () => ({
      draft,
      step,
      stepIndex,
      stepCount,
      pendingItem,
      specSheetOpen,
      setCategory,
      setPendingItem,
      openSpecSheet,
      closeSpecSheet,
      addFreightItem,
      updateFreightItem,
      removeFreightItem,
      setPickup,
      setDropoff,
      setPickupTime,
      setPaymentMethodId,
      goToStep,
      goNext,
      goBack,
      reset,
      canAdvanceFromStep,
    }),
    [
      draft,
      step,
      stepIndex,
      stepCount,
      pendingItem,
      specSheetOpen,
      setCategory,
      openSpecSheet,
      closeSpecSheet,
      addFreightItem,
      updateFreightItem,
      removeFreightItem,
      setPickup,
      setDropoff,
      setPickupTime,
      setPaymentMethodId,
      goToStep,
      goNext,
      goBack,
      reset,
      canAdvanceFromStep,
    ],
  );

  return (
    <HaulageBookingContext.Provider value={value}>{children}</HaulageBookingContext.Provider>
  );
}

export function useHaulageBooking(): HaulageBookingContextValue {
  const ctx = useContext(HaulageBookingContext);
  if (!ctx) {
    throw new Error('useHaulageBooking must be used within HaulageBookingProvider');
  }
  return ctx;
}

export function buildFreightItemFromPending(
  pending: HaulagePendingItem,
  spec: Pick<
    HaulageFreightItem,
    'lengthCm' | 'widthCm' | 'heightCm' | 'weightKg' | 'fragile' | 'requiresDisassembly'
  >,
): Omit<HaulageFreightItem, 'clientId'> | null {
  const template = getItemTemplate(pending.templateId);
  if (!template) return null;
  const variant = template.variants.find((v) => v.id === pending.variantId);
  if (!variant) return null;

  return {
    categoryId: template.categoryId,
    templateId: template.id,
    variantId: variant.id,
    variantLabelKey: variant.labelKey,
    titleKey: template.titleKey,
    subtitleKey: template.subtitleKey,
    ...spec,
  };
}
