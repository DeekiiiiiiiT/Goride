import EndShiftButton from './EndShiftButton';
import type { RosterMember } from '../../../types/team';

interface ActingShiftBarProps {
  merchantId: string;
  member: RosterMember;
  onEnded: () => void;
}

export default function ActingShiftBar({ merchantId, member, onEnded }: ActingShiftBarProps) {
  return (
    <div className="flex items-center justify-between gap-inset-sm border-b border-outline-variant bg-surface-container-low px-margin-mobile py-2 md:px-margin-tablet">
      <p className="truncate text-label-md text-on-surface-variant">
        Signed in as <span className="font-semibold text-on-background">{member.name}</span>
      </p>
      <EndShiftButton merchantId={merchantId} onEnded={onEnded} />
    </div>
  );
}
