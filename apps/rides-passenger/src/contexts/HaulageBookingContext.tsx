import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { createIdempotencyKey } from '@/lib/idempotencyKey';
import type { HaulageCatalogResponse, HaulageVariantDto } from '@roam/types/haulage';
import { getCatalogItem } from '@/hooks/useHaulageCatalog';
import type {
  HaulageBookingDraft,
  HaulageFreightItem,
  HaulagePendingItem,
  HaulagePlace,
  HaulagePrepStatus,
  HaulageStairsLevel,
  HaulageStep,
} from '@/lib/haulage/types';
import { HAULAGE_STEPS } from '@/lib/haulage/types';

function variantHasCompleteSpecs(variant: HaulageVariantDto): boolean {
  return variant.weight_kg > 0 && !Number.isNaN(variant.weight_kg);
}

const INITIAL_DRAFT: HaulageBookingDraft = {
  categoryId: null,
  items: [],
  pickup: null,
  dropoff: null,
  pickupTime: '10:00',
  paymentMethodId: null,
  stairsLevel: 'none',
  prepStatus: 'ready',
  quoteToken: null,
  quotedTotalMinor: null,
  currency: null,
};

type HaulageBookingContextValue = {
  catalog: HaulageCatalogResponse | undefined;
  catalogLoading: boolean;
  catalogError: Error | null;
  draft: HaulageBookingDraft;
  step: HaulageStep;
  stepIndex: number;
  stepCount: number;
  pendingItem: HaulagePendingItem | null;
  specSheetOpen: boolean;
  variantSheetTemplateId: string | null;
  setCategory: (categoryId: string) => void;
  openVariantSheet: (templateId: string) => void;
  closeVariantSheet: () => void;
  openSpecSheet: (pending: HaulagePendingItem) => void;
  closeSpecSheet: () => void;
  selectVariant: (pending: HaulagePendingItem) => void;
  addFreightItem: (item: Omit<HaulageFreightItem, 'clientId'>) => void;
  removeFreightItem: (clientId: string) => void;
  setPickup: (place: HaulagePlace | null) => void;
  setDropoff: (place: HaulagePlace | null) => void;
  setPickupTime: (time: string) => void;
  setPaymentMethodId: (id: string) => void;
  setStairsLevel: (level: HaulageStairsLevel) => void;
  setPrepStatus: (status: HaulagePrepStatus) => void;
  setQuote: (token: string, totalMinor: number, currency: string) => void;
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

type ProviderProps = {
  children: React.ReactNode;
  catalog?: HaulageCatalogResponse;
  catalogLoading?: boolean;
  catalogError?: Error | null;
};

export function HaulageBookingProvider({
  children,
  catalog,
  catalogLoading = false,
  catalogError = null,
}: ProviderProps) {
  const [draft, setDraft] = useState<HaulageBookingDraft>(INITIAL_DRAFT);
  const [step, setStep] = useState<HaulageStep>('category');
  const [pendingItem, setPendingItem] = useState<HaulagePendingItem | null>(null);
  const [specSheetOpen, setSpecSheetOpen] = useState(false);
  const [variantSheetTemplateId, setVariantSheetTemplateId] = useState<string | null>(null);

  const stepIndex = HAULAGE_STEPS.indexOf(step);
  const stepCount = HAULAGE_STEPS.length;

  const setCategory = useCallback((categoryId: string) => {
    setDraft((prev) => ({ ...prev, categoryId, items: [], quoteToken: null, quotedTotalMinor: null }));
    setStep('items');
  }, []);

  const openVariantSheet = useCallback((templateId: string) => {
    setVariantSheetTemplateId(templateId);
  }, []);

  const closeVariantSheet = useCallback(() => {
    setVariantSheetTemplateId(null);
  }, []);

  const openSpecSheet = useCallback((pending: HaulagePendingItem) => {
    setPendingItem(pending);
    setSpecSheetOpen(true);
    setVariantSheetTemplateId(null);
  }, []);

  const closeSpecSheet = useCallback(() => {
    setSpecSheetOpen(false);
    setPendingItem(null);
  }, []);

  const addFreightItem = useCallback(
    (item: Omit<HaulageFreightItem, 'clientId'>) => {
      setDraft((prev) => ({
        ...prev,
        items: [...prev.items, { ...item, clientId: createClientId() }],
        quoteToken: null,
        quotedTotalMinor: null,
      }));
      closeSpecSheet();
    },
    [closeSpecSheet],
  );

  const selectVariant = useCallback(
    (pending: HaulagePendingItem) => {
      const template = getCatalogItem(catalog, pending.templateId);
      const variant = template?.variants.find((v) => v.id === pending.variantId);
      const needsManual = template?.requires_manual_specs ||
        (variant ? !variantHasCompleteSpecs(variant) : true);
      if (needsManual) {
        openSpecSheet(pending);
        return;
      }
      const built = buildFreightItemFromCatalog(catalog, pending);
      if (!built) return;
      addFreightItem(built);
    },
    [catalog, openSpecSheet, addFreightItem],
  );

  const removeFreightItem = useCallback((clientId: string) => {
    setDraft((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.clientId !== clientId),
      quoteToken: null,
      quotedTotalMinor: null,
    }));
  }, []);

  const setPickup = useCallback((place: HaulagePlace | null) => {
    setDraft((prev) => ({ ...prev, pickup: place, quoteToken: null, quotedTotalMinor: null }));
  }, []);

  const setDropoff = useCallback((place: HaulagePlace | null) => {
    setDraft((prev) => ({ ...prev, dropoff: place, quoteToken: null, quotedTotalMinor: null }));
  }, []);

  const setPickupTime = useCallback((time: string) => {
    setDraft((prev) => ({ ...prev, pickupTime: time, quoteToken: null, quotedTotalMinor: null }));
  }, []);

  const setPaymentMethodId = useCallback((id: string) => {
    setDraft((prev) => ({ ...prev, paymentMethodId: id }));
  }, []);

  const setStairsLevel = useCallback((stairsLevel: HaulageStairsLevel) => {
    setDraft((prev) => ({ ...prev, stairsLevel, quoteToken: null, quotedTotalMinor: null }));
  }, []);

  const setPrepStatus = useCallback((prepStatus: HaulagePrepStatus) => {
    setDraft((prev) => ({ ...prev, prepStatus, quoteToken: null, quotedTotalMinor: null }));
  }, []);

  const setQuote = useCallback((quoteToken: string, quotedTotalMinor: number, currency: string) => {
    setDraft((prev) => ({ ...prev, quoteToken, quotedTotalMinor, currency }));
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
          return draft.quoteToken != null;
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
    setVariantSheetTemplateId(null);
  }, []);

  const value = useMemo<HaulageBookingContextValue>(
    () => ({
      catalog,
      catalogLoading,
      catalogError,
      draft,
      step,
      stepIndex,
      stepCount,
      pendingItem,
      specSheetOpen,
      variantSheetTemplateId,
      setCategory,
      openVariantSheet,
      closeVariantSheet,
      openSpecSheet,
      selectVariant,
      addFreightItem,
      removeFreightItem,
      setPickup,
      setDropoff,
      setPickupTime,
      setPaymentMethodId,
      setStairsLevel,
      setPrepStatus,
      setQuote,
      goToStep,
      goNext,
      goBack,
      reset,
      canAdvanceFromStep,
    }),
    [
      catalog,
      catalogLoading,
      catalogError,
      draft,
      step,
      stepIndex,
      stepCount,
      pendingItem,
      specSheetOpen,
      variantSheetTemplateId,
      setCategory,
      openVariantSheet,
      closeVariantSheet,
      openSpecSheet,
      selectVariant,
      addFreightItem,
      removeFreightItem,
      setPickup,
      setDropoff,
      setPickupTime,
      setPaymentMethodId,
      setStairsLevel,
      setPrepStatus,
      setQuote,
      goToStep,
      goNext,
      goBack,
      reset,
      canAdvanceFromStep,
    ],
  );

  return <HaulageBookingContext.Provider value={value}>{children}</HaulageBookingContext.Provider>;
}

