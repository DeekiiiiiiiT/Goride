import { useEffect, useRef, useState } from 'react';
import { PROMO_BANNERS } from '@/lib/discoverContent';

type Props = {
  onPromoClick?: (promoId: string) => void;
};

export function PromoCarousel({ onPromoClick }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pauseRef = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => {
      if (pauseRef.current) return;
      setActiveIndex((prev) => {
        const next = (prev + 1) % PROMO_BANNERS.length;
        const el = scrollRef.current;
        if (el) {
          const child = el.children[next] as HTMLElement | undefined;
          child?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
        return next;
      });
    }, 4500);
    return () => clearInterval(interval);
  }, []);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const children = Array.from(el.children) as HTMLElement[];
    const center = el.scrollLeft + el.clientWidth / 2;
    let closest = 0;
    let minDist = Infinity;
    children.forEach((child, i) => {
      const childCenter = child.offsetLeft + child.offsetWidth / 2;
      const dist = Math.abs(center - childCenter);
      if (dist < minDist) {
        minDist = dist;
        closest = i;
      }
    });
    setActiveIndex(closest);
  };

  return (
    <div className="mt-1 max-w-[1200px] mx-auto">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onTouchStart={() => { pauseRef.current = true; }}
        onTouchEnd={() => { setTimeout(() => { pauseRef.current = false; }, 3000); }}
        className="flex overflow-x-auto snap-x snap-mandatory px-4 gap-4 py-4 no-scrollbar"
      >
        {PROMO_BANNERS.map((promo) => (
          <button
            key={promo.id}
            type="button"
            onClick={() => onPromoClick?.(promo.id)}
            className={`min-w-[85%] sm:min-w-[300px] snap-center rounded-xl p-4 flex flex-col justify-center relative overflow-hidden shadow-sm min-h-[120px] text-left active:scale-[0.98] transition-transform ${promo.className}`}
          >
            <div className="relative z-10 w-2/3">
              <h3 className="text-xl font-semibold mb-1">{promo.title}</h3>
              <p className="text-sm opacity-90">{promo.subtitle}</p>
              {promo.code && (
                <div className={`mt-2 text-xs font-bold px-2 py-1 rounded inline-block ${promo.codeClassName}`}>
                  Code: {promo.code}
                </div>
              )}
            </div>
            {promo.id === 'welcome' && (
              <div className="absolute right-0 top-0 h-full w-1/2 bg-gradient-to-l from-black/10 to-transparent" />
            )}
          </button>
        ))}
      </div>
      <div className="flex justify-center gap-2 pb-2">
        {PROMO_BANNERS.map((promo, i) => (
          <button
            key={promo.id}
            type="button"
            aria-label={`Go to promo ${i + 1}`}
            onClick={() => {
              const el = scrollRef.current?.children[i] as HTMLElement | undefined;
              el?.scrollIntoView({ behavior: 'smooth', inline: 'center' });
              setActiveIndex(i);
            }}
            className={`h-2 rounded-full transition-all ${
              i === activeIndex ? 'w-6 bg-primary-container' : 'w-2 bg-outline-variant'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
