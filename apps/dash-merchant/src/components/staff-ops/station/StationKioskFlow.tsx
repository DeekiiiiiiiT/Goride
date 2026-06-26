import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import StaffPickerPage from './StaffPickerPage';
import PinPad, { type PinPadMode } from './PinPad';
import type { JobStation, RosterMember } from '../../../types/team';
import {
  createStaffPin,
  fetchStationRoster,
  verifyStaffPin,
} from '../../../lib/partner-api';
import { persistShift, type ShiftSessionSurface } from '../../../lib/station-shift-session';

type KioskStep = 'picker' | 'pin';

interface StationKioskFlowProps {
  merchantId: string;
  storeName: string;
  initialStationFilter?: JobStation;
  lockStationFilter?: boolean;
  shiftSurface?: ShiftSessionSurface;
  onShiftStarted: (member: RosterMember) => void;
}

function pinModeForMember(member: RosterMember): PinPadMode {
  if (member.pinStatus === 'locked') return 'create-after-reset';
  if (member.pinStatus === 'unset') return 'create';
  return 'enter';
}

export default function StationKioskFlow({
  merchantId,
  storeName,
  initialStationFilter,
  lockStationFilter = false,
  shiftSurface = 'owner_kiosk',
  onShiftStarted,
}: StationKioskFlowProps) {
  const [step, setStep] = useState<KioskStep>('picker');
  const [members, setMembers] = useState<RosterMember[]>([]);
  const [selected, setSelected] = useState<RosterMember | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadRoster = useCallback(async () => {
    try {
      const data = await fetchStationRoster();
      setMembers(data.members);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load staff list');
    }
  }, []);

  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

  const handleSelect = (member: RosterMember) => {
    setSelected(member);
    setPinError(null);
    setStep('pin');
  };

  const handlePinComplete = async (pin: string) => {
    if (!selected) return;

    if (pin === '__mismatch__') {
      setPinError('PINs did not match. Try again.');
      return;
    }

    setIsSubmitting(true);
    setPinError(null);

    try {
      const mode = pinModeForMember(selected);
      const response =
        mode === 'enter'
          ? await verifyStaffPin({ memberId: selected.id, pin })
          : await createStaffPin({
              memberId: selected.id,
              pin,
              confirmPin: pin,
            });

      persistShift(merchantId, {
        token: response.shiftToken,
        expiresAt: response.expiresAt,
        member: response.member,
      }, shiftSurface);
      onShiftStarted(response.member);
    } catch (error) {
      setPinError(error instanceof Error ? error.message : 'Could not sign in');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (step === 'pin' && selected) {
    return (
      <PinPad
        memberName={selected.name}
        mode={pinModeForMember(selected)}
        error={isSubmitting ? 'Please wait…' : pinError}
        onBack={() => {
          setStep('picker');
          setSelected(null);
          setPinError(null);
        }}
        onComplete={(pin) => {
          if (isSubmitting) return;
          void handlePinComplete(pin);
        }}
      />
    );
  }

  return (
    <StaffPickerPage
      storeName={storeName}
      members={members}
      onSelect={handleSelect}
      initialFilter={initialStationFilter ?? 'all'}
      lockFilter={lockStationFilter}
    />
  );
}
