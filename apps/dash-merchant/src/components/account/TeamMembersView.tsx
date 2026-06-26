import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import QueryErrorState from '../QueryErrorState';

import PartnerSkeleton from '../PartnerSkeleton';

import { MaterialIcon } from '../../signup/components/MaterialIcon';

import { useTeamMembers } from '../../hooks/useTeamMembers';

import EditTeamMemberSheet from './EditTeamMemberSheet';

import AddTeamMemberPanel from './AddTeamMemberPanel';

import {

  formatAccessSummary,

  formatRoleLabel,

  formatPinStatusLabel,
  TeamMember,
  TeamRole,
} from '../../types/team';

import JobStationBadge from '../staff-ops/shared/JobStationBadge';
import StoreTabletSettingsSection from '../store-tablet/StoreTabletSettingsSection';
import { getStoreTabletPairing } from '../../lib/partner-api';

import { readFlag } from '../../lib/partner-feature-flags';



interface TeamMembersViewProps {
  merchantId: string;
  inStoreEnabled?: boolean;
  onBack: () => void;
}



function MemberAvatar({

  name,

  isOwner,

}: {

  name: string;

  isOwner?: boolean;

}) {

  const initial = name.trim().charAt(0).toUpperCase();



  return (

    <div

      className={`flex h-12 w-12 items-center justify-center rounded-full text-headline-md font-bold ${

        isOwner

          ? 'bg-primary-container text-on-primary-container'

          : 'bg-surface-variant text-on-surface-variant'

      }`}

    >

      {initial}

    </div>

  );

}



function RoleBadge({ role, filled = false }: { role: TeamRole; filled?: boolean }) {

  return (

    <span

      className={`rounded-full px-2 py-1 text-label-sm ${

        filled

          ? 'bg-surface-variant text-on-surface-variant'

          : 'border border-outline-variant text-on-surface-variant'

      }`}

    >

      {formatRoleLabel(role)}

    </span>

  );

}



