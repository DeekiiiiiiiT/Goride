/**
 * Full-screen COD remittance pause — from 403 body (balanceMinor / thresholdMinor).
 */
import React from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { formatJmd } from '@/lib/formatMoney';

type Props = {
  balanceMinor: number;
  thresholdMinor: number;
  onViewDetail: () => void;
  onDismiss?: () => void;
};

export function RemittancePausedScreen({
  balanceMinor,
  thresholdMinor,
  onViewDetail,
  onDismiss,
}: Props) {
  const balanceJmd = balanceMinor / 100;
  const thresholdJmd = thresholdMinor / 100;

  return (
    <div className="fixed inset-0 z-[100] bg-surface flex flex-col items-center justify-center px-6 text-center">
      <MaterialIcon name="pause_circle" className="text-6xl text-amber-600 mb-4" />
      <h1 className="text-2xl font-bold text-on-surface">Account paused</h1>
      <p className="mt-3 text-sm text-muted max-w-sm">
        You’re holding{' '}
        <span className="font-semibold text-on-surface">J${formatJmd(balanceJmd)}</span> in cash
        for Roam (pause at J${formatJmd(thresholdJmd)}). Remit to go online again — this is not
        your earnings.
      </p>
      <button
        type="button"
        onClick={onViewDetail}
        className="mt-8 w-full max-w-sm py-3 rounded-xl bg-primary text-on-primary font-semibold"
      >
        How to remit
      </button>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="mt-3 text-sm text-muted underline">
          Close
        </button>
      )}
    </div>
  );
}
