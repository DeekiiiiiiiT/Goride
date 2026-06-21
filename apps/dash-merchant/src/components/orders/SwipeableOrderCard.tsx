import { ReactNode } from 'react';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { useSwipeAction } from '../../hooks/useSwipeAction';

interface SwipeableOrderCardProps {
  children: ReactNode;
  enabled?: boolean;
  onSwipeAccept?: () => void;
  onSwipeReject?: () => void;
}

export default function SwipeableOrderCard({
  children,
  enabled = false,
  onSwipeAccept,
  onSwipeReject,
}: SwipeableOrderCardProps) {
  const { swipeProps, offsetX, direction, progress } = useSwipeAction({
    disabled: !enabled,
    onSwipeRight: onSwipeAccept,
    onSwipeLeft: onSwipeReject,
  });

  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <div className="relative overflow-hidden rounded-lg">
      <div
        className={`absolute inset-y-0 left-0 flex w-24 items-center justify-center transition-opacity ${
          direction === 'right' ? 'bg-primary-container/20 opacity-100' : 'opacity-0'
        }`}
      >
        <MaterialIcon name="check_circle" className="text-primary-container" />
      </div>
      <div
        className={`absolute inset-y-0 right-0 flex w-24 items-center justify-center transition-opacity ${
          direction === 'left' ? 'bg-error-container/30 opacity-100' : 'opacity-0'
        }`}
      >
        <MaterialIcon name="close" className="text-error" />
      </div>

      <div
        {...swipeProps}
        style={{
          ...swipeProps.style,
          transform: `translateX(${offsetX}px)`,
          transition: offsetX === 0 ? 'transform 0.2s ease' : undefined,
        }}
      >
        {children}
      </div>

      {progress > 0.5 && direction === 'right' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-1 text-center text-label-sm font-semibold text-primary-container">
          Release to accept
        </div>
      )}
    </div>
  );
}
