import { ReactNode, useCallback, useRef, useState } from 'react';
import { MaterialIcon } from '../../signup/components/MaterialIcon';

interface PinchZoomChartProps {
  children: ReactNode;
  className?: string;
}

export default function PinchZoomChart({ children, className = '' }: PinchZoomChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const pinchStart = useRef<number | null>(null);
  const baseScale = useRef(1);

  const onTouchStart = useCallback((event: React.TouchEvent) => {
    if (event.touches.length === 2) {
      const dx = event.touches[0].clientX - event.touches[1].clientX;
      const dy = event.touches[0].clientY - event.touches[1].clientY;
      pinchStart.current = Math.hypot(dx, dy);
      baseScale.current = scale;
    }
  }, [scale]);

  const onTouchMove = useCallback((event: React.TouchEvent) => {
    if (event.touches.length !== 2 || pinchStart.current == null) return;
    const dx = event.touches[0].clientX - event.touches[1].clientX;
    const dy = event.touches[0].clientY - event.touches[1].clientY;
    const distance = Math.hypot(dx, dy);
    const next = Math.min(3, Math.max(1, baseScale.current * (distance / pinchStart.current)));
    setScale(next);
  }, []);

  const onTouchEnd = useCallback(() => {
    pinchStart.current = null;
  }, []);

  const resetZoom = () => setScale(1);

  return (
    <div className={`relative ${className}`}>
      {scale > 1 && (
        <button
          type="button"
          onClick={resetZoom}
          className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-full bg-surface/90 px-2 py-1 text-label-sm text-on-surface-variant shadow-sm"
        >
          <MaterialIcon name="fit_screen" className="text-sm" />
          Reset
        </button>
      )}
      <div
        ref={containerRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          touchAction: scale > 1 ? 'none' : 'pan-y',
          transition: pinchStart.current == null ? 'transform 0.15s ease' : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}
