interface PartnerSkeletonProps {
  variant?: 'card' | 'list' | 'chart';
  count?: number;
}

export default function PartnerSkeleton({ variant = 'list', count = 3 }: PartnerSkeletonProps) {
  if (variant === 'chart') {
    return (
      <div className="h-32 animate-pulse rounded-lg border border-outline-variant bg-surface-container-low" />
    );
  }

  if (variant === 'card') {
    return (
      <div className="grid grid-cols-2 gap-inset-xs">
        {Array.from({ length: count }).map((_, index) => (
          <div
            key={index}
            className="h-24 animate-pulse rounded-lg border border-outline-variant bg-surface-container-lowest"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-inset-xs">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="h-16 animate-pulse rounded-lg border border-outline-variant bg-surface-container-lowest"
        />
      ))}
    </div>
  );
}
