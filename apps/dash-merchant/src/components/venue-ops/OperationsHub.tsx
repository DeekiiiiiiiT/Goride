import { useState } from 'react';
import type { JobStation } from '../../types/team';
import type { Merchant } from '../../hooks/useMerchant';
import { useVenueOps } from '../../hooks/useVenueOps';
import { useTeamMembers } from '../../hooks/useTeamMembers';
import { canAccessRestaurantMgmt } from '../../lib/merchant-capabilities';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import type { RestaurantMgmtSection } from '../restaurant-mgmt/RestaurantMgmtHub';
import BusinessTypeSummary from './BusinessTypeSummary';
import StationToggles from './StationToggles';
import OperationsHubAdminLinks from './OperationsHubAdminLinks';
import OperationsHubTabletPairing from './OperationsHubTabletPairing';
import OperationsHubTeamSummary from './OperationsHubTeamSummary';

interface OperationsHubProps {
  merchantId: string;
  merchant?: Merchant | null;
  onBack?: () => void;
  onOpenRestaurantMgmt?: (section: RestaurantMgmtSection) => void;
  onOpenEnterpriseInventory?: () => void;
  onOpenTeam?: (tab?: 'devices' | 'add' | 'team') => void;
}

export default function OperationsHub({
  merchantId,
  merchant,
  onBack,
  onOpenRestaurantMgmt,
  onOpenEnterpriseInventory,
  onOpenTeam,
}: OperationsHubProps) {
  const { venueOps, updateVenueOps, isSaving, useApi } = useVenueOps(merchantId, merchant);
  const { members } = useTeamMembers(merchantId);
  const [localStations, setLocalStations] = useState<JobStation[] | null>(null);
  const enabledStations = localStations ?? venueOps.enabledStations;
  const showAdminModules =
    Boolean(onOpenRestaurantMgmt) && canAccessRestaurantMgmt(merchantId, merchant);

  const rosterCount = members.filter(
    (member) => member.loginType === 'roster' || member.role === 'staff' || member.role === 'manager',
  ).length;

  const handleStationsChange = (stations: JobStation[]) => {
    setLocalStations(stations);
    updateVenueOps({ enabledStations: stations, venueStyle: 'custom' });
  };

  return (
    <div className="flex min-h-dvh flex-col bg-background text-on-background">
      {onBack && (
        <header className="safe-t shrink-0 border-b border-outline-variant bg-surface">
          <div className="flex h-14 items-center gap-inset-sm px-margin-mobile md:px-margin-tablet">
            <button
              type="button"
              onClick={onBack}
              className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-surface-container-high"
              aria-label="Back to account"
            >
              <MaterialIcon name="arrow_back" />
            </button>
            <div>
              <h1 className="text-headline-md font-bold text-on-surface">Operations Hub</h1>
              <p className="text-label-sm text-on-surface-variant">
                Set up in-store operations and staff tablets
              </p>
            </div>
          </div>
        </header>
      )}
      <main className={`flex-1 overflow-auto ${onBack ? 'pb-[var(--app-bottom-nav-total)]' : ''}`}>
        <div className="mx-auto grid w-full max-w-5xl gap-inset-lg p-margin-mobile md:p-margin-tablet lg:grid-cols-2">
          <div className="flex flex-col gap-inset-lg">
            {!useApi && (
              <p className="rounded-lg border border-outline-variant bg-surface-container-low px-inset-md py-inset-sm text-body-sm text-on-surface-variant">
                Preview mode — turn on the venue operations flag in dev settings to save to your store.
              </p>
            )}
            <BusinessTypeSummary businessTypeId={merchant?.business_type} />
            <StationToggles
              enabledStations={enabledStations}
              onChange={handleStationsChange}
              disabled={isSaving}
            />
            {showAdminModules && (
              <OperationsHubAdminLinks
                merchantId={merchantId}
                onOpenSection={(section) => onOpenRestaurantMgmt?.(section)}
                onOpenEnterpriseInventory={onOpenEnterpriseInventory}
              />
            )}
          </div>

          <div className="flex flex-col gap-inset-lg">
            <OperationsHubTabletPairing
              merchantId={merchantId}
              enabledStations={enabledStations}
              onOpenDevices={() => onOpenTeam?.('devices')}
            />
            <OperationsHubTeamSummary
              activeCount={rosterCount}
              onViewRoster={() => onOpenTeam?.('team')}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
