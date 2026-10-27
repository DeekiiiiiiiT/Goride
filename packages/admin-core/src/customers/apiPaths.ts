export type ApiNamespace = '/enterprise-admin' | '/fleet-admin';

export type CustomerApiPaths = {
  listCustomers: string;
  createCustomer: string;
  updateUser: string | null;
  resetPassword: string;
  forceLogout: string;
  toggleSuspend: string;
  setPassword: string;
  fullDelete: (userId: string) => string | null;
  listTeamMembers: string;
  teamMemberRole: (id: string) => string | null;
  teamMemberDelete: (id: string) => string | null;
};

export function buildCustomerApiPaths(
  apiBaseUrl: string,
  apiNamespace: ApiNamespace,
): CustomerApiPaths {
  const prefix = apiNamespace;
  return {
    listCustomers: `${apiBaseUrl}${prefix}/customers`,
    createCustomer: `${apiBaseUrl}${prefix}/customers`,
    updateUser: null,
    resetPassword: `${apiBaseUrl}${prefix}/reset-password`,
    forceLogout: `${apiBaseUrl}${prefix}/force-logout`,
    toggleSuspend: `${apiBaseUrl}${prefix}/toggle-suspend`,
    setPassword: `${apiBaseUrl}${prefix}/set-password`,
    fullDelete: () => null,
    listTeamMembers: `${apiBaseUrl}${prefix}/team-members`,
    teamMemberRole: () => null,
    teamMemberDelete: () => null,
  };
}

export function productLineHeaders(
  accessToken: string,
  productLine: 'enterprise' | 'fleet',
  json = false,
): Record<string, string> {
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${accessToken}`,
    'X-Roam-Product-Line': productLine,
  };
}
