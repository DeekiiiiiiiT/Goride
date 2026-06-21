import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { DEFAULT_TEAM_DATA } from '../lib/team-mock-data';
import {
  ROLE_DEFAULT_PERMISSIONS,
  TeamData,
  TeamMember,
  TeamPermission,
  TeamRole,
} from '../types/team';

function teamDataKey(merchantId: string) {
  return `roam_team_data_${merchantId}`;
}

function loadTeamData(merchantId: string): TeamData {
  try {
    const raw = localStorage.getItem(teamDataKey(merchantId));
    if (!raw) return DEFAULT_TEAM_DATA;
    return JSON.parse(raw) as TeamData;
  } catch {
    return DEFAULT_TEAM_DATA;
  }
}

function saveTeamData(merchantId: string, data: TeamData) {
  localStorage.setItem(teamDataKey(merchantId), JSON.stringify(data));
}

export function useTeamMembers(merchantId: string) {
  const [teamData, setTeamData] = useState<TeamData>(() => loadTeamData(merchantId));

  useEffect(() => {
    setTeamData(loadTeamData(merchantId));
  }, [merchantId]);

  const persist = (data: TeamData) => {
    setTeamData(data);
    saveTeamData(merchantId, data);
  };

  const sendInvite = (email: string, role: TeamRole, permissions: TeamPermission[]) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      toast.error('Enter an email address');
      return false;
    }

    const alreadyMember = teamData.members.some(
      (member) => member.email?.toLowerCase() === normalizedEmail
    );
    const alreadyPending = teamData.pendingInvites.some(
      (invite) => invite.email.toLowerCase() === normalizedEmail
    );

    if (alreadyMember || alreadyPending) {
      toast.error('This email already has access or a pending invite');
      return false;
    }

    persist({
      ...teamData,
      pendingInvites: [
        ...teamData.pendingInvites,
        {
          id: crypto.randomUUID(),
          email: normalizedEmail,
          role,
          permissions,
        },
      ],
    });
    toast.success(`Invite sent to ${normalizedEmail}`);
    return true;
  };

  const cancelInvite = (inviteId: string) => {
    persist({
      ...teamData,
      pendingInvites: teamData.pendingInvites.filter((invite) => invite.id !== inviteId),
    });
    toast.success('Invite cancelled');
  };

  const updateMember = (memberId: string, updates: Partial<Pick<TeamMember, 'permissions' | 'role'>>) => {
    persist({
      ...teamData,
      members: teamData.members.map((member) =>
        member.id === memberId && !member.isOwner ? { ...member, ...updates } : member
      ),
    });
    toast.success('Team member updated');
  };

  return {
    members: teamData.members,
    pendingInvites: teamData.pendingInvites,
    sendInvite,
    cancelInvite,
    updateMember,
    roleDefaultPermissions: ROLE_DEFAULT_PERMISSIONS,
  };
}
