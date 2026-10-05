import { useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { API_ENDPOINTS, supabaseAnonFunctionHeaders } from '@roam/api-client';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { formatJmd } from '@/lib/restaurantContent';
import { isAllowedPaymentRedirectUrl } from '@/lib/resumePayment';
import { toast } from 'sonner';

type HistoryRow = { at: string; eventType: string; reason: string; amountMajor: number };

type Props = {
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
  session: Session | null;
};

export default function WalletPage({ onNavigate, session }: Props) {
  const [words, setWords] = useState('Loading your balance…');
  const [reason, setReason] = useState('');
  const [owed, setOwed] = useState(0);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [paying, setPaying] = useState(false);

  const load = async () => {
    if (!session?.access_token) return;
    const res = await fetch(`${API_ENDPOINTS.delivery}/customer/wallet`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) {
      setWords('Could not load your balance');
      return;
    }
    const body = await res.json();
    setWords(String(body.words || 'No balance'));
    setReason(String(body.reason || ''));
    setOwed(Math.max(0, Number(body.balanceMajor || 0)));
    setHistory(Array.isArray(body.history) ? body.history : []);
  };

  useEffect(() => {
    void load();
  }, [session?.access_token]);

  const payBalance = async () => {
    if (!session?.access_token || paying || owed <= 0) return;
    setPaying(true);
    try {
      const res = await fetch(`${API_ENDPOINTS.payments}/wallet-debt`, {
        method: 'POST',
        headers: supabaseAnonFunctionHeaders({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        }),
        body: JSON.stringify({ returnOrigin: window.location.origin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Could not start the payment');
      if ((data as { demoPaid?: boolean }).demoPaid) {
        toast.success('Balance paid');
        await load();
        return;
      }
      const redirectUrl = (data as { paymentRedirectUrl?: string }).paymentRedirectUrl;
      if (!isAllowedPaymentRedirectUrl(redirectUrl)) throw new Error('Invalid payment redirect URL');
      window.location.assign(redirectUrl!);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start the payment');
      setPaying(false);
    }
  };

  return (
    <div className="min-h-full bg-background pb-28">
      <header className="sticky top-0 z-40 flex items-center gap-2 bg-surface px-4 py-3 shadow-sm safe-t">
        <button type="button" onClick={() => onNavigate('account')} className="flex h-11 w-11 items-center justify-center" aria-label="Back">
          <MaterialIcon name="arrow_back" />
        </button>
        <h1 className="text-headline-sm font-semibold text-on-surface">Wallet</h1>
      </header>
      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pt-6">
        <section className="rounded-xl bg-surface-container-lowest p-6 shadow-[0px_4px_20px_rgba(0,0,0,0.04)]">
          <p className="text-label-md uppercase text-on-surface-variant">Balance</p>
          <p className="mt-2 text-headline-md font-semibold text-on-surface">{words}</p>
          {reason && <p className="mt-2 text-body-sm text-on-surface-variant">{reason}</p>}
          {owed > 0 && (
            <button
              type="button"
              onClick={() => void payBalance()}
              disabled={paying}
              className="mt-4 w-full rounded-xl bg-primary py-4 text-headline-sm font-semibold text-on-primary disabled:opacity-50"
            >
              {paying ? 'Starting payment…' : `Pay balance ${formatJmd(owed)}`}
            </button>
          )}
        </section>
        <section className="rounded-xl bg-surface-container-lowest p-4">
          <h2 className="mb-3 text-label-md font-semibold uppercase text-on-surface-variant">History</h2>
          {history.length === 0 ? (
            <p className="text-body-sm text-on-surface-variant">No balance activity yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {history.map((row) => (
                <li key={`${row.at}-${row.eventType}-${row.amountMajor}`} className="flex items-start justify-between gap-3 text-body-sm">
                  <div>
                    <p className="font-medium text-on-surface">{row.amountMajor > 0 ? 'Balance added' : 'Balance paid'}</p>
                    <p className="text-on-surface-variant">{row.reason}</p>
                  </div>
                  <span className="shrink-0 font-semibold">{row.amountMajor > 0 ? formatJmd(row.amountMajor) : formatJmd(Math.abs(row.amountMajor))}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
