import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@roam/api-client';
import { supabase } from '@roam/auth-client';
import { toast } from 'sonner';
import { Merchant } from '../hooks/useMerchant';
import { fetchMerchantSettings, saveMerchantSettings } from '../lib/partner-api';

export interface TimeShift {
  open: string;
  close: string;
}

export interface DaySchedule {
  isClosed: boolean;
  shifts: TimeShift[];
}

/** @deprecated Use DaySchedule */
export interface DayHours {
  open: string;
  close: string;
  isClosed: boolean;
}

export interface SpecialDate {
  id: string;
  name: string;
  date: string;
  isClosed: boolean;
  open?: string;
  close?: string;
}

export interface HoursExtras {
  schedule: DaySchedule[];
  specialDates: SpecialDate[];
}

export const DAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export const BUSINESS_DAYS = [
  { label: 'Monday', index: 1 },
  { label: 'Tuesday', index: 2 },
  { label: 'Wednesday', index: 3 },
  { label: 'Thursday', index: 4 },
  { label: 'Friday', index: 5 },
  { label: 'Saturday', index: 6 },
  { label: 'Sunday', index: 0 },
];

const DEFAULT_SHIFT: TimeShift = { open: '09:00', close: '22:00' };

function createDefaultSchedule(): DaySchedule[] {
  return DAYS.map(() => ({ isClosed: false, shifts: [{ ...DEFAULT_SHIFT }] }));
}

function hoursExtrasKey(merchantId: string) {
  return `roam_hours_extras_${merchantId}`;
}

export function loadHoursExtras(merchantId: string): HoursExtras | null {
  try {
    const raw = localStorage.getItem(hoursExtrasKey(merchantId));
    if (!raw) return null;
    return JSON.parse(raw) as HoursExtras;
  } catch {
    return null;
  }
}

export function saveHoursExtras(merchantId: string, extras: HoursExtras) {
  localStorage.setItem(hoursExtrasKey(merchantId), JSON.stringify(extras));
}

function scheduleFromApi(
  hoursData: Array<{
    day_of_week: number;
    open_time?: string;
    close_time?: string;
    is_closed?: boolean;
  }>
): DaySchedule[] {
  return DAYS.map((_, index) => {
    const dayData = hoursData.find((entry) => entry.day_of_week === index);
    if (!dayData) return { isClosed: false, shifts: [{ ...DEFAULT_SHIFT }] };
    if (dayData.is_closed) {
      return { isClosed: true, shifts: [{ ...DEFAULT_SHIFT }] };
    }
    return {
      isClosed: false,
      shifts: [
        {
          open: dayData.open_time?.slice(0, 5) || DEFAULT_SHIFT.open,
          close: dayData.close_time?.slice(0, 5) || DEFAULT_SHIFT.close,
        },
      ],
    };
  });
}

export const CUISINE_TYPES = [
  'Jamaican',
  'Caribbean',
  'Chinese',
  'Indian',
  'Italian',
  'American',
  'Fast Food',
  'Pizza',
  'Seafood',
  'Vegetarian',
  'Vegan',
  'Bakery',
  'Cafe',
  'Mexican',
  'Japanese',
  'Thai',
  'BBQ',
  'Healthy',
  'Desserts',
  'Other',
];

export const PROFILE_CUISINE_OPTIONS = [
  'Jamaican',
  'Caribbean',
  'Grill',
  'Seafood',
  'Vegan Options',
  'Chinese',
  'Indian',
  'Italian',
  'American',
  'Fast Food',
  'Pizza',
  'Vegetarian',
  'Vegan',
  'Bakery',
  'Cafe',
  'Mexican',
  'Japanese',
  'Thai',
  'BBQ',
  'Healthy',
  'Desserts',
  'Other',
];

export interface ProfileExtras {
  website: string;
  instagram: string;
  facebook: string;
}

export interface DeliveryExtras {
  acceptsPickup: boolean;
  acceptsScheduled: boolean;
  maxDailyCapacity: string;
}

export const PREP_TIME_OPTIONS = [10, 15, 20, 30, 45, 60] as const;

