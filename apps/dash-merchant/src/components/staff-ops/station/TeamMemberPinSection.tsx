import { formatPinStatusLabel, type PinStatus } from '../../../types/team';

interface TeamMemberPinSectionProps {
  pinStatus?: PinStatus;
  onResetPin: () => void;
  isResetting?: boolean;
}

function statusChipClass(status: PinStatus | undefined) {
  if (status === 'active') return 'bg-primary-container/15 text-primary-container';
  if (status === 'locked') return 'bg-error-container text-on-error-container';
  return 'bg-warning-container text-on-surface';
}

export default function TeamMemberPinSection({
  pinStatus = 'unset',
  onResetPin,
  isResetting = false,
}: TeamMemberPinSectionProps) {
  return (
    <div className="space-y-inset-md rounded-lg border border-outline-variant bg-surface-container-low p-inset-md">
      <div className="flex items-center justify-between gap-inset-sm">
        <p className="text-label-md text-on-surface-variant">PIN status</p>
        <span
          className={`rounded-full px-3 py-1 text-label-sm font-semibold ${statusChipClass(pinStatus)}`}
        >
          {formatPinStatusLabel(pinStatus)}
        </span>
      </div>
      <p className="text-body-sm text-on-surface-variant">
        Staff set their own PIN on the store tablet. Resetting locks their account until they create
        a new PIN.
      </p>
      <button
        type="button"
        onClick={onResetPin}
        disabled={isResetting}
        className="h-11 w-full rounded-full border border-error text-label-lg font-semibold text-error disabled:opacity-50"
      >
        {isResetting ? 'Resetting…' : 'Reset PIN'}
      </button>
    </div>
  );
}
