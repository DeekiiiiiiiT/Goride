import { useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { toast } from 'sonner';

type Props = {
  returnTo?: string;
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
};

export default function AddCardPage({ returnTo = 'payment-methods', onNavigate }: Props) {
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [cardName, setCardName] = useState('');
  const [saveCard, setSaveCard] = useState(true);

  const formatCardNumber = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 16);
    return digits.match(/.{1,4}/g)?.join(' ') ?? digits;
  };

  const formatExpiry = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 4);
    if (digits.length >= 3) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return digits;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardNumber || !expiry || !cvv || !cardName) {
      toast.error('Please fill in all card details');
      return;
    }
    toast.success('Card added successfully');
    onNavigate(returnTo);
  };

  return (
    <div className="bg-background min-h-screen flex flex-col items-center">
      <header className="fixed top-0 w-full z-50 flex justify-between items-center px-4 h-16 bg-surface shadow-sm md:hidden">
        <button
          type="button"
          onClick={() => onNavigate(returnTo)}
          className="p-2 rounded-full text-on-surface"
        >
          <MaterialIcon name="arrow_back" />
        </button>
        <h1 className="text-headline-md font-bold text-primary absolute left-1/2 -translate-x-1/2">Add Card</h1>
        <div className="w-10" />
      </header>

      <main className="w-full max-w-lg mt-16 md:mt-8 px-4 flex-1 pb-28">
        <div className="hidden md:flex items-center mb-6 pt-8">
          <button
            type="button"
            onClick={() => onNavigate(returnTo)}
            className="p-2 rounded-full text-on-surface mr-4"
          >
            <MaterialIcon name="arrow_back" />
          </button>
          <h1 className="text-headline-lg font-bold text-on-surface">Add Card</h1>
        </div>

        <div className="bg-white/95 backdrop-blur rounded-[24px] p-6 mt-6 md:mt-0 relative overflow-hidden shadow-[0px_4px_20px_rgba(0,0,0,0.04)]">
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary-container rounded-full blur-2xl opacity-20 pointer-events-none" />

          <form className="space-y-6 relative z-10" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="cardNumber" className="block text-label-md font-semibold text-on-surface-variant mb-2">
                Card Number
              </label>
              <div className="relative">
                <MaterialIcon name="credit_card" className="absolute left-4 top-1/2 -translate-y-1/2 text-outline" />
                <input
                  id="cardNumber"
                  value={cardNumber}
                  onChange={e => setCardNumber(formatCardNumber(e.target.value))}
                  placeholder="0000 0000 0000 0000"
                  className="checkout-input w-full pl-12 pr-12 py-4 rounded-xl text-body-md"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-outline-variant italic text-sm">
                  VISA
                </span>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-1">
                <label htmlFor="expiry" className="block text-label-md font-semibold text-on-surface-variant mb-2">
                  Expiry Date
                </label>
                <input
                  id="expiry"
                  value={expiry}
                  onChange={e => setExpiry(formatExpiry(e.target.value))}
                  placeholder="MM/YY"
                  maxLength={5}
                  className="checkout-input w-full px-4 py-4 rounded-xl text-body-md text-center"
                />
              </div>
              <div className="flex-1">
                <label htmlFor="cvv" className="block text-label-md font-semibold text-on-surface-variant mb-2">
                  CVV
                </label>
                <input
                  id="cvv"
                  type="password"
                  value={cvv}
                  onChange={e => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="•••"
                  className="checkout-input w-full px-4 py-4 rounded-xl text-body-md text-center tracking-widest"
                />
              </div>
            </div>

            <div>
              <label htmlFor="cardName" className="block text-label-md font-semibold text-on-surface-variant mb-2">
                Cardholder Name
              </label>
              <input
                id="cardName"
                value={cardName}
                onChange={e => setCardName(e.target.value)}
                placeholder="John Doe"
                className="checkout-input w-full px-4 py-4 rounded-xl text-body-md"
              />
            </div>

            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={saveCard}
                  onChange={e => setSaveCard(e.target.checked)}
                  className="peer h-5 w-5 appearance-none rounded-md border-2 border-outline-variant checked:border-primary-container checked:bg-primary-container"
                />
                <MaterialIcon
                  name="check"
                  className="absolute inset-0 m-auto text-white text-[16px] opacity-0 peer-checked:opacity-100 pointer-events-none"
                />
              </div>
              <span className="text-body-sm text-on-surface group-hover:text-primary transition-colors">
                Save card for future orders
              </span>
            </label>
          </form>
        </div>

        <div className="mt-6 flex flex-col items-center space-y-2 opacity-60">
          <div className="flex items-center gap-2 text-on-surface-variant">
            <MaterialIcon name="lock" className="text-[18px]" />
            <span className="text-label-sm uppercase tracking-wider">Secure Encrypted Payment</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-label-sm text-outline-variant border border-outline-variant px-2 py-1 rounded">
              PCI DSS
            </span>
            <span className="text-label-sm text-outline-variant border border-outline-variant px-2 py-1 rounded">
              256-BIT SSL
            </span>
          </div>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 w-full bg-surface/90 backdrop-blur-md border-t border-surface-dim p-4 pb-safe z-40">
        <div className="max-w-lg mx-auto">
          <button
            type="button"
            onClick={handleSubmit}
            className="w-full bg-primary-container text-white text-headline-sm font-semibold py-4 rounded-xl active:scale-[0.98] transition-transform"
          >
            Add Card
          </button>
        </div>
      </div>
    </div>
  );
}
