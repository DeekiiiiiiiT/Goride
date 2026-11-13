import React from 'react';
import { createPortal } from 'react-dom';
import { TollV2PrimaryButton } from './TollV2Buttons';

/**
 * Phone only (Screen 13): "n left to decide" + Seal tolls, stuck above the app's own bottom nav.
 * Rendered on document.body so a transformed page wrapper can't shift or clip it (P3-R4 check:
 * the bar overflowed to the right and its text wrapped one word per line).
 */
export function TollV2MobileSealBar({
  left,
  sealing,
  onSeal,
  hidden,
}: {
  left: number;
  sealing: boolean;
  onSeal: () => void;
  hidden?: boolean;
}) {
  if (hidden || typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="fixed inset-x-0 bottom-16 z-30 border-t border-[#e5eeff] bg-white px-4 py-3 shadow-[0_-4px_12px_rgba(15,23,42,0.06)] sm:hidden"
      data-testid="toll-v2-mobile-seal-bar"
    >
      <div className="mx-auto flex max-w-md items-center justify-between gap-3">
        <span className="whitespace-nowrap text-sm font-medium text-[#0b1c30]">
          {left > 0 ? `${left} left to decide` : 'Everything adds up'}
        </span>
        <TollV2PrimaryButton
          type="button"
          className="w-auto shrink-0 px-5"
          disabled={sealing || left > 0}
          onClick={onSeal}
        >
          Seal tolls
        </TollV2PrimaryButton>
      </div>
    </div>,
    document.body,
  );
}
