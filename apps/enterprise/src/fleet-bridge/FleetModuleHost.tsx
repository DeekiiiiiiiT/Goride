import type { ReactNode } from 'react';
import { AuthProvider as FleetAuthAdapter } from '@/fleet-bridge/shims/AuthContext';
import { FeatureFlagProvider } from '@/fleet-bridge/shims/FeatureFlagContext';
import { BusinessConfigProvider } from '@fleet/components/auth/BusinessConfigContext';
import { AdminConfirmProvider } from '@roam/admin-core';

/**
 * Hosts Fleet feature screens inside Enterprise with compatible auth/flags.
 */
export function FleetModuleHost({ children }: { children: ReactNode }) {
  return (
    <FleetAuthAdapter>
      <FeatureFlagProvider>
        <BusinessConfigProvider>
          <AdminConfirmProvider>{children}</AdminConfirmProvider>
        </BusinessConfigProvider>
      </FeatureFlagProvider>
    </FleetAuthAdapter>
  );
}
