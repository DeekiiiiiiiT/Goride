import { useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';

const WAITLIST_KEY = 'roam-dash-waitlist-email';

type Props = {
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
  returnTo?: string;
  onReturn?: () => void;
};

export default function OutOfDeliveryPage({ onNavigate, returnTo = 'saved-addresses', onReturn }: Props) {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    try {
      localStorage.setItem(WAITLIST_KEY, email.trim());
    } catch {
      // ignore
    }
    setSubmitted(true);
  };

  const handleTryDifferent = () => {
    if (onReturn) {
      onReturn();
      return;
    }
    if (returnTo === 'delivery-address') {
      onNavigate('home');
      return;
    }
    onNavigate(returnTo);
  };

  return (
    <div className="bg-background min-h-screen font-body-md text-on-background antialiased flex flex-col justify-center items-center px-4">
      <main className="w-full max-w-md mx-auto flex flex-col items-center text-center">
        <div className="mb-6 rounded-full bg-surface-container-high w-32 h-32 flex items-center justify-center shadow-sm">
          <MaterialIcon
            name="sentiment_dissatisfied"
            className="text-outline-variant text-6xl"
            filled
          />
        </div>

        <h1 className="text-headline-lg-mobile font-bold text-on-surface mb-2">
          We don&apos;t deliver here yet
        </h1>
        <p className="text-body-lg text-on-surface-variant mb-8 px-4">
          We&apos;re expanding soon! Enter your email to be notified when we arrive in your neighborhood.
        </p>

        {submitted ? (
          <p className="text-body-md text-primary font-medium mb-6">
            Thanks! We&apos;ll notify you at {email}.
          </p>
        ) : (
          <form className="w-full flex flex-col gap-4" onSubmit={handleSubmit}>
            <label htmlFor="notify-email" className="sr-only">
              Email address
            </label>
            <input
              id="notify-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="w-full bg-[#F3F4F6] border-none text-on-surface text-body-md px-4 py-4 rounded-lg focus:bg-white focus:ring-2 focus:ring-primary-container focus:outline-none transition-colors"
            />
            <button
              type="submit"
              className="w-full bg-primary-container text-white text-label-md font-semibold tracking-wide py-4 rounded-lg shadow-sm active:scale-95 transition-transform"
            >
              Notify Me
            </button>
          </form>
        )}

        <div className="mt-6">
          <button
            type="button"
            onClick={handleTryDifferent}
            className="text-label-md font-semibold tracking-wide text-primary-container hover:opacity-80 transition-opacity"
          >
            Try a different address
          </button>
        </div>
      </main>
    </div>
  );
}
