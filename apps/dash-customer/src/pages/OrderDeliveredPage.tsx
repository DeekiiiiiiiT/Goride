import { useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { DeliveryPhotoViewer } from '@/components/ui/DeliveryPhotoViewer';
import { StarRating } from '@/components/rating/StarRating';
import { FEEDBACK_CHIPS, formatJmd, TRACKING_MAP_IMAGES } from '@/lib/trackingContent';

type Props = {
  orderNumber?: string;
  tip?: number;
  merchantId?: string;
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
};

export default function OrderDeliveredPage({
  orderNumber = '8492',
  tip = 400,
  merchantId = 'island-grill',
  onNavigate,
}: Props) {
  const [rating, setRating] = useState(0);
  const [selectedChips, setSelectedChips] = useState<string[]>([]);

  const toggleChip = (chip: string) => {
    setSelectedChips(prev => (prev.includes(chip) ? prev.filter(c => c !== chip) : [...prev, chip]));
  };

  return (
    <div className="bg-background min-h-screen text-on-surface pb-safe">
      <header className="w-full flex items-center justify-between px-4 h-16 pt-safe">
        <button type="button" onClick={() => onNavigate('home')} className="w-10 h-10 flex items-center justify-center rounded-full">
          <MaterialIcon name="close" />
        </button>
        <span className="text-headline-sm font-semibold">Order Details</span>
        <div className="w-10" />
      </header>

      <main className="px-4 pb-36">
        <div className="flex flex-col items-center text-center mt-6 mb-8">
          <div className="w-20 h-20 bg-primary-container/20 rounded-full flex items-center justify-center mb-4 relative">
            <MaterialIcon name="check_circle" className="text-primary text-[40px]" filled />
            <div className="absolute inset-0 border-2 border-primary-container rounded-full animate-ping opacity-20" />
          </div>
          <h1 className="text-headline-lg-mobile font-bold mb-1">Your order has been delivered!</h1>
          <p className="text-body-md text-on-surface-variant">Enjoy your meal.</p>
        </div>

        <section className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden mb-8">
          <DeliveryPhotoViewer
            src={TRACKING_MAP_IMAGES.proofOfDelivery}
            timestamp="Photo taken at 2:42 PM"
            location="Left at your door"
          />
        </section>

        <section className="mb-8">
          <h2 className="text-headline-md font-semibold text-center mb-4">Rate your experience</h2>
          <StarRating value={rating} onChange={setRating} className="justify-center mb-6" />
          <div className="flex flex-wrap justify-center gap-2">
            {FEEDBACK_CHIPS.map(chip => (
              <button
                key={chip}
                type="button"
                onClick={() => toggleChip(chip)}
                className={`px-4 py-2 rounded-full border font-semibold text-label-md transition-all ${
                  selectedChips.includes(chip)
                    ? 'bg-primary-container/10 border-primary-container text-primary'
                    : 'border-outline-variant text-on-surface-variant'
                }`}
              >
                {chip}
              </button>
            ))}
          </div>
        </section>

        <section className="bg-surface-container rounded-xl p-4 mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
              <MaterialIcon name="volunteer_activism" className="text-primary" />
            </div>
            <div>
              <h3 className="text-label-md font-semibold">Courier Tip</h3>
              <p className="text-body-sm text-on-surface-variant">Currently {formatJmd(tip)}</p>
            </div>
          </div>
          <button type="button" className="text-label-md font-semibold text-primary">
            Add or adjust
          </button>
        </section>
      </main>

      <div className="fixed bottom-0 left-0 w-full bg-surface-container-lowest border-t border-surface-variant px-4 py-4 pb-safe z-50">
        <button
          type="button"
          onClick={() =>
            onNavigate('rate-order', {
              orderId: orderNumber,
              merchantName: 'Island Grill',
              deliveredAt: '2:42 PM',
            })
          }
          className="w-full bg-primary text-on-primary font-semibold text-label-md py-4 rounded-lg mb-2 active:scale-[0.98] transition-transform"
        >
          Rate Order
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onNavigate('restaurant', { merchantId })}
            className="flex-1 border border-primary text-primary font-semibold text-label-md py-3 rounded-lg active:scale-[0.98] transition-transform"
          >
            Reorder
          </button>
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className="flex-1 text-on-surface-variant font-semibold text-label-md py-3 rounded-lg active:scale-[0.98] transition-transform"
          >
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}
