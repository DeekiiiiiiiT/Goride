import React from 'react';
import { ProductLineSettingsPage } from '@roam/admin-core/settings';
import { useAuth } from '../auth/AuthContext';
import { API_ENDPOINTS } from '../../services/apiConfig';
import { IS_ENTERPRISE_PRODUCT, PRODUCT_LINE } from '../../config/productLine';

type PlatformSettingsProps = {
  activeTab?: string;
};

export function PlatformSettings({ activeTab }: PlatformSettingsProps = {}) {
  const { session, user } = useAuth();
  const accessToken = session?.access_token;
  const userRole = (user?.user_metadata?.role as string | undefined) ?? 'superadmin';

  return (
    <ProductLineSettingsPage
      segment={PRODUCT_LINE}
      apiBaseUrl={API_ENDPOINTS.admin}
      accessToken={accessToken}
      userEmail={user?.email}
      userRole={userRole}
      activeTab={activeTab}
      showBusinessTypes={IS_ENTERPRISE_PRODUCT}
      showDangerZone
      platformLabel={IS_ENTERPRISE_PRODUCT ? 'Roam Enterprise Admin' : 'Roam Fleet Admin'}
    />
  );
}
