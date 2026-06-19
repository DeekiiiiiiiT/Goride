import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { RideRequestRow } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';
import { resolveLockedFareMinor } from '@roam/types/cashSettlementDisplay';
import { haulCashQrUrl } from '../../utils/haulCashSettlement';
import { haulJobRef } from '../../utils/haulRideFormat';

const EXPIRY_SECONDS = 5 * 60;

type Props = {
  ride: RideRequestRow;
  submitting: boolean;
  onSubmit: (cashReceivedMinor: number, idempotencyKey: string) => Promise<void>;
  onClose?: () => void;
};

export function HaulCashSettlementView({ ride, submitting, onSubmit, onClose }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(EXPIRY_SECONDS);
  const [showIssue, setShowIssue] = useState(false);
  const [customAmount, setCustomAmount] = useState('');
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const currency = ride.currency ?? 'JMD';
  const owedMinor = resolveLockedFareMinor(ride) ?? ride.fare_final_minor ?? ride.fare_estimate_minor ?? 0;
  const owedLabel = formatMoneyMinor(owedMinor, currency);
  const qrUrl = useMemo(() => haulCashQrUrl(ride.id), [ride.id]);

  useEffect(() => {
    const t = window.setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(t);
  }, []);

  const timerLabel = `${String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:${String(secondsLeft % 60).padStart(2, '0')}`;

  const submitAmount = async (minor: number) => {
    try {
      await onSubmit(minor, idempotencyKey);
    } catch {
      // toast handled upstream
    }
  };

  const handleReceived = () => void submitAmount(owedMinor);

  const handleCustomSubmit = () => {
    const cleaned = customAmount.replace(/[^0-9.]/g, '');
    const major = Number.parseFloat(cleaned);
    if (!Number.isFinite(major) || major < 0) {
      toast.error('Enter a valid amount');
      return;
    }
    void submitAmount(Math.round(major * 100));
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#060e20] text-[#dae2fd]">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#2d3449] px-4">
        <button
          type="button"
          onClick={onClose}
          className="flex h-11 w-11 items-center justify-center text-[#d8c3ad] active:scale-90"
          aria-label="Close"
        >
          <span className="material-symbols-outlined">close</span>
        </button>
        <div className="text-sm font-medium tracking-widest text-[#d8c3ad] uppercase">{haulJobRef(ride)}</div>
        <div className="h-11 w-11" />
      </header>

      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-6">
        <div className="mb-8 flex flex-col items-center text-center">
          <h1 className="mb-2 text-3xl font-bold text-[#dae2fd]">Cash Collection Required</h1>
          <p className="max-w-[280px] text-[#d8c3ad]">
            Present this code to the receiver to confirm the transaction.
          </p>
        </div>

        <div className="mb-6 flex justify-center">
          <span className="text-5xl font-extrabold tracking-tight text-[#ffc174]">{owedLabel}</span>
        </div>

        <div className="relative mx-auto mb-8 w-full max-w-[320px] overflow-hidden rounded-xl border border-[#534434] bg-[#0b1326] p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]">
          <div className="absolute top-4 left-4 h-4 w-4 rounded-tl-sm border-t-2 border-l-2 border-[#ffc174]/50" />
          <div className="absolute top-4 right-4 h-4 w-4 rounded-tr-sm border-t-2 border-r-2 border-[#ffc174]/50" />
          <div className="absolute bottom-4 left-4 h-4 w-4 rounded-bl-sm border-b-2 border-l-2 border-[#ffc174]/50" />
          <div className="absolute right-4 bottom-4 h-4 w-4 rounded-br-sm border-r-2 border-b-2 border-[#ffc174]/50" />
          <div className="mb-2 flex aspect-square w-full items-center justify-center rounded-lg bg-white p-2">
            <img src={qrUrl} alt="Cash collection QR code" className="h-full w-full object-contain" />
          </div>
          <div className="flex items-center justify-center gap-1 rounded-full border border-[#ffc174]/20 bg-[#ffc174]/10 px-3 py-1 text-sm text-[#ffc174]">
            <span className="material-symbols-outlined text-[18px]">timer</span>
            <span>Code expires in {timerLabel}</span>
          </div>
        </div>

        {showIssue ? (
          <div className="mb-4 rounded-xl border border-[#534434] bg-[#171f33] p-4">
            <p className="mb-3 text-sm text-[#d8c3ad]">Enter the cash amount you received, if different.</p>
            <input
              type="text"
              inputMode="decimal"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              placeholder={owedLabel.replace(/[^\d.,]/g, '')}
              className="mb-3 w-full rounded-lg border border-[#534434] bg-[#0b1326] px-4 py-3 text-2xl font-bold text-[#dae2fd] focus:border-[#ffc174] focus:outline-none"
            />
            <button
              type="button"
              disabled={submitting}
              onClick={handleCustomSubmit}
              className="w-full rounded-lg bg-[#ffc174] py-3 font-semibold text-[#472a00] disabled:opacity-50"
            >
              Submit amount
            </button>
          </div>
        ) : null}

        <div className="mt-auto flex flex-col gap-2 pb-6">
          <button
            type="button"
            disabled={submitting}
            onClick={handleReceived}
            className="flex h-14 w-full items-center justify-center rounded-lg bg-[#ffc174] text-lg font-semibold text-[#472a00] transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {submitting ? 'Confirming…' : 'I received the cash'}
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => setShowIssue((v) => !v)}
            className="flex h-14 w-full items-center justify-center rounded-lg border border-[#a08e7a] text-lg font-semibold text-[#ffc174] transition-colors hover:bg-[#2d3449]/30 active:scale-[0.98]"
          >
            Payment issue
          </button>
        </div>
      </main>
    </div>
  );
}
