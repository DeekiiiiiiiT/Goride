import { useEffect, useRef, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
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
            className={`relative flex h-[160px] w-[310px] shrink-0 snap-center flex-col justify-end overflow-hidden rounded-xl p-5 text-left shadow-sm transition-transform active:scale-[0.98] ${promo.className}`}
          >
            <div className="relative z-10 max-w-[200px]">
              <h3 className="text-headline-md font-bold leading-tight">{promo.title}</h3>
              <p className="mt-1 text-label-md uppercase tracking-wider opacity-80">{promo.subtitle}</p>
            </div>
            <div className="absolute right-4 top-4 opacity-30">
              <MaterialIcon
                name={promo.id === 'welcome' ? 'delivery_dining' : 'local_offer'}
                className="text-[64px] text-white"
              />
            </div>
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
