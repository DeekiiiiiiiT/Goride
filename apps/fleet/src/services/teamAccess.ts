import { API_ENDPOINTS } from './apiConfig';
import { publicAnonKey } from '../utils/supabase/info';

export type TeamAccess = {
  portal: boolean;
  role: string;
  staffRole: string | null;
  organizationId: string | null;
  productLine: 'fleet' | 'enterprise' | null;
  pendingInvite: { id: string; role: string; organizationName: string } | null;
  pendingTransfer: { id: string; organizationName: string; fromName: string } | null;
  outgoingTransfer: { id: string } | null;
};

export async function fetchTeamAccess(token: string): Promise<TeamAccess | null> {
  try {
    const res = await fetch(`${API_ENDPOINTS.admin}/team/access`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: publicAnonKey,
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as TeamAccess;
  } catch {
    return null;
  }
}
