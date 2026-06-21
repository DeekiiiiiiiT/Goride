import { useMemo, useState } from 'react';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { MerchantReview, ReviewStarFilter } from '../../types/analytics';
import { MerchantAnalyticsData } from '../../hooks/useMerchantAnalytics';

const STAR_FILTERS: { value: ReviewStarFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 5, label: '5 Star' },
  { value: 4, label: '4 Star' },
  { value: 3, label: '3 Star' },
  { value: 2, label: '2 Star' },
  { value: 1, label: '1 Star' },
];

interface ReviewsAnalyticsViewProps {
  data: MerchantAnalyticsData;
}

export default function ReviewsAnalyticsView({ data }: ReviewsAnalyticsViewProps) {
  const [starFilter, setStarFilter] = useState<ReviewStarFilter>('all');

  const filteredReviews = useMemo(() => {
    if (starFilter === 'all') return data.reviews;
    return data.reviews.filter((review) => review.rating === starFilter);
  }, [data.reviews, starFilter]);

  return (
    <div className="flex flex-col gap-sm">
      <h1 className="py-xs text-headline-lg-mobile text-on-surface">Reviews Analytics</h1>

      <div className="grid grid-cols-2 gap-sm">
        <div className="flex flex-col items-center justify-center rounded-lg border border-outline-variant bg-surface-container-lowest p-sm shadow-sm">
          <span className="text-headline-lg-mobile text-on-surface">
            {data.reviews.length > 0 ? data.avgRating.toFixed(1) : '—'}
          </span>
          <div className="mt-1 flex items-center text-primary-container">
            <StarRow rating={data.avgRating} />
          </div>
          <span className="mt-2 text-label-sm text-on-surface-variant">
            {data.reviews.length} Review{data.reviews.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <div className="mt-2 flex flex-col gap-xs rounded-lg border border-outline-variant bg-surface-container-lowest p-sm shadow-sm">
        <h2 className="mb-1 text-label-md text-on-surface">Rating Distribution</h2>
        {data.ratingDistribution.map((row) => (
          <div key={row.star} className="flex items-center gap-xs">
            <span className="w-4 text-label-sm">{row.star}</span>
            <MaterialIcon name="star" filled className="text-[14px] text-primary-container" />
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-variant">
              <div className="h-full bg-primary" style={{ width: `${row.percent}%` }} />
            </div>
            <span className="w-8 text-right text-label-sm text-on-surface-variant">{row.count}</span>
          </div>
        ))}
      </div>

      <div className="hide-scrollbar mt-4 flex gap-xs overflow-x-auto pb-1">
        {STAR_FILTERS.map((filter) => {
          const isActive = starFilter === filter.value;
          return (
            <button
              key={filter.label}
              type="button"
              onClick={() => setStarFilter(filter.value)}
              className={`flex h-10 shrink-0 snap-start items-center justify-center whitespace-nowrap rounded-full px-4 text-label-md ${
                isActive
                  ? 'border border-primary bg-primary text-on-primary'
                  : 'border border-outline-variant bg-surface-container-lowest text-on-surface'
              }`}
            >
              {filter.label}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex flex-col gap-sm">
        {filteredReviews.map((review) => (
          <ReviewCard key={review.id} review={review} />
        ))}
        {filteredReviews.length === 0 && (
          <p className="py-8 text-center text-body-sm text-on-surface-variant">
            No reviews in this period.
          </p>
        )}
      </div>
    </div>
  );
}

function StarRow({ rating }: { rating: number }) {
  const stars = [];
  for (let index = 1; index <= 5; index += 1) {
    const filled = rating >= index;
    const half = !filled && rating >= index - 0.5;
    stars.push(
      <MaterialIcon
        key={index}
        name={half ? 'star_half' : 'star'}
        filled={filled || half}
        className="text-primary-container"
      />
    );
  }
  return <>{stars}</>;
}

function ReviewCard({ review }: { review: MerchantReview }) {
  return (
    <div className="relative flex flex-col gap-xs overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest p-sm shadow-sm">
      <div className="flex items-start justify-between pt-2">
        <div className="flex items-center gap-xs">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-full font-headline-md ${review.avatarClass}`}
          >
            {review.authorInitial}
          </div>
          <div>
            <p className="text-label-md text-on-surface">{review.author}</p>
            <p className="text-label-sm text-on-surface-variant">
              {review.daysAgo === 0
                ? 'Today'
                : review.daysAgo === 1
                  ? '1 day ago'
                  : `${review.daysAgo} days ago`}
            </p>
          </div>
        </div>
        <div className="flex items-center text-primary-container">
          {Array.from({ length: 5 }).map((_, index) => (
            <MaterialIcon
              key={index}
              name="star"
              filled={index < review.rating}
              className="text-[18px]"
            />
          ))}
        </div>
      </div>

      {review.text && (
        <p className="mt-1 text-body-sm text-on-surface">&ldquo;{review.text}&rdquo;</p>
      )}

      {review.items.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {review.items.map((item) => (
            <span
              key={item}
              className="rounded-sm bg-surface-variant px-2 py-1 text-label-sm text-on-surface"
            >
              {item}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
