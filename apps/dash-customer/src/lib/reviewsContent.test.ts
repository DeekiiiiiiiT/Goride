import { describe, expect, it } from 'vitest';
import { anonymousReviewer, sortReviews, type RestaurantReview } from './reviewsContent';

function review(partial: Partial<RestaurantReview> & Pick<RestaurantReview, 'id' | 'rating' | 'at'>): RestaurantReview {
  return {
    author: 'Verified customer',
    initial: 'A',
    avatarClass: '',
    date: '',
    comment: '',
    helpfulCount: 0,
    voted: false,
    ...partial,
  };
}

describe('anonymousReviewer', () => {
  it('is stable for the same order id', () => {
    expect(anonymousReviewer('abc').initial).toBe(anonymousReviewer('abc').initial);
    expect(anonymousReviewer('abc').author).toBe('Verified customer');
  });
});

describe('sortReviews', () => {
  const rows = [
    review({ id: '1', rating: 2, at: '2026-08-01T00:00:00Z' }),
    review({ id: '2', rating: 5, at: '2026-08-03T00:00:00Z' }),
    review({ id: '3', rating: 4, at: '2026-08-02T00:00:00Z' }),
  ];

  it('sorts recent by date', () => {
    expect(sortReviews(rows, 'recent').map((r) => r.id)).toEqual(['2', '3', '1']);
  });

  it('sorts highest rating first', () => {
    expect(sortReviews(rows, 'highest')[0].id).toBe('2');
  });
});
