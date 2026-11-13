import React from 'react';
import { Check, Loader2 } from 'lucide-react';
import { useTollV2Desk } from './useTollV2Desk';
import { TollV2SecondaryButton } from './TollV2Buttons';

export function ReconTollsV2DeliveryCard({
  weekKey,
  onGoToRideshare,
}: {
  weekKey: string;
  onGoToRideshare: () => void;
}) {
  const deskQuery = useTollV2Desk(weekKey);
  const sealed = deskQuery.data?.sealed === true;

  if (deskQuery.isLoading) {
    return (
      <div
        className="flex h-24 items-center justify-center rounded-[20px] border border-[#e5eeff] bg-white text-sm text-[#47464c]"
        data-testid="toll-v2-delivery-card"
      >
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading tolls status…
      </div>
    );
  }

  return (
    <div
      className="rounded-[20px] border border-[#e5eeff] bg-white p-6 shadow-sm"
      data-testid="toll-v2-delivery-card"
    >
      {sealed ? (
        <p className="flex items-center gap-2 text-sm font-medium text-[#069669]">
          <Check className="h-5 w-5 shrink-0" aria-hidden />
          Tolls for this week are sealed
        </p>
      ) : (
        <p className="text-sm text-[#0b1c30]">
          Tolls are reconciled once for the whole fleet, in the Rideshare week.
        </p>
      )}
      <TollV2SecondaryButton type="button" className="mt-4" onClick={onGoToRideshare}>
        Go to the Rideshare week
      </TollV2SecondaryButton>
    </div>
  );
}
