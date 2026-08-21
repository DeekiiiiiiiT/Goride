import { useState } from 'react';

import { toast } from 'sonner';

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
  formatJobStationLabel,
  TeamMember,
  TeamRole,
} from '../../types/team';



interface TeamMembersViewProps {
  merchantId: string;
  inStoreEnabled?: boolean;
  initialTab?: 'devices' | 'add' | 'team';
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



export default function TeamMembersView({
  merchantId,
  inStoreEnabled = false,
  initialTab = 'devices',
  partnerOnly = false,
  opsMode = false,
  onBack,
}: TeamMembersViewProps & { partnerOnly?: boolean; opsMode?: boolean }) {

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

  const pinSignInEnabled = !partnerOnly && opsMode;
  const venueOpsV2 = opsMode;

  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [activeTab, setActiveTab] = useState<'devices' | 'add' | 'team'>(initialTab);

  const displayMembers = opsMode
    ? members.filter((member) => member.loginType === 'roster')
    : members.filter((member) => member.loginType !== 'roster' || member.isOwner);
  const displayInvites = opsMode ? [] : pendingInvites;

  const teamTabs = partnerOnly
    ? [
        { key: 'add' as const, label: 'Invite member', icon: 'person_add' },
        { key: 'team' as const, label: 'Current team', icon: 'groups' },
      ]
    : opsMode
      ? [
          { key: 'devices' as const, label: 'Devices', icon: 'tablet' },
          { key: 'add' as const, label: 'Add floor staff', icon: 'person_add' },
          { key: 'team' as const, label: 'Roster', icon: 'groups' },
        ]
      : [
          { key: 'devices' as const, label: 'Devices', icon: 'tablet' },
          { key: 'add' as const, label: 'Add team member', icon: 'person_add' },
          { key: 'team' as const, label: 'Current team', icon: 'groups' },
        ];



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

    <div className="app-fullscreen-screen safe-x safe-t z-[60] flex min-h-dvh flex-col bg-background text-on-background">

      <header className="shrink-0 border-b border-outline-variant bg-surface/80 backdrop-blur-md">

        <div className="flex h-16 w-full items-center gap-inset-sm px-margin-mobile md:px-margin-tablet">

          <button

            type="button"

            onClick={onBack}

            className="flex h-12 w-12 items-center justify-center rounded-full text-primary transition-colors hover:bg-surface-container-low active:scale-95"

            aria-label="Back"

          >

            <MaterialIcon name="arrow_back" />

          </button>

          <h1 className="text-headline-md font-bold text-primary">Team Members</h1>

        </div>

        <nav className="flex gap-1 overflow-x-auto px-margin-mobile pb-inset-xs md:px-margin-tablet">

          {teamTabs.map((tab) => {

            const active = activeTab === tab.key;

            return (

              <button

                key={tab.key}

                type="button"

                onClick={() => setActiveTab(tab.key)}

                className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-label-md font-semibold transition-colors ${

                  active

                    ? 'bg-primary-container text-on-primary-container'

                    : 'text-on-surface-variant hover:bg-surface-container-high'

                }`}

              >

                <MaterialIcon name={tab.icon} className="text-[18px]" />

                {tab.label}

              </button>

            );

          })}

        </nav>

      </header>



      <main className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-inset-lg overflow-y-auto p-margin-mobile pb-[var(--app-bottom-nav-total)] md:p-margin-tablet">

        {activeTab === 'devices' && opsMode && (
          <p className="text-body-sm text-on-surface-variant">
            Manage tablets and pairing in Roam Command → Team → Devices.
          </p>
        )}

        {activeTab === 'add' && (

          <AddTeamMemberPanel
            partnerOnly={partnerOnly}

            pinSignInEnabled={pinSignInEnabled}

            inStoreEnabled={inStoreEnabled}

            venueOpsV2={venueOpsV2}

            isSaving={isSaving}

            onAddRoster={({ name, role, jobStation, displayTitle }) =>

              addRosterMember(name, role, jobStation, displayTitle)

            }

            onSendInvite={({ email, name, role, permissions, jobStation }) =>

              sendInvite(email, role, permissions, name, jobStation)

            }

          />

        )}

        {activeTab === 'team' && (

          <>

            <section className="space-y-inset-md">

              <h2 className="text-headline-md text-on-background">Pending invites</h2>

            <div className="space-y-inset-md rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-md shadow-sm">

              {displayInvites.length === 0 ? (

                <p className="text-body-sm text-on-surface-variant">No pending invites</p>

              ) : (

                displayInvites.map((invite) => (

                  <div

                    key={invite.id}

                    className="flex items-center justify-between border-b border-outline-variant pb-inset-md last:border-0 last:pb-0"

                  >

                    <div>

                      <p className="text-sm text-on-background">{invite.email}</p>

                      <div className="mt-1 flex flex-wrap items-center gap-inset-xs">

                        <RoleBadge role={invite.role} filled />

                        {invite.jobStation ? (
                          <span className="text-label-sm text-on-surface-variant">
                            {formatJobStationLabel(invite.jobStation)}
                          </span>
                        ) : null}

                        <span className="text-xs text-tertiary">Pending</span>

                      </div>

                    </div>

                    <div className="flex items-center gap-1">

                      {invite.inviteUrl ? (
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard.writeText(invite.inviteUrl!).then(
                              () => toast.success('Invite link copied'),
                              () => toast.error('Could not copy invite link'),
                            );
                          }}
                          className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-variant"
                          title="Copy invite link"
                        >
                          <MaterialIcon name="content_copy" />
                        </button>
                      ) : null}

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

            <section className="space-y-inset-md">

              <h2 className="text-headline-md text-on-background">Current team</h2>

          <div className="grid grid-cols-1 gap-inset-md md:grid-cols-2 lg:grid-cols-3">

            {displayMembers.map((member) => (

              <div

                key={member.id}

                className="relative overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest p-inset-md shadow-sm transition-shadow hover:shadow-md"

              >

                <div className="mb-inset-sm flex items-start justify-between">

                  <div className="flex items-center gap-inset-sm">

                    <MemberAvatar name={member.name} isOwner={member.isOwner} />

                    <div>

                      <h3 className="text-headline-md text-on-background">{member.name}</h3>

                      {member.displayTitle && (
                        <p className="text-label-sm text-on-surface-variant">{member.displayTitle}</p>
                      )}

                      <p className="text-body-sm text-on-surface-variant">

                        {formatAccessSummary(member.permissions, member.isOwner)}

                      </p>

                      <div className="mt-1 flex flex-wrap items-center gap-1">

                        {member.jobStation ? (
                          <span className="text-label-sm text-on-surface-variant">
                            {formatJobStationLabel(member.jobStation)}
                          </span>
                        ) : null}

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

          </>

        )}

      </main>

      {editingMember && (

        <EditTeamMemberSheet

          member={editingMember}
          inStoreEnabled={inStoreEnabled}
          pinSignInEnabled={pinSignInEnabled}
          venueOpsV2={venueOpsV2}

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