export function useHaulageBooking(): HaulageBookingContextValue {
  const ctx = useContext(HaulageBookingContext);
  if (!ctx) {
    throw new Error('useHaulageBooking must be used within HaulageBookingProvider');
  }
  return ctx;
}

export function buildFreightItemFromCatalog(
  catalog: HaulageCatalogResponse | undefined,
  pending: HaulagePendingItem,
  manualSpec?: Pick<
    HaulageFreightItem,
    'lengthCm' | 'widthCm' | 'heightCm' | 'weightKg' | 'fragile' | 'requiresDisassembly'
  >,
): Omit<HaulageFreightItem, 'clientId'> | null {
  const template = getCatalogItem(catalog, pending.templateId);
  if (!template) return null;
  const variant = template.variants.find((v) => v.id === pending.variantId);
  if (!variant) return null;

  const requiresManualSpecs = template.requires_manual_specs || !variantHasCompleteSpecs(variant);

  if (requiresManualSpecs && !manualSpec) {
    return null;
  }

  return {
    categoryId: template.category_id,
    templateId: template.id,
    variantId: variant.id,
    itemTitle: template.title,
    variantLabel: variant.label,
    subtitle: template.subtitle,
    lengthCm: manualSpec?.lengthCm ?? variant.length_cm,
    widthCm: manualSpec?.widthCm ?? variant.width_cm,
    heightCm: manualSpec?.heightCm ?? variant.height_cm,
    weightKg: manualSpec?.weightKg ?? variant.weight_kg,
    fragile: manualSpec?.fragile ?? variant.fragile_default,
    requiresDisassembly: manualSpec?.requiresDisassembly ?? variant.requires_disassembly_default,
    requiresManualSpecs: false,
  };
}
