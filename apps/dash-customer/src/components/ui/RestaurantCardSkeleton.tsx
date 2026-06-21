type Props = {
  count?: number;
  variant?: 'card' | 'row';
};

export function RestaurantCardSkeleton({ count = 2, variant = 'row' }: Props) {
  return (
    <div className={`flex flex-col gap-4 ${variant === 'card' ? '' : ''}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`bg-surface-container-lowest rounded-xl overflow-hidden border border-surface-container-high ${
            variant === 'row' ? 'flex gap-4 p-4' : ''
          }`}
        >
          <div
            className={`skeleton-shimmer bg-surface-variant ${
              variant === 'row' ? 'w-24 h-24 rounded-lg shrink-0' : 'h-40 w-full'
            }`}
          />
          <div className={`flex flex-col gap-2 flex-1 ${variant === 'row' ? 'py-1' : 'p-4'}`}>
            <div className="skeleton-shimmer h-5 w-3/4 rounded bg-surface-variant" />
            <div className="skeleton-shimmer h-4 w-1/2 rounded bg-surface-variant" />
            <div className="skeleton-shimmer h-4 w-2/3 rounded bg-surface-variant mt-1" />
          </div>
        </div>
      ))}
    </div>
  );
}
