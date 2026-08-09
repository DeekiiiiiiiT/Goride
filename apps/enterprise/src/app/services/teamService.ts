import { API_ENDPOINTS, getProductLineHeaders, publicAnonKey } from '@roam/api-client';
import {
  type EnterpriseAccessSection,
  type EnterpriseSectionOverrides,
} from '@roam/auth-client';
import { supabaseEnterpriseApp } from '@roam/auth-client';

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  lastActive: string;
  invitedBy: string | null;
  invitedAt: string | null;
  isOwner: boolean;
  sectionOverrides?: EnterpriseSectionOverrides;
  effectiveSections?: Record<EnterpriseAccessSection, boolean>;
  accessCustomized?: boolean;
};

async function teamHeaders(organizationId?: string | null): Promise<HeadersInit> {
  const { data } = await supabaseEnterpriseApp.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not authenticated');
  return {
    Authorization: `Bearer ${token}`,
    apikey: publicAnonKey,
    'Content-Type': 'application/json',
    ...getProductLineHeaders(),
    ...(organizationId ? { 'X-Roam-Organization-Id': organizationId } : {}),
  };
}

async function teamFetch<T>(
  path: string,
  init?: RequestInit & { organizationId?: string | null },
): Promise<T> {
  const { organizationId, ...rest } = init ?? {};
  const headers = await teamHeaders(organizationId);
  const res = await fetch(`${API_ENDPOINTS.admin}${path}`, {
    ...rest,
    headers: { ...headers, ...(rest.headers || {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail =
      (typeof json.message === 'string' && json.message) ||
      (typeof json.error === 'string' && json.error) ||
      res.statusText ||
      'Request failed';
    throw new Error(detail);
  }
  return json as T;
}

export const teamService = {
  listMembers: (organizationId?: string | null) =>
    teamFetch<TeamMember[]>('/team/members', { organizationId }),

  invite: (
    body: {
      name: string;
      email: string;
      role: string;
      sectionOverrides?: EnterpriseSectionOverrides;
    },
    organizationId?: string | null,
  ) =>
    teamFetch<{
      success: boolean;
      userId: string;
      temporaryPassword: string;
      message: string;
    }>('/team/invite', {
      method: 'POST',
      body: JSON.stringify(body),
      organizationId,
    }),

  updateAccess: (
    userId: string,
    body: { role: string; sectionOverrides: EnterpriseSectionOverrides },
    organizationId?: string | null,
  ) =>
    teamFetch<{ success: boolean; message: string }>(`/team/members/${userId}/role`, {
      method: 'PUT',
      body: JSON.stringify(body),
      organizationId,
    }),

  remove: (userId: string, organizationId?: string | null) =>
    teamFetch<{ success: boolean; message: string }>(`/team/members/${userId}`, {
      method: 'DELETE',
      organizationId,
    }),
};
