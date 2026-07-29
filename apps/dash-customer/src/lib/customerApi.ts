import { API_ENDPOINTS } from '@roam/api-client';
import { supabase } from '@/lib/supabase';

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

export async function isCustomerLoggedIn(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  return Boolean(session?.access_token);
}
