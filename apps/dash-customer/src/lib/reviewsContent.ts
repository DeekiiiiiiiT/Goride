import { API_ENDPOINTS, supabaseAnonFunctionHeaders } from '@roam/api-client';
import { supabase } from './supabase';

export type ReviewSort = 'recent' | 'highest' | 'lowest';

export type RestaurantReview = {
  id: string;
  author: string;
  initial: string;
  avatarClass: string;
  rating: number;
  date: string;
  at: string;
  comment: string;
  helpfulCount: number;
  voted: boolean;
};

export type RestaurantReviewsSummary = {
  merchantId: string;
  merchantName: string;
  rating: number;
  reviewCount: number;
  distribution: [number, number, number, number, number];
  reviews: RestaurantReview[];
};

type MerchantReviewsApi = {
  merchantId: string;
  merchantName: string;
  rating: number;
  reviewCount: number;
  distribution: number[];
  reviews: Array<{
    id: string;
    rating: number;
    comment: string;
    at: string;
    helpfulCount?: number;
    voted?: boolean;
  }>;
};

export function anonymousReviewer(orderId: string): { author: string; initial: string } {
  let hash = 0;
  for (const ch of orderId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return {
    author: 'Verified customer',
    initial: String.fromCharCode(65 + (hash % 26)),
  };
}

function formatReviewDate(iso: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-JM', { month: 'short', day: 'numeric', year: 'numeric' });
}

function emptySummary(merchantId: string): RestaurantReviewsSummary {
  return {
    merchantId,
    merchantName: 'Restaurant',
    rating: 0,
    reviewCount: 0,
    distribution: [0, 0, 0, 0, 0],
    reviews: [],
  };
}

export async function fetchMerchantReviews(merchantId: string): Promise<RestaurantReviewsSummary> {
  const headers: Record<string, string> = { ...supabaseAnonFunctionHeaders() };
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

  const res = await fetch(
    `${API_ENDPOINTS.delivery}/merchants/${encodeURIComponent(merchantId)}/reviews`,
    { headers },
  );
  if (!res.ok) throw new Error('Failed to load reviews');
  const data = (await res.json()) as MerchantReviewsApi;
  const counts = data.distribution ?? [0, 0, 0, 0, 0];
  const total = Math.max(1, data.reviewCount || 0);
  const distribution = [0, 1, 2, 3, 4].map((i) =>
    Math.round(((counts[i] ?? 0) / total) * 100),
  ) as RestaurantReviewsSummary['distribution'];

  return {
    merchantId: data.merchantId,
    merchantName: data.merchantName || 'Restaurant',
    rating: data.rating ?? 0,
    reviewCount: data.reviewCount ?? 0,
    distribution,
    reviews: (data.reviews ?? []).map((row) => {
      const who = anonymousReviewer(row.id);
      return {
        id: row.id,
        author: who.author,
        initial: who.initial,
        avatarClass: 'bg-primary-container/20 text-primary',
        rating: row.rating,
        date: formatReviewDate(row.at),
        at: row.at,
        comment: row.comment,
        helpfulCount: row.helpfulCount ?? 0,
        voted: Boolean(row.voted),
      };
    }),
  };
}

export function emptyMerchantReviews(merchantId?: string): RestaurantReviewsSummary {
  return emptySummary(merchantId || '');
}

export function sortReviews(reviews: RestaurantReview[], sort: ReviewSort): RestaurantReview[] {
  const copy = [...reviews];
  if (sort === 'highest') return copy.sort((a, b) => b.rating - a.rating || b.at.localeCompare(a.at));
  if (sort === 'lowest') return copy.sort((a, b) => a.rating - b.rating || b.at.localeCompare(a.at));
  return copy.sort((a, b) => b.at.localeCompare(a.at));
}
