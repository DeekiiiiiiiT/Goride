import { useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { StarRating } from '@/components/rating/StarRating';
import { ISSUE_CHIPS } from '@/lib/ordersContent';

type Props = {
  merchantName?: string;
  deliveredAt?: string;
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
};

export default function RateOrderPage({
  merchantName = 'Sushi Zen',
  deliveredAt = '12:45 PM',
  onNavigate,
}: Props) {
  const [overall, setOverall] = useState(0);
  const [foodQuality, setFoodQuality] = useState(4);
  const [deliverySpeed, setDeliverySpeed] = useState(5);
  const [feedback, setFeedback] = useState('');
  const [issues, setIssues] = useState<string[]>([]);

  const toggleIssue = (chip: string) => {
    setIssues(prev => (prev.includes(chip) ? prev.filter(c => c !== chip) : [...prev, chip]));
  };

  const handleSubmit = () => {
    onNavigate('orders');
  };

  return (
    <div className="bg-background text-on-background min-h-screen pb-[100px]">
      <header className="flex justify-between items-center px-4 h-16 w-full max-w-[1200px] mx-auto bg-surface shadow-sm sticky top-0 z-50">
        <button
          type="button"
          aria-label="Close"
          onClick={() => onNavigate('orders')}
          className="flex items-center justify-center p-2 -ml-2 text-primary"
        >
          <MaterialIcon name="close" className="text-[24px]" />
        </button>
        <h1 className="text-headline-md font-bold text-primary">Roam Dash</h1>
        <div className="w-10" />
      </header>

      <main className="px-4 pt-6 pb-8 max-w-[600px] mx-auto">
        <div className="mb-6 text-center">
          <h2 className="text-headline-lg-mobile font-bold mb-1">How was your order?</h2>
          <p className="text-body-sm text-on-surface-variant">
            {merchantName} • Delivered {deliveredAt}
          </p>
        </div>

        <section className="bg-surface-container-lowest rounded-xl p-4 shadow-[0px_4px_20px_rgba(0,0,0,0.04)] mb-6">
          <div className="mb-6 text-center">
            <p className="text-headline-sm font-semibold mb-2">Overall Experience</p>
            <StarRating value={overall} onChange={setOverall} className="justify-center" />
          </div>

          <div className="h-px bg-outline-variant/30 w-full mb-6" />

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-body-md">Food quality</p>
              <StarRating value={foodQuality} onChange={setFoodQuality} size="sm" />
            </div>
            <div className="flex justify-between items-center">
              <p className="text-body-md">Delivery speed</p>
              <StarRating value={deliverySpeed} onChange={setDeliverySpeed} size="sm" />
            </div>
          </div>
        </section>

        <section className="mb-6">
          <label htmlFor="feedback" className="sr-only">
            Detailed Feedback
          </label>
          <textarea
            id="feedback"
            value={feedback}
            onChange={e => setFeedback(e.target.value)}
            placeholder="Tell us more (optional)"
            rows={4}
            className="w-full bg-[#F3F4F6] border-none rounded-lg p-4 text-body-md text-on-surface focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none transition-all resize-none shadow-sm"
          />
        </section>

        <section className="bg-surface-container-lowest rounded-xl p-4 shadow-[0px_4px_20px_rgba(0,0,0,0.04)] mb-8">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-headline-sm font-semibold">Something wrong?</h3>
            <button type="button" className="text-label-md font-semibold text-tertiary">
              Report a problem
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {ISSUE_CHIPS.map(chip => (
              <button
                key={chip}
                type="button"
                onClick={() => toggleIssue(chip)}
                className={`px-4 py-2 rounded-full font-semibold text-label-md transition-colors ${
                  issues.includes(chip)
                    ? 'bg-tertiary-container text-on-tertiary-container'
                    : 'bg-surface-variant text-on-surface-variant hover:bg-outline-variant/30'
                }`}
              >
                {chip}
              </button>
            ))}
          </div>
        </section>
      </main>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/90 backdrop-blur-md border-t border-outline-variant/20 pb-safe z-40">
        <div className="max-w-[600px] mx-auto">
          <button
            type="button"
            onClick={handleSubmit}
            className="w-full bg-primary text-on-primary font-semibold text-label-md h-12 rounded-lg flex items-center justify-center hover:opacity-90 active:scale-95 transition-all shadow-md"
          >
            Submit Rating
          </button>
        </div>
      </div>
    </div>
  );
}
