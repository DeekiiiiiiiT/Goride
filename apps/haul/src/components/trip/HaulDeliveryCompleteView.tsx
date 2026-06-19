import React, { useState } from 'react';
import type { RideRequestRow } from '@roam/types/rides';
import { HaulBottomNav } from '../layout/HaulBottomNav';
import { buildHaulEarningsLines } from '../../utils/haulRideFormat';

type Props = {
  ride: RideRequestRow;
  onDone: () => void;
};

export function HaulDeliveryCompleteView({ ride, onDone }: Props) {
  const [rating, setRating] = useState(0);
  const [note, setNote] = useState('');
  const { lines, total } = buildHaulEarningsLines(ride);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0b1326]">
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center overflow-y-auto px-4 py-8 pb-24">
        <div className="flex flex-col gap-6 rounded-xl border border-[#2d3449] bg-[#171f33] p-6 shadow-lg">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-[#30c88f] bg-[#30c88f]/20">
              <span
                className="material-symbols-outlined text-5xl text-[#4edea3]"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                check_circle
              </span>
            </div>
            <h1 className="text-3xl font-bold text-[#dae2fd]">Delivery Complete!</h1>
            <p className="text-[#d8c3ad]">Payment has been processed successfully.</p>
          </div>

          <hr className="border-[#534434]" />

          <div className="flex flex-col gap-2">
            <h2 className="mb-1 text-lg font-semibold text-[#dae2fd]">Earnings Breakdown</h2>
            {lines.map((line) => (
              <div key={line.label} className="flex items-center justify-between py-2">
                <span className="flex items-center gap-1 text-[#d8c3ad]">
                  {line.label}
                  {line.badge ? (
                    <span className="rounded border border-[#ffc174]/30 bg-[#ffc174]/10 px-1 text-xs text-[#ffc174]">
                      {line.badge}
                    </span>
                  ) : null}
                </span>
                <span className="text-[#dae2fd]">{line.value}</span>
              </div>
            ))}
          </div>

          <hr className="border-[#534434]" />

          <div className="flex items-end justify-between">
            <span className="text-lg font-semibold text-[#dae2fd]">Total Payout</span>
            <span className="text-5xl font-extrabold text-[#ffc174]">{total}</span>
          </div>

          <hr className="border-[#534434]" />

          <div className="flex flex-col gap-4">
            <div className="flex flex-col items-center gap-2">
              <span className="text-sm tracking-widest text-[#d8c3ad] uppercase">Rate Customer</span>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className="focus:outline-none"
                    aria-label={`Rate ${star} stars`}
                  >
                    <span
                      className={`material-symbols-outlined text-2xl transition-colors ${
                        star <= rating ? 'text-[#ffc174]' : 'text-[#a08e7a]'
                      }`}
                      style={{ fontVariationSettings: star <= rating ? "'FILL' 1" : "'FILL' 0" }}
                    >
                      star
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note about the delivery..."
              className="min-h-[100px] w-full resize-none rounded-lg border border-[#534434] bg-[#0b1326] p-4 text-[#dae2fd] placeholder:text-[#d8c3ad]/50 focus:border-[#ffc174] focus:ring-1 focus:ring-[#ffc174] focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={onDone}
            className="mt-2 flex h-11 w-full items-center justify-center rounded-lg bg-[#ffc174] text-lg font-semibold text-[#2a1700] transition-colors hover:bg-[#ffddb8]"
          >
            Done
          </button>
        </div>
      </main>

      <HaulBottomNav active="earnings" onChange={() => onDone()} />
    </div>
  );
}
