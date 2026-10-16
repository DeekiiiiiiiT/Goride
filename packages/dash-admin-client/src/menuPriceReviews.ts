import { dashAdminFetch } from './fetch';

export type MenuPriceChangeRequest = {
  id: string;
  merchant_id: string;
  item_id: string;
  old_price: number;
  new_price: number;
  pct_increase: number;
  status: 'pending' | 'approved' | 'rejected' | string;
  requested_by?: string | null;
  decided_by?: string | null;
  decided_at?: string | null;
  created_at: string;
  item_name?: string | null;
  merchant?: { id: string; name?: string } | null;
};

export function listMenuPriceReviews(accessToken: string, status = 'pending') {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  return dashAdminFetch<{ requests: MenuPriceChangeRequest[] }>(
    accessToken,
    `/admin/menu-price-reviews${q}`,
  );
}

export function approveMenuPriceReview(accessToken: string, id: string) {
  return dashAdminFetch<{ request: MenuPriceChangeRequest }>(
    accessToken,
    `/admin/menu-price-reviews/${encodeURIComponent(id)}/approve`,
    { method: 'POST', body: '{}' },
  );
}

export function rejectMenuPriceReview(accessToken: string, id: string) {
  return dashAdminFetch<{ request: MenuPriceChangeRequest }>(
    accessToken,
    `/admin/menu-price-reviews/${encodeURIComponent(id)}/reject`,
    { method: 'POST', body: '{}' },
  );
}
