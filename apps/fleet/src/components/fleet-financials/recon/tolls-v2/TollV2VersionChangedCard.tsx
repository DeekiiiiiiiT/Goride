import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { TollV2PrimaryButton } from './TollV2Buttons';

export function TollV2VersionChangedCard({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-[#0b1c30]"
      data-testid="toll-v2-version-changed"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-amber-700" aria-hidden />
        <span className="font-semibold">Someone else changed this toll</span>
      </div>
      <TollV2PrimaryButton type="button" onClick={onDismiss} data-testid="toll-v2-version-ok">
        OK
      </TollV2PrimaryButton>
    </div>
  );
}
