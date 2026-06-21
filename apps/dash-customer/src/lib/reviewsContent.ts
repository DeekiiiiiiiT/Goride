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

const ISLAND_GRILL_REVIEWS: RestaurantReviewsSummary = {
  merchantId: 'island-grill',
  merchantName: 'Island Grill',
  rating: 4.8,
  reviewCount: 2341,
  distribution: [85, 10, 3, 1, 1],
  reviews: [
    {
      id: 'review-1',
      author: 'Sarah J.',
      initial: 'S',
      avatarClass: 'bg-secondary-container text-on-secondary-container',
      rating: 5,
      date: '2 days ago',
      comment: 'Best jerk chicken in Kingston! Always fresh and delivery is fast.',
    },
    {
      id: 'review-2',
      author: 'Michael R.',
      initial: 'M',
      avatarClass: 'bg-primary-container/20 text-primary',
      rating: 4,
      date: '1 week ago',
      comment: 'Great flavors, though the festival was slightly cold.',
    },
  ],
};

const REVIEWS_BY_MERCHANT: Record<string, RestaurantReviewsSummary> = {
  'island-grill': ISLAND_GRILL_REVIEWS,
};

export function getRestaurantReviews(merchantId?: string): RestaurantReviewsSummary {
  if (merchantId && REVIEWS_BY_MERCHANT[merchantId]) {
    return REVIEWS_BY_MERCHANT[merchantId];
  }
  return ISLAND_GRILL_REVIEWS;
}

export function sortReviews(reviews: RestaurantReview[], sort: ReviewSort): RestaurantReview[] {
  const copy = [...reviews];
  if (sort === 'highest') return copy.sort((a, b) => b.rating - a.rating);
  if (sort === 'lowest') return copy.sort((a, b) => a.rating - b.rating);
  return copy;
}
