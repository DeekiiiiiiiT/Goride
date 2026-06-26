import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createRosterMember, deliveryFetch, resetMemberPin } from '../lib/partner-api';
import {
  ROLE_DEFAULT_PERMISSIONS,
  TeamData,
  TeamMember,
  TeamPermission,
  TeamRole,
  JobStation,
} from '../types/team';

async function fetchTeam(): Promise<TeamData> {
  return deliveryFetch('/merchant/team') as Promise<TeamData>;
}

interface InviteResponse {
  invite: {
    id: string;
    email: string;
    role: string;
    permissions: string[];
    emailSent?: boolean;
  };
}

export function useTeamMembers(_merchantId: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['merchant-team'],
    queryFn: fetchTeam,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['merchant-team'] });

  const inviteMutation = useMutation({
    mutationFn: async ({
      email,
      name,
      role,
      permissions,
      jobStation,
    }: {
      email: string;
      name?: string;
      role: TeamRole;
      permissions: TeamPermission[];
      jobStation?: JobStation | null;
    }) =>
      deliveryFetch('/merchant/team/invites', {
        method: 'POST',
        body: JSON.stringify({
          email,
          name,
          role,
          permissions,
          jobStation: jobStation == null ? 'none' : jobStation,
        }),
      }) as Promise<InviteResponse>,
    onSuccess: (data) => {
      invalidate();
      if (data.invite.emailSent === false) {
        toast.warning('Invite saved but email could not be sent');
      } else {
        toast.success('Invite sent');
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const cancelInviteMutation = useMutation({
    mutationFn: async (inviteId: string) =>
      deliveryFetch(`/merchant/team/invites/${inviteId}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidate();
      toast.success('Invite cancelled');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const resendInviteMutation = useMutation({
    mutationFn: async (inviteId: string) =>
      deliveryFetch(`/merchant/team/invites/${inviteId}/resend`, {
        method: 'POST',
        body: '{}',
      }) as Promise<InviteResponse>,
    onSuccess: (data) => {
      invalidate();
      if (data.invite.emailSent === false) {
        toast.warning('Invite updated but email could not be sent');
      } else {
        toast.success('Invite resent');
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateMemberMutation = useMutation({
    mutationFn: async ({
      memberId,
      updates,
    }: {
      memberId: string;
      updates: Partial<Pick<TeamMember, 'permissions' | 'role' | 'name' | 'jobStation'>>;
    }) =>
      deliveryFetch(`/merchant/team/members/${memberId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...updates,
          jobStation:
            updates.jobStation === undefined
              ? undefined
              : updates.jobStation == null
                ? 'none'
                : updates.jobStation,
        }),
      }),
    onSuccess: () => {
      invalidate();
      toast.success('Team member updated');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (memberId: string) =>
      deliveryFetch(`/merchant/team/members/${memberId}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidate();
      toast.success('Team member removed');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createRosterMutation = useMutation({
    mutationFn: async (payload: {
      name: string;
      role: 'staff' | 'manager';
      jobStation: JobStation | null;
    }) => createRosterMember(payload),
    onSuccess: () => {
      invalidate();
      toast.success('Team member added');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const resetPinMutation = useMutation({
    mutationFn: async (memberId: string) => resetMemberPin(memberId),
    onSuccess: () => {
      invalidate();
      toast.success('PIN reset — staff must create a new PIN on the tablet');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const sendInvite = (
    email: string,
    role: TeamRole,
    permissions: TeamPermission[],
    name?: string,
    jobStation?: JobStation | null,
  ) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      toast.error('Enter an email address');
      return false;
    }
    inviteMutation.mutate({
      email: normalizedEmail,
      name: name?.trim() || undefined,
      role,
      permissions,
      jobStation: jobStation ?? null,
    });
    return true;
  };

  const cancelInvite = (inviteId: string) => {
    cancelInviteMutation.mutate(inviteId);
  };

  const resendInvite = (inviteId: string) => {
    resendInviteMutation.mutate(inviteId);
  };

  const updateMember = (
    memberId: string,
    updates: Partial<Pick<TeamMember, 'permissions' | 'role' | 'name' | 'jobStation'>>,
  ) => {
    updateMemberMutation.mutate({ memberId, updates });
  };

  const removeMember = (memberId: string) => {
    removeMemberMutation.mutate(memberId);
  };

  const addRosterMember = (
    name: string,
    role: 'staff' | 'manager',
    jobStation: JobStation | null,
  ) => {
    createRosterMutation.mutate({ name, role, jobStation });
  };

  const resetMemberPinById = (memberId: string) => {
    resetPinMutation.mutate(memberId);
  };

  return {
    members: query.data?.members ?? [],
    pendingInvites: query.data?.pendingInvites ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    sendInvite,
    cancelInvite,
    resendInvite,
    updateMember,
    removeMember,
    addRosterMember,
    resetMemberPinById,
    roleDefaultPermissions: ROLE_DEFAULT_PERMISSIONS,
    isSaving:
      inviteMutation.isPending ||
      updateMemberMutation.isPending ||
      removeMemberMutation.isPending ||
      createRosterMutation.isPending ||
      resetPinMutation.isPending,
    isResettingPin: resetPinMutation.isPending,
  };
}
