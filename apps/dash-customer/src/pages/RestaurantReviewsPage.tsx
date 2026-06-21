import { useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import {
  getRestaurantReviews,
  sortReviews,
  type ReviewSort,
} from '@/lib/reviewsContent';

type Props = {
  merchantId?: string;
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
};

function StarRow({ rating, size = 'md' }: { rating: number; size?: 'sm' | 'md' }) {
  const iconSize = size === 'sm' ? 14 : 20;
  return (
    <div className="flex items-center text-primary-container">
      {Array.from({ length: 5 }, (_, i) => {
        const filled = i < Math.floor(rating);
        const half = !filled && i < rating;
        return (
          <MaterialIcon
            key={i}
            name={half ? 'star_half' : 'star'}
            size={iconSize}
            filled={filled || half}
            className={!filled && !half ? 'text-outline-variant' : ''}
          />
        );
      })}
    </div>
  );
}

export default function RestaurantReviewsPage({ merchantId, onNavigate }: Props) {
  const summary = getRestaurantReviews(merchantId);
  const [sort, setSort] = useState<ReviewSort>('recent');
  const reviews = sortReviews(summary.reviews, sort);

  return (
    <div className="bg-surface text-on-surface antialiased pb-28 min-h-screen">
      <header className="sticky top-0 z-40 bg-surface shadow-sm">
        <div className="flex items-center justify-between px-4 h-16 max-w-[1200px] mx-auto">
          <button
            type="button"
            aria-label="Go back"
            onClick={() => onNavigate('restaurant', { merchantId: summary.merchantId })}
            className="w-10 h-10 flex items-center justify-center rounded-full active:scale-95 transition-transform hover:bg-surface-variant/50"
          >
            <MaterialIcon name="arrow_back" />
          </button>
          <h1 className="text-headline-sm font-semibold truncate flex-1 text-center">
            Reviews for {summary.merchantName}
          </h1>
          <div className="w-10" />
        </div>
      </header>

      <main className="w-full max-w-[1200px] mx-auto pt-6 px-4">
        <section className="bg-surface-container-lowest rounded-xl p-4 shadow-[0px_4px_20px_rgba(0,0,0,0.04)] mb-6">
          <div className="flex flex-row items-center gap-6">
            <div className="flex flex-col items-center justify-center min-w-[100px]">
              <span className="text-display-lg font-bold text-on-surface">{summary.rating}</span>
              <StarRow rating={summary.rating} />
              <span className="text-label-sm text-on-surface-variant mt-1">
                ({summary.reviewCount.toLocaleString()} reviews)
              </span>
            </div>
            <div className="flex-1 flex flex-col gap-2">
              {summary.distribution.map((width, index) => (
                <div key={5 - index} className="flex items-center gap-2">
                  <span className="text-label-sm text-on-surface-variant w-4">{5 - index}</span>
                  <div className="h-2 flex-1 bg-surface-variant rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary-container rounded-full"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-headline-sm font-semibold text-on-surface">Reviews</h2>
          <div className="relative">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as ReviewSort)}
              className="appearance-none bg-surface-container-lowest border border-outline-variant text-on-surface text-body-sm rounded-lg pl-2 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="recent">Most recent</option>
              <option value="highest">Highest rating</option>
              <option value="lowest">Lowest rating</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-on-surface-variant">
              <MaterialIcon name="expand_more" size={14} />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {reviews.map((review) => (
            <article
              key={review.id}
              className="bg-surface-container-lowest rounded-xl p-4 shadow-[0px_4px_20px_rgba(0,0,0,0.04)] active:scale-[0.98] transition-transform"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-headline-md font-semibold ${review.avatarClass}`}
                  >
                    {review.initial}
                  </div>
                  <div>
                    <h3 className="text-label-md font-semibold tracking-wide text-on-surface">{review.author}</h3>
                    <p className="text-label-sm text-on-surface-variant">{review.date}</p>
                  </div>
                </div>
                <button type="button" aria-label="More options" className="text-on-surface-variant">
                  <MaterialIcon name="more_vert" />
                </button>
              </div>
              <StarRow rating={review.rating} size="sm" />
              <p className="text-body-md text-on-surface my-4">&ldquo;{review.comment}&rdquo;</p>
              <div className="flex justify-end pt-2 border-t border-surface-variant/50">
                <button
                  type="button"
                  className="flex items-center gap-1 text-label-sm text-on-surface-variant hover:text-primary transition-colors px-3 py-1.5 rounded-full border border-outline-variant hover:border-primary"
                >
                  <MaterialIcon name="thumb_up" size={16} />
                  Helpful
                </button>
              </div>
            </article>
          ))}
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-surface/90 backdrop-blur-md z-30 border-t border-surface-variant/50 pb-[max(env(safe-area-inset-bottom),16px)]">
        <div className="w-full max-w-[1200px] mx-auto">
          <button
            type="button"
            onClick={() =>
              onNavigate('rate-order', {
                merchantName: summary.merchantName,
                merchantId: summary.merchantId,
              })
            }
            className="w-full h-12 flex items-center justify-center gap-2 bg-transparent border border-primary text-primary text-label-md font-semibold tracking-wide rounded-lg active:scale-[0.98] transition-transform"
          >
            <MaterialIcon name="edit_square" />
            Write a Review
          </button>
        </div>
      </div>
    </div>
  );
}