export default function TeamMembersView({ merchantId, inStoreEnabled = false, onBack }: TeamMembersViewProps) {

  const {

    members,

    pendingInvites,

    sendInvite,

    cancelInvite,

    resendInvite,

    updateMember,

    removeMember,

    addRosterMember,

    resetMemberPinById,

    isLoading,

    isError,

    refetch,

    isSaving,

    isResettingPin,

  } = useTeamMembers(merchantId);

  const pairingFlagsQuery = useQuery({
    queryKey: ['store-tablet-pairing', merchantId],
    queryFn: getStoreTabletPairing,
  });

  const staffOpsEnabled =
    pairingFlagsQuery.data?.staffOperationsEnabled ??
    readFlag(merchantId, 'staffOperationsV1');
  const staffPinEnabled =
    pairingFlagsQuery.data?.staffStationPinEnabled ??
    readFlag(merchantId, 'staffStationPinV1');
  const pinSignInEnabled = staffOpsEnabled && staffPinEnabled;

  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);



  const handleRemoveMember = (member: TeamMember) => {

    if (!window.confirm(`Remove ${member.name} from your team?`)) return;

    removeMember(member.id);

  };



  if (isLoading) {

    return (

      <div className="app-fullscreen-screen safe-x safe-t z-[60] bg-background p-margin-mobile pt-20">

        <PartnerSkeleton variant="list" count={4} />

      </div>

    );

  }



  if (isError) {

    return (

      <div className="app-fullscreen-screen safe-x safe-t z-[60] bg-background p-margin-mobile pt-20">

        <QueryErrorState message="Could not load team" onRetry={() => refetch()} />

      </div>

    );

  }



  return (

    <div className="app-fullscreen-screen safe-x safe-t z-[60] bg-background text-on-background">

      <header className="flex h-16 w-full shrink-0 items-center gap-inset-sm border-b border-outline-variant bg-surface/80 px-margin-mobile backdrop-blur-md md:px-margin-tablet">

        <button

          type="button"

          onClick={onBack}

          className="flex h-12 w-12 items-center justify-center rounded-full text-primary transition-colors hover:bg-surface-container-low active:scale-95"

          aria-label="Back"

        >

          <MaterialIcon name="arrow_back" />

        </button>

        <h1 className="text-headline-md font-bold text-primary">Team Members</h1>

      </header>



      <main className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-inset-lg overflow-y-auto p-margin-mobile pb-[var(--app-bottom-nav-total)] md:p-margin-tablet">

        <StoreTabletSettingsSection merchantId={merchantId} />

        <div className="grid grid-cols-1 gap-inset-lg lg:grid-cols-12">

          <section className="lg:col-span-7">

            <AddTeamMemberPanel

              pinSignInEnabled={pinSignInEnabled}
              inStoreEnabled={inStoreEnabled}

              isSaving={isSaving}

              onAddRoster={({ name, role, jobStation }) =>

                addRosterMember(name, role, jobStation)

              }

              onSendInvite={({ email, name, role, permissions, jobStation }) =>
                sendInvite(email, role, permissions, name, jobStation)
              }

            />

          </section>



          <section className="space-y-inset-md lg:col-span-5">

            <h2 className="text-headline-md text-on-background">Pending invites</h2>

            <div className="space-y-inset-md rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-md shadow-sm">

              {pendingInvites.length === 0 ? (

                <p className="text-body-sm text-on-surface-variant">No pending invites</p>

              ) : (

                pendingInvites.map((invite) => (

                  <div

                    key={invite.id}

                    className="flex items-center justify-between border-b border-outline-variant pb-inset-md last:border-0 last:pb-0"

                  >

                    <div>

                      <p className="text-sm text-on-background">{invite.email}</p>

                      <div className="mt-1 flex flex-wrap items-center gap-inset-xs">

                        <RoleBadge role={invite.role} filled />

                        <JobStationBadge station={invite.jobStation} />

                        <span className="text-xs text-tertiary">Pending</span>

                      </div>

                    </div>

                    <div className="flex items-center gap-1">

                      <button

                        type="button"

                        onClick={() => resendInvite(invite.id)}

                        className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-variant"

                        title="Resend Invite"

                      >

                        <MaterialIcon name="send" />

                      </button>

                      <button

                        type="button"

                        onClick={() => cancelInvite(invite.id)}

                        className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-error-container/20 hover:text-error"

                        title="Cancel Invite"

                      >

                        <MaterialIcon name="close" />

                      </button>

                    </div>

                  </div>

                ))

              )}

            </div>

          </section>

        </div>



        <section className="space-y-inset-md">

          <h2 className="text-headline-md text-on-background">Current team</h2>

          <div className="grid grid-cols-1 gap-inset-md md:grid-cols-2 lg:grid-cols-3">

            {members.map((member) => (

              <div

                key={member.id}

                className="relative overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest p-inset-md shadow-sm transition-shadow hover:shadow-md"

              >

                <div className="mb-inset-sm flex items-start justify-between">

                  <div className="flex items-center gap-inset-sm">

                    <MemberAvatar name={member.name} isOwner={member.isOwner} />

                    <div>

                      <h3 className="text-headline-md text-on-background">{member.name}</h3>

                      <p className="text-body-sm text-on-surface-variant">

                        {formatAccessSummary(member.permissions, member.isOwner)}

                      </p>

                      <div className="mt-1 flex flex-wrap items-center gap-1">

                        <JobStationBadge station={member.jobStation} />

                        {member.loginType === 'roster' && pinSignInEnabled && (

                          <span className="rounded-full bg-surface-variant px-2 py-0.5 text-label-sm text-on-surface-variant">

                            {formatPinStatusLabel(member.pinStatus)}

                          </span>

                        )}

                      </div>

                    </div>

                  </div>

                  <div className="flex flex-col items-end gap-inset-xs">

                    <RoleBadge role={member.role} filled={member.isOwner} />

                    {!member.isOwner && (

                      <div className="flex gap-1">

                        <button

                          type="button"

                          onClick={() => setEditingMember(member)}

                          className="rounded-full p-1 text-on-surface-variant transition-colors hover:bg-surface-variant"

                          title="Edit member"

                        >

                          <MaterialIcon name="edit" size={20} />

                        </button>

                        <button

                          type="button"

                          onClick={() => handleRemoveMember(member)}

                          className="rounded-full p-1 text-on-surface-variant transition-colors hover:bg-error-container/20 hover:text-error"

                          title="Remove member"

                        >

                          <MaterialIcon name="person_remove" size={20} />

                        </button>

                      </div>

                    )}

                  </div>

                </div>

              </div>

            ))}

          </div>

        </section>

      </main>

      {editingMember && (

        <EditTeamMemberSheet

          member={editingMember}
          inStoreEnabled={inStoreEnabled}

          isSaving={isSaving}

          isResettingPin={isResettingPin}

          onResetPin={resetMemberPinById}

          onClose={() => setEditingMember(null)}

          onSave={(updates) => {

            updateMember(editingMember.id, updates);

            setEditingMember(null);

          }}

        />

      )}

    </div>

  );

}