export interface MerchantSettingsFormData {
  name: string;
  description: string;
  address: string;
  lat: number | null;
  lng: number | null;
  streetAddress: string;
  city: string;
  postalCode: string;
  phone: string;
  email: string;
  cuisineTypes: string[];
  avgPrepTimeMins: number;
  minOrderAmount: number;
  deliveryFee: number;
  deliveryRadiusKm: number;
  isAcceptingOrders: boolean;
  acceptsPickup: boolean;
  acceptsScheduled: boolean;
  maxDailyCapacity: string;
  logoUrl: string;
  coverImageUrl: string;
  website: string;
  instagram: string;
  facebook: string;
}

function parseCuisineTypes(cuisineType: string) {
  if (!cuisineType) return [];
  return cuisineType
    .split(/,\s*|\s*•\s*/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function profileExtrasKey(merchantId: string) {
  return `roam_profile_extras_${merchantId}`;
}

export function loadProfileExtras(merchantId: string): ProfileExtras {
  try {
    const raw = localStorage.getItem(profileExtrasKey(merchantId));
    if (!raw) return { website: '', instagram: '', facebook: '' };
    return JSON.parse(raw) as ProfileExtras;
  } catch {
    return { website: '', instagram: '', facebook: '' };
  }
}

export function saveProfileExtras(merchantId: string, extras: ProfileExtras) {
  localStorage.setItem(profileExtrasKey(merchantId), JSON.stringify(extras));
}

function deliveryExtrasKey(merchantId: string) {
  return `roam_delivery_extras_${merchantId}`;
}

function settingsMigratedKey(merchantId: string) {
  return `roam_settings_migrated_${merchantId}`;
}

export function loadDeliveryExtras(merchantId: string): DeliveryExtras {
  try {
    const raw = localStorage.getItem(deliveryExtrasKey(merchantId));
    if (!raw) {
      return { acceptsPickup: true, acceptsScheduled: true, maxDailyCapacity: '' };
    }
    return JSON.parse(raw) as DeliveryExtras;
  } catch {
    return { acceptsPickup: true, acceptsScheduled: true, maxDailyCapacity: '' };
  }
}

export function saveDeliveryExtras(merchantId: string, extras: DeliveryExtras) {
  localStorage.setItem(deliveryExtrasKey(merchantId), JSON.stringify(extras));
}

function buildFormData(merchant: Merchant): MerchantSettingsFormData {
  const extras = loadProfileExtras(merchant.id);
  const deliveryExtras = loadDeliveryExtras(merchant.id);
  const cuisineTypes = parseCuisineTypes(merchant.cuisine_type || '');

  return {
    name: merchant.name,
    description: merchant.description || '',
    address: merchant.address,
    lat: merchant.lat ?? null,
    lng: merchant.lng ?? null,
    streetAddress: merchant.address?.split(',')[0]?.trim() || '',
    city: '',
    postalCode: '',
    phone: merchant.phone || '',
    email: merchant.email || '',
    cuisineTypes: cuisineTypes.length > 0 ? cuisineTypes : merchant.cuisine_type ? [merchant.cuisine_type] : [],
    avgPrepTimeMins: merchant.avg_prep_time_mins || 30,
    minOrderAmount: merchant.min_order_amount || 0,
    deliveryFee: merchant.delivery_fee || 0,
    deliveryRadiusKm: merchant.delivery_radius_km || 10,
    isAcceptingOrders: merchant.is_accepting_orders,
    acceptsPickup: deliveryExtras.acceptsPickup,
    acceptsScheduled: deliveryExtras.acceptsScheduled,
    maxDailyCapacity: deliveryExtras.maxDailyCapacity,
    logoUrl: merchant.logo_url || '',
    coverImageUrl: merchant.cover_image_url || '',
    website: extras.website,
    instagram: extras.instagram,
    facebook: extras.facebook,
  };
}

export function useMerchantSettings(merchant: Merchant) {
  const [formData, setFormData] = useState<MerchantSettingsFormData>(() => buildFormData(merchant));
  const [hours, setHours] = useState<DaySchedule[]>(createDefaultSchedule);
  const [specialDates, setSpecialDates] = useState<SpecialDate[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState<{ hours: DaySchedule[]; specialDates: SpecialDate[] }>({
    hours: createDefaultSchedule(),
    specialDates: [],
  });
  const queryClient = useQueryClient();

  useEffect(() => {
    setFormData(buildFormData(merchant));
  }, [merchant]);

  const { data: hoursData } = useQuery({
    queryKey: ['merchant-hours', merchant.id],
    queryFn: async () => {
      const res = await fetch(`${API_ENDPOINTS.delivery}/merchants/${merchant.id}/hours`);
      if (!res.ok) return [];
      const { hours: fetchedHours } = await res.json();
      return fetchedHours;
    },
  });

  const { data: serverSettings } = useQuery({
    queryKey: ['merchant-settings', merchant.id],
    queryFn: fetchMerchantSettings,
    retry: 1,
  });

  useEffect(() => {
    if (!serverSettings?.settings) return;
    const { allows_pickup, allows_scheduled } = serverSettings.settings;
    setFormData((prev) => ({
      ...prev,
      acceptsPickup: allows_pickup,
      acceptsScheduled: allows_scheduled,
    }));

    const migrated = localStorage.getItem(settingsMigratedKey(merchant.id));
    if (migrated) return;

    const localExtras = loadDeliveryExtras(merchant.id);
    const hasLocal =
      localStorage.getItem(deliveryExtrasKey(merchant.id)) !== null;
    if (!hasLocal) {
      localStorage.setItem(settingsMigratedKey(merchant.id), '1');
      return;
    }

    void saveMerchantSettings({
      allows_pickup: localExtras.acceptsPickup,
      allows_scheduled: localExtras.acceptsScheduled,
    })
      .then(() => {
        localStorage.setItem(settingsMigratedKey(merchant.id), '1');
        localStorage.removeItem(deliveryExtrasKey(merchant.id));
      })
      .catch(() => {
        /* keep local fallback until next save */
      });
  }, [merchant.id, serverSettings]);

  useEffect(() => {
    const extras = loadHoursExtras(merchant.id);
    const apiSchedule = hoursData?.length ? scheduleFromApi(hoursData) : createDefaultSchedule();
    const nextHours = extras?.schedule?.length === 7 ? extras.schedule : apiSchedule;
    const nextSpecialDates = extras?.specialDates ?? [];

    setHours(nextHours);
    setSpecialDates(nextSpecialDates);
    setSavedSnapshot({ hours: nextHours, specialDates: nextSpecialDates });
  }, [hoursData, merchant.id]);

  const toggleDayOpen = (dayIndex: number, isOpen: boolean) => {
    setHours((prev) => {
      const updated = [...prev];
      updated[dayIndex] = {
        ...updated[dayIndex],
        isClosed: !isOpen,
        shifts: updated[dayIndex].shifts.length
          ? updated[dayIndex].shifts
          : [{ ...DEFAULT_SHIFT }],
      };
      return updated;
    });
  };

  const updateShift = (
    dayIndex: number,
    shiftIndex: number,
    field: keyof TimeShift,
    value: string
  ) => {
    setHours((prev) => {
      const updated = [...prev];
      const shifts = [...updated[dayIndex].shifts];
      shifts[shiftIndex] = { ...shifts[shiftIndex], [field]: value };
      updated[dayIndex] = { ...updated[dayIndex], shifts };
      return updated;
    });
  };

  const addShift = (dayIndex: number) => {
    setHours((prev) => {
      const updated = [...prev];
      const lastShift = updated[dayIndex].shifts[updated[dayIndex].shifts.length - 1];
      updated[dayIndex] = {
        ...updated[dayIndex],
        isClosed: false,
        shifts: [
          ...updated[dayIndex].shifts,
          { open: lastShift?.close || '17:00', close: '22:00' },
        ],
      };
      return updated;
    });
  };

  const removeShift = (dayIndex: number, shiftIndex: number) => {
    setHours((prev) => {
      const updated = [...prev];
      const shifts = updated[dayIndex].shifts.filter((_, index) => index !== shiftIndex);
      updated[dayIndex] = {
        ...updated[dayIndex],
        shifts: shifts.length ? shifts : [{ ...DEFAULT_SHIFT }],
      };
      return updated;
    });
  };

  const copyToAll = (sourceDayIndex: number) => {
    setHours((prev) => {
      const source = prev[sourceDayIndex];
      return prev.map((day) => ({
        isClosed: source.isClosed,
        shifts: source.shifts.map((shift) => ({ ...shift })),
      }));
    });
    toast.success('Hours copied to all days');
  };

  const addSpecialDate = (entry: Omit<SpecialDate, 'id'>) => {
    setSpecialDates((prev) => [...prev, { ...entry, id: crypto.randomUUID() }]);
  };

  const removeSpecialDate = (id: string) => {
    setSpecialDates((prev) => prev.filter((entry) => entry.id !== id));
  };

  const resetHours = () => {
    setHours(savedSnapshot.hours.map((day) => ({
      ...day,
      shifts: day.shifts.map((shift) => ({ ...shift })),
    })));
    setSpecialDates(savedSnapshot.specialDates.map((entry) => ({ ...entry })));
  };

  const updateMutation = useMutation({
    mutationFn: async (data: MerchantSettingsFormData) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(`${API_ENDPOINTS.delivery}/merchants/${merchant.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          name: data.name,
          description: data.description,
          address: data.address,
          lat: data.lat,
          lng: data.lng,
          phone: data.phone,
          email: data.email,
          cuisine_type: data.cuisineTypes.join(', '),
          avg_prep_time_mins: data.avgPrepTimeMins,
          min_order_amount: data.minOrderAmount,
          delivery_fee: data.deliveryFee,
          delivery_radius_km: data.deliveryRadiusKm,
          is_accepting_orders: data.isAcceptingOrders,
          logo_url: data.logoUrl,
          cover_image_url: data.coverImageUrl,
        }),
      });
      if (!res.ok) throw new Error('Failed to update settings');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-merchant'] });
    },
    onError: () => toast.error('Failed to save settings'),
  });

  const hoursMutation = useMutation({
    mutationFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const hoursPayload = hours.map((entry, index) => ({
        dayOfWeek: index,
        openTime: entry.shifts[0]?.open ?? DEFAULT_SHIFT.open,
        closeTime: entry.shifts[0]?.close ?? DEFAULT_SHIFT.close,
        isClosed: entry.isClosed,
      }));

      const res = await fetch(`${API_ENDPOINTS.delivery}/merchants/${merchant.id}/hours`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ hours: hoursPayload }),
      });
      if (!res.ok) throw new Error('Failed to update hours');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchant-hours', merchant.id] });
    },
    onError: () => toast.error('Failed to save hours'),
  });

  const saveProfile = async () => {
    saveProfileExtras(merchant.id, {
      website: formData.website,
      instagram: formData.instagram,
      facebook: formData.facebook,
    });
    await updateMutation.mutateAsync(formData);
    toast.success('Profile saved');
  };

  const saveHours = async () => {
    saveHoursExtras(merchant.id, { schedule: hours, specialDates });
    await hoursMutation.mutateAsync();
    setSavedSnapshot({
      hours: hours.map((day) => ({
        ...day,
        shifts: day.shifts.map((shift) => ({ ...shift })),
      })),
      specialDates: specialDates.map((entry) => ({ ...entry })),
    });
    toast.success('Business hours saved');
  };

  const saveDelivery = async () => {
    await saveMerchantSettings({
      allows_pickup: formData.acceptsPickup,
      allows_scheduled: formData.acceptsScheduled,
    });
    localStorage.setItem(settingsMigratedKey(merchant.id), '1');
    localStorage.removeItem(deliveryExtrasKey(merchant.id));
    await updateMutation.mutateAsync(formData);
    toast.success('Delivery settings saved');
  };

  const isSaving = updateMutation.isPending || hoursMutation.isPending;

  return {
    formData,
    setFormData,
    hours,
    specialDates,
    toggleDayOpen,
    updateShift,
    addShift,
    removeShift,
    copyToAll,
    addSpecialDate,
    removeSpecialDate,
    resetHours,
    saveProfile,
    saveHours,
    saveDelivery,
    isSaving,
    queryClient,
  };
}

export function formatMemberSince(merchant: Merchant) {
  const dateValue = merchant.submitted_at || merchant.verified_at;
  if (!dateValue) return 'Member since 2024';
  const date = new Date(dateValue);
  return `Member since ${date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
}
