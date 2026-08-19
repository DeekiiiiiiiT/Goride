import { API_ENDPOINTS } from '@roam/api-client';
import { supabase } from '@/lib/supabase';
import type { NotificationPrefs } from '@/lib/accountSubContent';

/** Mirrors delivery.customers.saved_addresses jsonb entries */
export type CustomerSavedAddressDto = {
  id: string;
  label: 'home' | 'work' | 'other';
  line1: string;
  line2?: string;
  instructions?: string;
  city?: string;
  isDefault?: boolean;
  lat?: number;
  lng?: number;
};

export type CustomerProfileDto = {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  name: string;
  phone: string | null;
  email: string | null;
  defaultAddress: string | null;
  savedAddresses: CustomerSavedAddressDto[];
  accountStatus: string;
  notificationPrefs?: NotificationPrefs;
  preferredPaymentMethod?: 'wipay' | 'paypal' | 'cash';
};

async function authHeaders(): Promise<Record<string, string> | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  return {
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  };
}

export async function fetchCustomerProfile(): Promise<CustomerProfileDto | null> {
  const headers = await authHeaders();
  if (!headers) return null;
  const res = await fetch(`${API_ENDPOINTS.delivery}/customer/profile`, { headers });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load profile');
  const data = await res.json();
  return data.profile as CustomerProfileDto;
}

export async function patchCustomerProfile(body: {
  firstName?: string;
  lastName?: string;
  name?: string;
  phone?: string;
  email?: string;
  savedAddresses?: CustomerSavedAddressDto[];
  notificationPrefs?: NotificationPrefs;
  preferredPaymentMethod?: 'wipay' | 'paypal' | 'cash';
}): Promise<CustomerProfileDto> {
  const headers = await authHeaders();
  if (!headers) throw new Error('Sign in required');
  const res = await fetch(`${API_ENDPOINTS.delivery}/customer/profile`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to save profile');
  const data = await res.json();
  return data.profile as CustomerProfileDto;
}

export async function fetchFavoriteMerchantIds(): Promise<string[]> {
  const headers = await authHeaders();
  if (!headers) return [];
  const res = await fetch(`${API_ENDPOINTS.delivery}/customer/favorites`, { headers });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load favorites');
  const data = await res.json();
  return (data.merchantIds as string[]) ?? [];
}

export async function addFavoriteMerchant(merchantId: string): Promise<void> {
  const headers = await authHeaders();
  if (!headers) throw new Error('Sign in required');
  const res = await fetch(`${API_ENDPOINTS.delivery}/customer/favorites`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ merchantId }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to add favorite');
}

export async function removeFavoriteMerchant(merchantId: string): Promise<void> {
  const headers = await authHeaders();
  if (!headers) throw new Error('Sign in required');
  const res = await fetch(`${API_ENDPOINTS.delivery}/customer/favorites/${encodeURIComponent(merchantId)}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to remove favorite');
}

export type FavoriteItemDto = {
  merchantId: string;
  menuItemId: string;
};

export async function fetchFavoriteItems(): Promise<FavoriteItemDto[]> {
  const headers = await authHeaders();
  if (!headers) return [];
  const res = await fetch(`${API_ENDPOINTS.delivery}/customer/favorite-items`, { headers });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load favorite items');
  const data = await res.json();
  return (data.items as FavoriteItemDto[]) ?? [];
}

export async function addFavoriteItem(merchantId: string, menuItemId: string): Promise<void> {
  const headers = await authHeaders();
  if (!headers) throw new Error('Sign in required');
  const res = await fetch(`${API_ENDPOINTS.delivery}/customer/favorite-items`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ merchantId, menuItemId }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to add favorite item');
}

export async function removeFavoriteItem(merchantId: string, menuItemId: string): Promise<void> {
  const headers = await authHeaders();
  if (!headers) throw new Error('Sign in required');
  const res = await fetch(
    `${API_ENDPOINTS.delivery}/customer/favorite-items/${encodeURIComponent(merchantId)}/${encodeURIComponent(menuItemId)}`,
    { method: 'DELETE', headers },
  );
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to remove favorite item');
}

export async function isCustomerLoggedIn(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  return Boolean(session?.access_token);
}

export async function fetchCustomerOrders(): Promise<{
  orders: Array<{
    id: string;
    order_number?: string;
    status: string;
    merchant?: { id?: string; name?: string; logo_url?: string };
    [key: string]: unknown;
  }>;
}> {
  const headers = await authHeaders();
  if (!headers) return { orders: [] };
  const res = await fetch(`${API_ENDPOINTS.delivery}/customer/orders`, { headers });
  if (!res.ok) throw new Error('Failed to fetch orders');
  return res.json();
}

export async function submitCustomerOrderIssue(input: {
  orderId: string;
  issueType: string;
  notes: string;
}): Promise<void> {
  const headers = await authHeaders();
  if (!headers) throw new Error('Sign in required');
  const res = await fetch(`${API_ENDPOINTS.delivery}/orders/${input.orderId}/issue`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ issueType: input.issueType, notes: input.notes }),
  });
  if (!res.ok) {
    throw new Error((await res.json().catch(() => ({}))).error || 'Could not submit report');
  }
}
