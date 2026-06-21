import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { DEFAULT_PROMOTIONS } from '../lib/promotions-mock-data';
import {
  buildPromotionTitle,
  generatePromoCode,
  parseAmount,
  Promotion,
  PromotionFormData,
  PromotionType,
} from '../types/promotions';

function promotionsKey(merchantId: string) {
  return `roam_promotions_${merchantId}`;
}

function loadPromotions(merchantId: string): Promotion[] {
  try {
    const raw = localStorage.getItem(promotionsKey(merchantId));
    if (!raw) return DEFAULT_PROMOTIONS;
    return JSON.parse(raw) as Promotion[];
  } catch {
    return DEFAULT_PROMOTIONS;
  }
}

function savePromotions(merchantId: string, promotions: Promotion[]) {
  localStorage.setItem(promotionsKey(merchantId), JSON.stringify(promotions));
}

const emptyForm = (): PromotionFormData => ({
  type: 'percent_off',
  discountValue: '20',
  minOrder: '',
  appliesTo: 'entire_order',
  promoCode: 'ROAM20OFF',
  autoGenerateCode: false,
  dateStart: new Date().toISOString().slice(0, 10),
  dateEnd: '',
  customerEligibility: 'all',
  usageLimitType: 'unlimited',
  usageLimit: '',
});

export function usePromotions(merchantId: string) {
  const [promotions, setPromotions] = useState<Promotion[]>(() => loadPromotions(merchantId));
  const [form, setForm] = useState<PromotionFormData>(emptyForm);

  useEffect(() => {
    setPromotions(loadPromotions(merchantId));
  }, [merchantId]);

  const updateForm = useCallback((updates: Partial<PromotionFormData>) => {
    setForm((current) => ({ ...current, ...updates }));
  }, []);

  const setPromotionType = useCallback((type: PromotionType) => {
    setForm((current) => ({
      ...current,
      type,
      discountValue: type === 'percent_off' ? '20' : type === 'amount_off' ? '500' : '',
    }));
  }, []);

  const setAutoGenerateCode = useCallback((enabled: boolean) => {
    setForm((current) => ({
      ...current,
      autoGenerateCode: enabled,
      promoCode: enabled ? generatePromoCode() : current.promoCode,
    }));
  }, []);

  const createPromotion = useCallback(() => {
    if (form.type === 'percent_off' || form.type === 'amount_off') {
      if (!form.discountValue.trim()) {
        toast.error('Enter a discount value');
        return false;
      }
    }

    if (!form.promoCode.trim()) {
      toast.error('Enter a promo code');
      return false;
    }

    const minOrderValue = form.minOrder ? parseAmount(form.minOrder) : undefined;
    const title = buildPromotionTitle(form.type, form.discountValue, form.minOrder);
    const usageLimitPerCustomer =
      form.usageLimitType === 'per_user'
        ? 1
        : form.usageLimitType === 'limited' && form.usageLimit
          ? Number(form.usageLimit)
          : undefined;

    const promotion: Promotion = {
      id: crypto.randomUUID(),
      type: form.type,
      title,
      discountPercent: form.type === 'percent_off' ? Number(form.discountValue) : undefined,
      discountAmount: form.type === 'amount_off' ? Number(form.discountValue) : undefined,
      minOrder: minOrderValue,
      appliesTo: form.appliesTo,
      promoCode: form.promoCode.trim().toUpperCase(),
      customerEligibility: form.customerEligibility,
      dateStart: form.dateStart,
      dateEnd: form.dateEnd || undefined,
      usageLimitPerCustomer,
      redemptions: 0,
      status: 'active',
    };

    setPromotions((current) => {
      const next = [promotion, ...current];
      savePromotions(merchantId, next);
      return next;
    });
    setForm(emptyForm());
    toast.success('Promotion created');
    return true;
  }, [form, merchantId]);

  const activePromotions = promotions.filter((promotion) => promotion.status === 'active');

  return {
    promotions,
    activePromotions,
    form,
    updateForm,
    setPromotionType,
    setAutoGenerateCode,
    createPromotion,
    resetForm: () => setForm(emptyForm()),
  };
}
