import { useState } from 'react';
import { toast } from 'sonner';
import { MaterialIcon } from '../../../signup/components/MaterialIcon';
import { endShift } from '../../../lib/partner-api';
import {
  clearShift,
  getActingMember,
  resolveShiftSurface,
  type ShiftSessionSurface,
} from '../../../lib/station-shift-session';

interface EndShiftButtonProps {
  merchantId: string;
  shiftSurface?: ShiftSessionSurface;
  onEnded: () => void;
}

export default function EndShiftButton({
  merchantId,
  shiftSurface = resolveShiftSurface(),
  onEnded,
}: EndShiftButtonProps) {
  const [isEnding, setIsEnding] = useState(false);
  const acting = getActingMember(merchantId, shiftSurface);

  if (!acting) return null;

  const handleEnd = async () => {
    setIsEnding(true);
    try {
      await endShift(merchantId);
      clearShift(merchantId, shiftSurface);
      onEnded();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not end shift');
    } finally {
      setIsEnding(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleEnd()}
      disabled={isEnding}
      className="flex h-10 items-center gap-1 rounded-full border border-outline-variant px-3 text-label-md font-semibold text-on-surface-variant"
    >
      <MaterialIcon name="logout" size={18} />
      {isEnding ? 'Ending…' : 'End shift'}
    </button>
  );
}
