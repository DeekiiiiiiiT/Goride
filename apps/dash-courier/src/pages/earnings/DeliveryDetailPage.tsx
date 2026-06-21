import React from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { MOCK_ACTIVE_DELIVERY } from '@/lib/mockActiveDelivery';

const DETAIL_MAP =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBaPw9eK4ysL1Y8CBladtGzDUBSs4aU_ZR1cuK8lyq6b8jm89dMSfdy3qPY0Zr7RG3GjNN_lCBIJ28d0SYXEeGrbsjpJrCxXufJkpkkSdBqVB0-7Asfy4fbFuOiLdVpWSH8uIFbsgP4Oc0SM9x2eO8XkuFGniG5DcIIzrDI7mf8ZT_ILrqGKuxmvJKPKRHw47GzNN3rbLE1cc5m1VZ0xYbtUuXvYgtl2PAh9l3xpfRHtedrq7FCldL1yRJ6rFF4NhYTcLaBQeVhz_Y';

const PROOF_IMAGE =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDyDRqqWD8MPfY296GqYgp-oP24VGqV2LyPlVqigIniIn17J_lW92s2Oy6m5klop5GjVj2shQN0inW9Y9Ikv4YbciHzOXkHDQHTgjGreUIsCs7SvAdGvDcjOGhGvs-HON1Xfj0o6PQbcH9jNYq08MJNTjQqMpR9o0XbrvWzQ7l3Ti3EnnPW8pZKjc2npOhm3ijwCWITbj9CiMsgKx4H7FcsBTf9xKDtliz5RZkOqDD3ZchCHeFortDDI0OyIptMlFNSRD8OxzZVP_4';

const TIMELINE = [
  { label: 'Offer Received', time: '2:10 PM', complete: false },
  { label: 'Offer Accepted', time: '2:14 PM', complete: false },
  { label: 'Arrived at Island Grill', time: '2:22 PM', complete: false },
  { label: 'Order Picked Up', time: '2:26 PM', complete: false },
  { label: 'Arrived at Customer', time: '2:41 PM', complete: false },
  { label: 'Delivery Complete', time: '2:42 PM', complete: true },
];

type DeliveryDetailPageProps = {
  onBack: () => void;
};

export function DeliveryDetailPage({ onBack }: DeliveryDetailPageProps) {
  const { earnings, restaurant, customerName, checklist } = MOCK_ACTIVE_DELIVERY;

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
        <div className="rounded-xl overflow-hidden shadow-soft bg-surface h-48 relative">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url('${DETAIL_MAP}')` }}
          />
        </div>

        <div className="bg-surface rounded-xl p-4 shadow-soft border-l-4 border-success">
          <div className="flex justify-between items-start gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <MaterialIcon name="check_circle" className="text-success text-xl" filled />
                <h2 className="text-2xl font-semibold text-on-surface">Delivered</h2>
              </div>
              <p className="text-sm text-muted">Completed at 2:42 PM</p>
            </div>
            <div className="flex flex-col items-end shrink-0">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted mb-1">Rating</span>
              <div className="flex text-warning">
                {Array.from({ length: 5 }).map((_, i) => (
                  <MaterialIcon key={i} name="star" className="text-lg" filled />
                ))}
              </div>
            </div>
          </div>
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
                <p className="text-xl font-semibold text-on-surface">{restaurant}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 mt-3">
              <span className="bg-primary-container/20 p-2 rounded-full">
                <MaterialIcon name="person" className="text-primary" />
              </span>
              <div>
                <p className="text-sm text-muted">Customer</p>
                <p className="text-xl font-semibold text-on-surface">{customerName}</p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-surface-bright">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted mb-4">Timeline</h4>
            <div className="relative pl-6 space-y-4 border-l-2 border-surface-container ml-2">
              {TIMELINE.map((event) => (
                <div key={event.label} className="relative">
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
        </div>

        <div className="bg-surface rounded-xl p-4 shadow-soft">
          <h3 className="text-xl font-semibold text-on-surface mb-4">Order Items</h3>
          <ul className="space-y-2">
            {checklist.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-2 py-2 border-b border-surface-container last:border-0"
              >
                <span className="bg-surface-container text-on-surface px-2 py-1 rounded text-xs font-semibold uppercase tracking-wide">
                  {item.label.match(/x\d+/i)?.[0] ?? '1x'}
                </span>
                <span className="text-sm text-on-surface">
                  {item.label.replace(/\s*x\d+/i, '').trim()}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-surface rounded-xl p-4 shadow-soft">
          <h3 className="text-xl font-semibold text-on-surface mb-4 flex items-center gap-2">
            <MaterialIcon name="payments" className="text-primary" />
            Earnings Breakdown
          </h3>
          <div className="space-y-1">
            <div className="flex justify-between text-sm text-muted py-1">
              <span>Base Pay</span>
              <span>J${earnings.basePay}</span>
            </div>
            <div className="flex justify-between text-sm text-muted py-1">
              <span>Distance</span>
              <span>J${earnings.distanceBonus}</span>
            </div>
            <div className="flex justify-between text-sm text-muted py-1">
              <span>Tip</span>
              <span className="text-success">J${earnings.tip}</span>
            </div>
            <div className="h-px bg-surface-container my-2" />
            <div className="flex justify-between text-xl font-semibold text-on-surface pt-1">
              <span>Total Earnings</span>
              <span className="text-primary font-bold">J${earnings.total}</span>
            </div>
          </div>
        </div>

        <div className="bg-surface rounded-xl p-4 shadow-soft">
          <h3 className="text-xl font-semibold text-on-surface mb-4">Proof of Delivery</h3>
          <div
            className="rounded-lg overflow-hidden h-32 relative w-1/2 min-w-[140px] bg-cover bg-center"
            style={{ backgroundImage: `url('${PROOF_IMAGE}')` }}
          >
            <div className="absolute inset-0 bg-black/10 flex items-center justify-center">
              <MaterialIcon name="photo_camera" className="text-white text-[32px] drop-shadow-md" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
