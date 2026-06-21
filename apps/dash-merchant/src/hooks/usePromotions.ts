import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { deliveryFetch } from '../lib/partner-api';
import {
  buildPromotionTitle,
  DailyRedemption,
  generatePromoCode,
  parseAmount,
  Promotion,
  PromotionFormData,
  PromotionType,
} from '../types/promotions';

interface PromotionsResponse {
  promotions: Promotion[];
  weeklyRedemptions: DailyRedemption[];
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

export function usePromotions(_merchantId: string) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<PromotionFormData>(emptyForm);

  const query = useQuery({
    queryKey: ['merchant-promotions'],
    queryFn: () => deliveryFetch('/merchant/promotions') as Promise<PromotionsResponse>,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      deliveryFetch('/merchant/promotions', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchant-promotions'] });
      setForm(emptyForm());
      toast.success('Promotion created');
    },
    onError: (error: Error) => toast.error(error.message),
  });

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

    createMutation.mutate({
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
      status: 'active',
    });
    return true;
  }, [createMutation, form]);

  const promotions = query.data?.promotions ?? [];
  const activePromotions = promotions.filter((promotion) => promotion.status === 'active');

  return {
    promotions,
    activePromotions,
    weeklyRedemptions: query.data?.weeklyRedemptions ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    isCreating: createMutation.isPending,
    form,
    updateForm,
    setPromotionType,
    setAutoGenerateCode,
    createPromotion,
    resetForm: () => setForm(emptyForm()),
  };
}
