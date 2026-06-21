import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { deliveryFetch } from '../lib/partner-api';
import {
  ROLE_DEFAULT_PERMISSIONS,
  TeamData,
  TeamMember,
  TeamPermission,
  TeamRole,
} from '../types/team';

async function fetchTeam(): Promise<TeamData> {
  return deliveryFetch('/merchant/team') as Promise<TeamData>;
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
      role,
      permissions,
    }: {
      email: string;
      role: TeamRole;
      permissions: TeamPermission[];
    }) =>
      deliveryFetch('/merchant/team/invites', {
        method: 'POST',
        body: JSON.stringify({ email, role, permissions }),
      }),
    onSuccess: () => {
      invalidate();
      toast.success('Invite sent');
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

  const updateMemberMutation = useMutation({
    mutationFn: async ({
      memberId,
      updates,
    }: {
      memberId: string;
      updates: Partial<Pick<TeamMember, 'permissions' | 'role'>>;
    }) =>
      deliveryFetch(`/merchant/team/members/${memberId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }),
    onSuccess: () => {
      invalidate();
      toast.success('Team member updated');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const sendInvite = (email: string, role: TeamRole, permissions: TeamPermission[]) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      toast.error('Enter an email address');
      return false;
    }
    inviteMutation.mutate({ email: normalizedEmail, role, permissions });
    return true;
  };

  const cancelInvite = (inviteId: string) => {
    cancelInviteMutation.mutate(inviteId);
  };

  const updateMember = (
    memberId: string,
    updates: Partial<Pick<TeamMember, 'permissions' | 'role'>>,
  ) => {
    updateMemberMutation.mutate({ memberId, updates });
  };

  return {
    members: query.data?.members ?? [],
    pendingInvites: query.data?.pendingInvites ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    sendInvite,
    cancelInvite,
    updateMember,
    roleDefaultPermissions: ROLE_DEFAULT_PERMISSIONS,
  };
}
