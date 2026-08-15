import { useCallback, useEffect, useState } from 'react';
import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { EmptyState } from '@/components/ui/EmptyState';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { toast } from '@/lib/toast';
import { allowMocks } from '@/lib/mocksGate';
import {
  DEAL_FILTERS,
  type DealFilter,
  FEATURED_DEALS,
  type FeaturedDeal,
} from '@/lib/dealsContent';

type Props = {
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
};

type ApiPromo = {
  id: string;
  merchantId: string;
  merchantName: string | null;
  title: string;
  promoCode: string;
  type: string;
  discountPercent: number | null;
  discountAmount: number | null;
  imageUrl?: string | null;
  logoUrl?: string | null;
  image?: string | null;
  logo?: string | null;
};

const DEAL_IMAGE_FALLBACK = '/images/logo.png';

function mapPromo(p: ApiPromo): FeaturedDeal {
  const filter: DealFilter =
    p.type === 'free_delivery'
      ? 'free-delivery'
      : p.type === 'bogo'
        ? 'bogo'
        : 'percent-off';
  const image = (p.imageUrl || p.image || '').trim() || DEAL_IMAGE_FALLBACK;
  const logo = (p.logoUrl || p.logo || '').trim() || DEAL_IMAGE_FALLBACK;
  return {
    id: p.id,
    merchantId: p.merchantId,
    merchantName: p.merchantName || 'Partner',
    badge:
      p.discountPercent != null
        ? `${p.discountPercent}% OFF`
        : p.discountAmount != null
          ? `J$${p.discountAmount} OFF`
          : p.promoCode || 'Deal',
    title: p.title,
    validUntil: p.promoCode || 'Limited time',
    image,
    logo,
    filter,
  };
}

export default function DealsPage({ onNavigate }: Props) {
  const [activeFilter, setActiveFilter] = useState<DealFilter>('all');
  const [deals, setDeals] = useState<FeaturedDeal[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_ENDPOINTS.delivery}/promotions`, {
        headers: { apikey: publicAnonKey },
      });
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      const mapped = ((data.promotions as ApiPromo[]) ?? []).map(mapPromo);
      setDeals(mapped.length ? mapped : allowMocks() ? FEATURED_DEALS : []);
    } catch {
      setDeals(allowMocks() ? FEATURED_DEALS : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const featured = deals.filter((d) => activeFilter === 'all' || d.filter === activeFilter);
  const isEmpty = !loading && featured.length === 0;

  const handleRefresh = useCallback(async () => {
    await load();
    toast.success(isEmpty ? 'No deals yet' : 'Deals refreshed');
  }, [load, isEmpty]);

  return (
    <PullToRefresh onRefresh={handleRefresh} className="min-h-full bg-background pb-24">
      <div className="mb-6 px-4 pt-2">
        <h2 className="mb-2 text-headline-lg-mobile font-bold text-on-surface">Deals Near You</h2>
        <p className="text-body-md text-on-surface-variant">Live partner promotions.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto px-4 mb-4 no-scrollbar">
        {DEAL_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setActiveFilter(f.id)}
            className={`shrink-0 px-4 py-2 rounded-full text-label-md font-semibold ${
              activeFilter === f.id ? 'bg-primary text-on-primary' : 'bg-surface-variant'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-container" />
        </div>
      ) : isEmpty ? (
        <div className="px-4">
          <EmptyState
            icon="local_offer"
            title="No deals in Kingston right now"
            description="Partners haven’t published live promotions yet. Check back soon, or browse restaurants and save with everyday menu pricing."
            actionLabel="Browse restaurants"
            onAction={() => onNavigate('home')}
          />
        </div>
      ) : (
        <div className="px-4 space-y-3">
          {featured.map((deal) => (
            <button
              key={deal.id}
              type="button"
              onClick={() => onNavigate('restaurant', { merchantId: deal.merchantId })}
              className="w-full text-left bg-surface-container-lowest rounded-xl p-4 shadow-sm border border-surface-variant overflow-hidden"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 gap-3">
                  <img
                    src={deal.image || DEAL_IMAGE_FALLBACK}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-lg object-cover bg-surface-variant"
                    onError={(e) => {
                      const el = e.currentTarget;
                      if (el.src.endsWith(DEAL_IMAGE_FALLBACK)) return;
                      el.src = DEAL_IMAGE_FALLBACK;
                    }}
                  />
                  <div className="min-w-0">
                    <span className="text-label-sm font-semibold text-primary">{deal.badge}</span>
                    <h3 className="text-headline-sm font-bold mt-1">{deal.title}</h3>
                    <p className="text-body-sm text-on-surface-variant mt-1">{deal.merchantName}</p>
                  </div>
                </div>
                <MaterialIcon name="chevron_right" className="text-outline-variant shrink-0" />
              </div>
            </button>
          ))}
        </div>
      )}
    </PullToRefresh>
  );
}
