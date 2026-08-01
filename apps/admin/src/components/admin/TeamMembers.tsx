import {
  TeamMembers as CoreTeamMembers,
  type TeamMembersProps as CoreTeamMembersProps,
} from '@roam/admin-core';
import { useAuth } from '../auth/AuthContext';
import { API_ENDPOINTS } from '../../services/apiConfig';

export type TeamMembersProductLine = 'enterprise' | 'fleet';

export interface TeamMembersProps {
  productLine: TeamMembersProductLine;
}

function pickCallerRole(
  role: string | null,
  session: ReturnType<typeof useAuth>['session'],
): string | null {
  if (role) return role;
  const meta = session?.user?.user_metadata as { role?: string } | undefined;
  return meta?.role ?? null;
}

export function TeamMembers({ productLine }: TeamMembersProps) {
  const { session, role } = useAuth();

  const coreProps: CoreTeamMembersProps = {
    productLine,
    apiBaseUrl: API_ENDPOINTS.admin,
    accessToken: session?.access_token ?? '',
    callerRole: pickCallerRole(role, session),
    apiNamespace: '/admin',
  };

  return <CoreTeamMembers {...coreProps} />;
}
