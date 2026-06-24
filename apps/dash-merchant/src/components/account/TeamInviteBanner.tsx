import { toast } from 'sonner';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import {
  acceptTeamInvite,
  declineTeamInvite,
  type PendingTeamInviteSummary,
} from '../../lib/partner-api';
import { formatRoleLabel, TeamRole } from '../../types/team';

interface TeamInviteBannerProps {
  invite: PendingTeamInviteSummary;
  onResolved: () => void;
}

export default function TeamInviteBanner({ invite, onResolved }: TeamInviteBannerProps) {
  const handleAccept = async () => {
    try {
      await acceptTeamInvite(invite.id);
      toast.success(`You joined ${invite.merchantName}`);
      onResolved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not accept invite');
    }
  };

  const handleDecline = async () => {
    try {
      await declineTeamInvite(invite.id);
      toast.success('Invite declined');
      onResolved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not decline invite');
    }
  };

  return (
    <div className="border-b border-outline-variant bg-primary-container/10 px-margin-mobile py-inset-md md:px-margin-tablet">
      <div className="mx-auto flex max-w-5xl flex-col gap-inset-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-inset-sm">
          <MaterialIcon name="mail" className="mt-0.5 text-primary" />
          <div>
            <p className="text-body-lg font-semibold text-on-background">
              Join {invite.merchantName}
            </p>
            <p className="text-body-sm text-on-surface-variant">
              Role: {formatRoleLabel(invite.role as TeamRole)}
            </p>
          </div>
        </div>
        <div className="flex gap-inset-sm">
          <button
            type="button"
            onClick={() => void handleDecline()}
            className="min-h-[40px] rounded-lg border border-outline-variant px-4 text-label-md text-on-surface-variant"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => void handleAccept()}
            className="min-h-[40px] rounded-lg bg-primary-container px-4 text-label-md font-semibold text-on-primary"
          >
            Accept invite
          </button>
        </div>
      </div>
    </div>
  );
}
