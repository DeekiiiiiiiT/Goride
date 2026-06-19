import React from 'react';
import type { CashSettlementResponse } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';

type Props = {
  result: CashSettlementResponse;
  onDone: () => void;
};

export function HaulCashSettlementResultView({ result, onDone }: Props) {
  const currency = result.ride.currency ?? 'JMD';
  const fareMinor = result.owed_minor ?? result.ride.fare_final_minor ?? 0;
  const receivedMinor = result.cash_received_minor;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0b1326] text-[#dae2fd]">
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-md rounded-xl border border-[#2d3449] bg-[#171f33] p-6">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-[#30c88f] bg-[#30c88f]/20">
              <span className="material-symbols-outlined text-4xl text-[#4edea3]" style={{ fontVariationSettings: "'FILL' 1" }}>
                check_circle
              </span>
            </div>
            <h1 className="text-2xl font-bold">Payment recorded</h1>
            <p className="mt-1 text-[#d8c3ad] capitalize">Outcome: {result.outcome}</p>
          </div>
          <div className="space-y-3 border-t border-[#534434] pt-4">
            <div className="flex justify-between">
              <span className="text-[#d8c3ad]">Trip fare</span>
              <span className="font-semibold">{formatMoneyMinor(fareMinor, currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#d8c3ad]">Cash received</span>
              <span className="font-semibold text-[#ffc174]">{formatMoneyMinor(receivedMinor, currency)}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onDone}
            className="mt-6 flex h-12 w-full items-center justify-center rounded-lg bg-[#ffc174] font-semibold text-[#472a00]"
          >
            Done
          </button>
        </div>
      </main>
    </div>
  );
}
