import {
  CustomerAccounts as CoreCustomerAccounts,
  type CustomerAccountsProps as CoreCustomerAccountsProps,
} from '@roam/admin-core';
import { useAuth } from '../auth/AuthContext';
import { API_ENDPOINTS } from '../../services/apiConfig';
import { OrganizationDetail } from './OrganizationDetail';

export type CustomerAccountsProductLine = 'enterprise' | 'fleet';

export interface CustomerAccountsProps {
  productLine?: CustomerAccountsProductLine;
  pageTitle?: string;
  subtitle?: string;
}

function pickCallerRole(
  role: string | null,
  session: ReturnType<typeof useAuth>['session'],
): string | null {
  if (role) return role;
  const meta = session?.user?.user_metadata as { role?: string } | undefined;
  return meta?.role ?? null;
}

export function CustomerAccounts({
  productLine = 'enterprise',
  pageTitle,
  subtitle,
}: CustomerAccountsProps) {
  const { session, role } = useAuth();
  const accessToken = session?.access_token ?? '';

  const coreProps: CoreCustomerAccountsProps = {
    productLine,
    apiBaseUrl: API_ENDPOINTS.admin,
    accessToken,
    callerRole: pickCallerRole(role, session),
    apiNamespace: '/admin',
    pageTitle,
    subtitle,
    renderOrganizationDetail: ({ orgId, onBack }) => (
      <OrganizationDetail orgId={orgId} onBack={onBack} />
    ),
  };

  return <CoreCustomerAccounts {...coreProps} />;
}
