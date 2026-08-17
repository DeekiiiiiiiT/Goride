import { useState } from 'react';
import { API_ENDPOINTS, supabaseAnonFunctionHeaders } from '@roam/api-client';
import { MaterialIcon } from '@/components/icons/MaterialIcon';

const WAITLIST_KEY = 'roam-dash-waitlist-email';

type Props = {
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
  returnTo?: string;
  onReturn?: () => void;
  address?: string;
};

export default function OutOfDeliveryPage({ onNavigate, returnTo = 'saved-addresses', onReturn, address }: Props) {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!value || submitting) return;
    setSubmitting(true);
    try {
      localStorage.setItem(WAITLIST_KEY, value);
    } catch {
      // ignore
    }
    try {
      await fetch(`${API_ENDPOINTS.delivery}/geo/zone-waitlist`, {
        method: 'POST',
        headers: supabaseAnonFunctionHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          email: value,
          attempted_address: address || undefined,
          source: 'out-of-delivery',
        }),
      });
    } catch {
      // Best-effort: local capture already succeeded; don't block the UX.
    } finally {
      setSubmitting(false);
      setSubmitted(true);
    }
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
    <div className="app-fullscreen-screen safe-x safe-t bg-background font-body-md text-on-background antialiased">
      <main className="flex-1 w-full max-w-md mx-auto flex flex-col justify-center items-center text-center px-4 pb-safe overflow-y-auto overscroll-contain">
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
          <form className="w-full flex flex-col gap-4" onSubmit={(e) => void handleSubmit(e)}>
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
              className="input-touch w-full bg-[#F3F4F6] border-none text-on-surface text-body-md px-4 rounded-lg focus:bg-white focus:ring-2 focus:ring-primary-container focus:outline-none transition-colors"
            />
            <button
              type="submit"
              disabled={submitting}
              className="btn-touch w-full bg-primary-container text-white text-label-md font-semibold tracking-wide py-4 rounded-lg shadow-sm active:scale-95 transition-transform disabled:opacity-60"
            >
              {submitting ? 'Submitting…' : 'Notify Me'}
            </button>
          </form>
        )}

        <div className="mt-6">
          <button
            type="button"
            onClick={handleTryDifferent}
            className="btn-touch px-4 text-label-md font-semibold tracking-wide text-primary-container hover:opacity-80 transition-opacity"
          >
            Try a different address
          </button>
        </div>
      </main>
    </div>
  );
}
