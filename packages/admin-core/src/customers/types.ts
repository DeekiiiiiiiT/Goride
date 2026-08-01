import type React from 'react';

export type ProductLineAccountsProps = {
  productLine: 'enterprise' | 'fleet';
  apiBaseUrl: string;
  accessToken: string;
  callerRole: string | null;
  /** Base path prefix: '/admin' | '/enterprise-admin' | '/fleet-admin' */
  apiNamespace: '/admin' | '/enterprise-admin' | '/fleet-admin';
  pageTitle?: string;
  subtitle?: string;
  /** Optional org drill-in. If omitted, row click does nothing / no OrganizationDetail. */
  renderOrganizationDetail?: (args: {
    orgId: string;
    accessToken: string;
    onBack: () => void;
  }) => React.ReactNode;
};

export type CustomerAccountsProps = ProductLineAccountsProps;

export type TeamMembersProps = Omit<
  ProductLineAccountsProps,
  'renderOrganizationDetail' | 'pageTitle' | 'subtitle'
> & {
  pageTitle?: string;
  subtitle?: string;
};
