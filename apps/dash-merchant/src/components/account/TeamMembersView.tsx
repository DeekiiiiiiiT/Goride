import { useState } from 'react';
import QueryErrorState from '../QueryErrorState';
import PartnerSkeleton from '../PartnerSkeleton';
import { toast } from 'sonner';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { useTeamMembers } from '../../hooks/useTeamMembers';
import {
  formatAccessSummary,
  formatRoleLabel,
  TEAM_PERMISSIONS,
  TEAM_ROLE_OPTIONS,
  TeamPermission,
  TeamRole,
} from '../../types/team';

interface TeamMembersViewProps {
  merchantId: string;
  onBack: () => void;
}

const inputClass =
  'h-12 w-full rounded-lg border border-outline-variant bg-transparent px-4 text-body-lg text-on-background outline-none transition-colors placeholder:text-on-surface-variant/50 focus:border-primary-container focus:ring-1 focus:ring-primary-container';

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

export default function TeamMembersView({ merchantId, onBack }: TeamMembersViewProps) {
  const {
    members,
    pendingInvites,
    sendInvite,
    cancelInvite,
    updateMember,
    roleDefaultPermissions,
    isLoading,
    isError,
    refetch,
  } = useTeamMembers(merchantId);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<TeamRole>('staff');
  const [invitePermissions, setInvitePermissions] = useState<TeamPermission[]>(
    roleDefaultPermissions.staff
  );

  const handleRoleChange = (role: TeamRole) => {
    setInviteRole(role);
    setInvitePermissions(roleDefaultPermissions[role]);
  };

  const togglePermission = (permission: TeamPermission) => {
    setInvitePermissions((current) =>
      current.includes(permission)
        ? current.filter((entry) => entry !== permission)
        : [...current, permission]
    );
  };

  const handleSendInvite = () => {
    const sent = sendInvite(inviteEmail, inviteRole, invitePermissions);
    if (!sent) return;
    setInviteEmail('');
    setInviteRole('staff');
    setInvitePermissions(roleDefaultPermissions.staff);
  };

  const handleEditMember = (memberId: string, name: string, currentRole: TeamRole) => {
    const nextRole = window.prompt(
      `Change role for ${name} (admin, manager, staff)`,
      currentRole,
    ) as TeamRole | null;
    if (!nextRole || !['admin', 'manager', 'staff'].includes(nextRole)) return;
    updateMember(memberId, { role: nextRole, permissions: roleDefaultPermissions[nextRole] });
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-[60] flex min-h-dvh flex-col bg-background p-margin-mobile pt-20">
        <PartnerSkeleton variant="list" count={4} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="fixed inset-0 z-[60] flex min-h-dvh flex-col bg-background p-margin-mobile pt-20">
        <QueryErrorState message="Could not load team" onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex min-h-dvh flex-col bg-background pb-[100px] text-on-background md:pb-0">
      <header className="sticky top-0 z-50 flex h-16 w-full items-center gap-inset-sm border-b border-outline-variant bg-surface/80 px-margin-mobile backdrop-blur-md">
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

      <main className="mx-auto w-full max-w-5xl space-y-inset-lg p-margin-mobile md:p-margin-tablet">
        <section className="space-y-inset-md">
          <h2 className="text-headline-md text-on-background">Current Team</h2>
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
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-inset-xs">
                    <RoleBadge role={member.role} filled={member.isOwner} />
                    {!member.isOwner && (
                      <button
                        type="button"
                        onClick={() => handleEditMember(member.id, member.name, member.role)}
                        className="rounded-full p-1 text-on-surface-variant transition-colors hover:bg-surface-variant hover:text-error"
                        title="Edit member"
                      >
                        <MaterialIcon name="edit" size={20} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-1 gap-inset-lg lg:grid-cols-12">
          <section className="space-y-inset-md lg:col-span-8">
            <h2 className="text-headline-md text-on-background">Invite Team Member</h2>
            <div className="space-y-inset-md rounded-lg border border-outline-variant bg-surface-container-lowest p-inset-md shadow-sm">
              <div className="space-y-inset-xs">
                <label className="block text-label-md text-on-surface-variant" htmlFor="invite-email">
                  Email Address
                </label>
                <input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="colleague@restaurant.com"
                  className={inputClass}
                />
              </div>

              <div className="space-y-inset-xs">
                <label className="block text-label-md text-on-surface-variant" htmlFor="invite-role">
                  Role
                </label>
                <div className="relative">
                  <select
                    id="invite-role"
                    value={inviteRole}
                    onChange={(event) => handleRoleChange(event.target.value as TeamRole)}
                    className={`${inputClass} appearance-none pr-10`}
                  >
                    {TEAM_ROLE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-on-surface-variant">
                    <MaterialIcon name="expand_more" />
                  </div>
                </div>
              </div>

              <div className="space-y-inset-sm pt-inset-sm">
                <h4 className="text-label-md text-on-surface-variant">Permissions</h4>
                <div className="grid grid-cols-1 gap-inset-sm sm:grid-cols-2">
                  {TEAM_PERMISSIONS.map((permission) => (
                    <label
                      key={permission.id}
                      className="flex min-h-[48px] cursor-pointer items-center gap-inset-sm rounded-lg border border-outline-variant p-3 transition-colors hover:bg-surface-variant"
                    >
                      <input
                        type="checkbox"
                        checked={invitePermissions.includes(permission.id)}
                        onChange={() => togglePermission(permission.id)}
                        className="h-5 w-5 rounded border-outline-variant text-primary-container focus:ring-2 focus:ring-primary-container focus:ring-offset-2"
                      />
                      <span className="text-body-sm text-on-background">{permission.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-inset-md">
                <button
                  type="button"
                  onClick={handleSendInvite}
                  className="min-h-[48px] w-full rounded-lg bg-primary-container px-inset-lg py-3 text-headline-md font-bold text-on-primary shadow-sm transition-all hover:bg-primary/90 active:scale-95 sm:w-auto"
                >
                  Send Invite
                </button>
              </div>
            </div>
          </section>

          <section className="space-y-inset-md lg:col-span-4">
            <h2 className="text-headline-md text-on-background">Pending Invites</h2>
            <div className="space-y-inset-md rounded-lg border border-outline-variant bg-surface-container-lowest p-inset-md shadow-sm">
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
                      <div className="mt-1 flex items-center gap-inset-xs">
                        <RoleBadge role={invite.role} filled />
                        <span className="text-xs text-tertiary">Pending</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => cancelInvite(invite.id)}
                      className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-error-container/20 hover:text-error"
                      title="Cancel Invite"
                    >
                      <MaterialIcon name="close" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
