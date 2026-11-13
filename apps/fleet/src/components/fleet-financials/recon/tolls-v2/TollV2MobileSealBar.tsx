import React from 'react';
import { TollV2PrimaryButton } from './TollV2Buttons';

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
  if (hidden) return null;
  return (
    <div
      className="sticky bottom-0 z-20 -mx-4 mt-4 border-t border-[#e5eeff] bg-[#f8f9ff]/95 px-4 py-3 backdrop-blur sm:hidden"
      data-testid="toll-v2-mobile-seal-bar"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-[#47464c]">{left} left to decide</span>
        <TollV2PrimaryButton type="button" disabled={sealing || left > 0} onClick={onSeal}>
          Seal tolls
        </TollV2PrimaryButton>
      </div>
    </div>
  );
}
