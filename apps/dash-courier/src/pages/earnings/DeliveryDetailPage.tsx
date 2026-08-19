import React, { useEffect, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { DeliveryMap } from '@/components/map/DeliveryMap';
import { fetchCourierOrderDetail } from '@/lib/courierApi';
import {
  mapCourierOrderDetail,
  type CourierDeliveryDetailView,
} from '@/lib/courierOrderDetail';
import { resolveCourierFileUrl } from '@/lib/courierFileUpload';
import { formatJmd } from '@/lib/formatMoney';

type DeliveryDetailPageProps = {
  deliveryId: string;
  onBack: () => void;
};

export function DeliveryDetailPage({ deliveryId, onBack }: DeliveryDetailPageProps) {
  const [view, setView] = useState<CourierDeliveryDetailView | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    void fetchCourierOrderDetail(deliveryId).then(async (payload) => {
      if (cancelled) return;
      if (!payload) {
        setError(true);
        setLoading(false);
        return;
      }
      const mapped = mapCourierOrderDetail(payload);
      let resolvedProof = mapped.proofUrl;
      if (resolvedProof) {
        resolvedProof = (await resolveCourierFileUrl(resolvedProof)) || resolvedProof;
      }
      if (cancelled) return;
      setView(mapped);
      setProofUrl(resolvedProof);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [deliveryId]);

  return (
    <div className="fixed inset-0 z-[70] bg-background flex flex-col overflow-hidden">
      <header className="bg-surface sticky top-0 z-40 shadow-soft h-16 flex justify-between items-center px-[var(--spacing-edge)] pt-safe shrink-0">
        <button
          type="button"
          onClick={onBack}
          aria-label="Go back"
          className="h-12 w-12 flex items-center justify-center -ml-2 text-primary hover:bg-surface-container-low rounded-full active:scale-95"
        >
          <MaterialIcon name="arrow_back" />
        </button>
        <h1 className="text-xl font-bold text-primary">Delivery Detail</h1>
        <div className="h-12 w-12" aria-hidden />
      </header>

      <main className="flex-1 overflow-y-auto max-w-md mx-auto w-full pt-2 px-[var(--spacing-edge)] pb-8 space-y-6">
        {loading && <p className="text-sm text-muted">Loading delivery…</p>}
        {error && (
          <p className="text-sm text-error">Could not load this delivery. Go back and try again.</p>
        )}
        {view && (
          <>
            {view.dropoffLat != null && view.dropoffLng != null && (
              <div className="rounded-xl overflow-hidden shadow-soft bg-surface h-48 relative">
                <DeliveryMap
                  className="h-full w-full"
                  destinationLat={view.dropoffLat}
                  destinationLng={view.dropoffLng}
                  destinationLabel="Dropoff"
                  interactive={false}
                />
              </div>
            )}

            <div className="bg-surface rounded-xl p-4 shadow-soft border-l-4 border-success">
              <div className="flex items-center gap-2 mb-1">
                <MaterialIcon name="check_circle" className="text-success text-xl" filled />
                <h2 className="text-2xl font-semibold text-on-surface">{view.statusLabel}</h2>
              </div>
              {view.completedAtLabel && <p className="text-sm text-muted">{view.completedAtLabel}</p>}
            </div>

            <div className="bg-surface rounded-xl shadow-soft overflow-hidden">
              <div className="p-4 border-b border-surface-container">
                <h3 className="text-xl font-semibold text-on-surface mb-3">Order Information</h3>
                <div className="flex items-center gap-4 mb-2">
                  <div className="text-primary bg-primary-container/20 p-2 rounded-full">
                    <MaterialIcon name="storefront" className="text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted">Restaurant</p>
                    <p className="text-xl font-semibold text-on-surface">{view.restaurant}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-3">
                  <span className="bg-primary-container/20 p-2 rounded-full">
                    <MaterialIcon name="person" className="text-primary" />
                  </span>
                  <div>
                    <p className="text-sm text-muted">Customer</p>
                    <p className="text-xl font-semibold text-on-surface">{view.customerName}</p>
                  </div>
                </div>
              </div>

              {view.timeline.length > 0 && (
                <div className="p-4 bg-surface-bright">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted mb-4">
                    Timeline
                  </h4>
                  <div className="relative pl-6 space-y-4 border-l-2 border-surface-container ml-2">
                    {view.timeline.map((event) => (
                      <div key={`${event.label}-${event.time}`} className="relative">
                        <div
                          className={`absolute -left-[31px] top-1 h-4 w-4 rounded-full border-2 border-surface ${
                            event.complete ? 'bg-success' : 'bg-surface-container'
                          }`}
                        />
                        <div className="flex justify-between items-start gap-2">
                          <span
                            className={`text-sm ${event.complete ? 'text-success font-semibold' : 'text-on-surface'}`}
                          >
                            {event.label}
                          </span>
                          <span className="text-[11px] text-muted shrink-0">{event.time}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {view.items.length > 0 && (
              <div className="bg-surface rounded-xl p-4 shadow-soft">
                <h3 className="text-xl font-semibold text-on-surface mb-4">Order Items</h3>
                <ul className="space-y-2">
                  {view.items.map((item, index) => (
                    <li
                      key={`${item.name}-${index}`}
                      className="flex items-center gap-2 py-2 border-b border-surface-container last:border-0"
                    >
                      <span className="bg-surface-container text-on-surface px-2 py-1 rounded text-xs font-semibold uppercase tracking-wide">
                        {item.quantity}
                      </span>
                      <span className="text-sm text-on-surface">{item.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="bg-surface rounded-xl p-4 shadow-soft">
              <h3 className="text-xl font-semibold text-on-surface mb-4 flex items-center gap-2">
                <MaterialIcon name="payments" className="text-primary" />
                Earnings Breakdown
              </h3>
              <div className="space-y-1">
                <div className="flex justify-between text-sm text-muted py-1">
                  <span>Base Pay</span>
                  <span>J${formatJmd(view.basePay)}</span>
                </div>
                {view.tip > 0 && (
                  <div className="flex justify-between text-sm text-muted py-1">
                    <span>Tip</span>
                    <span className="text-success">J${formatJmd(view.tip)}</span>
                  </div>
                )}
                <div className="h-px bg-surface-container my-2" />
                <div className="flex justify-between text-xl font-semibold text-on-surface pt-1">
                  <span>Total Earnings</span>
                  <span className="text-primary font-bold">J${formatJmd(view.total)}</span>
                </div>
              </div>
            </div>

            {proofUrl && (
              <div className="bg-surface rounded-xl p-4 shadow-soft">
                <h3 className="text-xl font-semibold text-on-surface mb-4">Proof of Delivery</h3>
                <div className="rounded-lg overflow-hidden h-32 relative w-1/2 min-w-[140px]">
                  <img src={proofUrl} alt="Proof of delivery" className="w-full h-full object-cover" />
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
