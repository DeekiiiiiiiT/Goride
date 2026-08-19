import { API_ENDPOINTS, supabaseAnonFunctionHeaders } from '@roam/api-client';

export type ReviewSort = 'recent' | 'highest' | 'lowest';

export type RestaurantReview = {
  id: string;
  author: string;
  initial: string;
  avatarClass: string;
  rating: number;
  date: string;
  comment: string;
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
  reviews: Array<{ id: string; rating: number; comment: string; at: string }>;
};

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
  const res = await fetch(
    `${API_ENDPOINTS.delivery}/merchants/${encodeURIComponent(merchantId)}/reviews`,
    { headers: supabaseAnonFunctionHeaders() },
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
    reviews: (data.reviews ?? []).map((row) => ({
      id: row.id,
      author: 'Customer',
      initial: 'C',
      avatarClass: 'bg-primary-container/20 text-primary',
      rating: row.rating,
      date: formatReviewDate(row.at),
      comment: row.comment,
    })),
  };
}

export function emptyMerchantReviews(merchantId?: string): RestaurantReviewsSummary {
  return emptySummary(merchantId || '');
}

export function sortReviews(reviews: RestaurantReview[], sort: ReviewSort): RestaurantReview[] {
  const copy = [...reviews];
  if (sort === 'highest') return copy.sort((a, b) => b.rating - a.rating);
  if (sort === 'lowest') return copy.sort((a, b) => a.rating - b.rating);
  return copy;
}
