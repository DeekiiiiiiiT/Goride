import { useEffect } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { fireConfetti } from '@/lib/confetti';
import { formatJmd } from '@/lib/restaurantContent';

type OrderItem = {
  name: string;
  quantity: number;
  note?: string;
};

type Props = {
  orderId?: string;
  orderNumber?: string;
  total?: number;
  eta?: string;
  items?: OrderItem[];
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
};

export default function OrderConfirmationPage({
  orderId,
  orderNumber = 'RD-1042',
  total = 0,
  eta = '25-35 minutes',
  items = [],
  onNavigate,
}: Props) {
  const displayItems =
    items.length > 0
      ? items
      : [
          { quantity: 1, name: 'Jerk Chicken Meal', note: 'Large, Rice & Peas, Extra Sauce' },
          { quantity: 2, name: 'Festival (3 pcs)' },
        ];

  useEffect(() => {
    fireConfetti();
  }, []);

  return (
    <div className="bg-background text-on-background antialiased min-h-screen flex flex-col items-center p-4 pb-24">
      <main className="w-full max-w-md mx-auto flex flex-col items-center flex-grow pt-8">
        <div className="flex flex-col items-center text-center mb-8 w-full">
          <div className="order-success-anim w-24 h-24 rounded-full bg-surface-container-highest flex items-center justify-center mb-6 relative">
            <div className="absolute inset-0 rounded-full bg-primary-container opacity-20 blur-xl" />
            <svg className="w-12 h-12 text-primary z-10" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
              <path className="order-check-path" d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="text-headline-lg-mobile md:text-headline-lg font-bold text-on-background mb-2">
            Order Placed!
          </h1>
          <p className="text-body-md text-on-surface-variant">Order #{orderNumber}</p>
        </div>

        <div className="w-full bg-surface rounded-xl p-6 shadow-sm mb-6 flex flex-col items-center border border-surface-container-highest">
          <MaterialIcon name="schedule" className="text-primary mb-2 text-3xl" filled />
          <p className="text-body-sm text-on-surface-variant mb-1 uppercase tracking-wider">Estimated Delivery</p>
          <p className="text-headline-md font-semibold text-on-background text-center">{eta}</p>
        </div>

        <div className="w-full bg-surface rounded-xl p-4 shadow-sm mb-8 border border-surface-container-highest">
          <div className="flex justify-between items-center mb-4 pb-2 border-b border-surface-container-high">
            <h3 className="text-headline-sm font-semibold text-on-background">Order Summary</h3>
            <span className="text-label-md font-semibold text-primary">
              {total > 0 ? formatJmd(total) : formatJmd(3855)}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {displayItems.map((item, idx) => (
              <div key={idx} className="flex gap-4 items-start">
                <span className="text-body-md font-semibold text-on-background w-6">{item.quantity}x</span>
                <div className="flex flex-col">
                  <span className="text-body-sm text-on-background">{item.name}</span>
                  {item.note && <span className="text-label-sm text-on-surface-variant">{item.note}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="w-full flex flex-col gap-4 mb-8">
          <button
            type="button"
            onClick={() => onNavigate('tracking', { orderId })}
            className="w-full bg-primary text-on-primary font-semibold text-label-md py-4 rounded-lg shadow-sm active:scale-[0.98] transition-transform"
          >
            Track Order
          </button>
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className="w-full bg-transparent border border-primary text-primary font-semibold text-label-md py-4 rounded-lg active:scale-[0.98] transition-transform"
          >
            Back to Home
          </button>
        </div>

        <div className="w-full bg-surface-container-lowest rounded-xl p-4 shadow-sm border border-surface-container flex items-center justify-between gap-4 mt-auto">
          <div className="flex gap-4 items-center">
            <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center shrink-0">
              <MaterialIcon name="notifications_active" className="text-on-surface-variant" />
            </div>
            <div className="flex flex-col">
              <p className="text-body-sm font-semibold text-on-background">Stay Updated</p>
              <p className="text-label-sm text-on-surface-variant">Get notified when your order arrives</p>
            </div>
          </div>
          <button type="button" className="shrink-0 bg-surface-container-highest text-on-surface text-label-sm px-4 py-2 rounded-full">
            Enable
          </button>
        </div>
      </main>
    </div>
  );
}
