import { useState } from 'react';
import type { JobStation } from '../../types/team';
import type { Merchant } from '../../hooks/useMerchant';
import { useVenueOps } from '../../hooks/useVenueOps';
import { useTeamMembers } from '../../hooks/useTeamMembers';
import { canAccessRestaurantMgmt } from '../../lib/merchant-capabilities';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import BusinessTypeSummary from './BusinessTypeSummary';
import StationToggles from './StationToggles';
import OperationsHubAdminLinks from './OperationsHubAdminLinks';
import OperationsHubTabletPairing from './OperationsHubTabletPairing';
import OperationsHubTeamSummary from './OperationsHubTeamSummary';

interface OperationsHubProps {
  merchantId: string;
  merchant?: Merchant | null;
  onBack?: () => void;
  onSignOut?: () => void;
  onOpenRestaurantMgmt?: (module?: import('../restaurant-mgmt/RestaurantMgmtHub').RestaurantMgmtModule) => void;
  onOpenTeam?: (tab?: 'devices' | 'add' | 'team') => void;
}

export default function OperationsHub({
  merchantId,
  merchant,
  onBack,
  onSignOut,
  onOpenRestaurantMgmt,
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
    void Promise.resolve(updateVenueOps({ enabledStations: stations, venueStyle: 'custom' })).catch(
      () => setLocalStations(null),
    );
  };

  return (
    <div className="flex min-h-dvh flex-col bg-background text-on-background">
      {(onBack || onSignOut) && (
        <header className="safe-t shrink-0 border-b border-outline-variant bg-surface">
          <div className="flex h-14 items-center justify-between gap-inset-sm px-margin-mobile md:px-margin-tablet">
            <div className="flex min-w-0 items-center gap-inset-sm">
              {onBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-surface-container-high"
                  aria-label="Back"
                >
                  <MaterialIcon name="arrow_back" />
                </button>
              ) : null}
              <div className="min-w-0">
                <h1 className="text-headline-md font-bold text-on-surface">Operations Hub</h1>
                <p className="truncate text-label-sm text-on-surface-variant">
                  In-store operations and staff tablets
                </p>
              </div>
            </div>
            {onSignOut ? (
              <button
                type="button"
                onClick={onSignOut}
                className="shrink-0 text-label-md font-semibold text-primary"
              >
                Sign out
              </button>
            ) : null}
          </div>
        </header>
      )}
      <main className={`flex-1 overflow-auto ${onBack ? 'pb-[var(--app-bottom-nav-total)]' : ''}`}>
        <div className="mx-auto grid w-full max-w-5xl gap-inset-lg p-margin-mobile md:p-margin-tablet lg:grid-cols-2">
          <div className="flex flex-col gap-inset-lg">
            {!useApi && (
              <p className="rounded-lg border border-outline-variant bg-surface-container-low px-inset-md py-inset-sm text-body-sm text-on-surface-variant">
                Preview only — in-store operations is not enabled for this store, so station changes
                will not save.
              </p>
            )}
            <BusinessTypeSummary businessTypeId={merchant?.business_type} />
            <StationToggles
              enabledStations={enabledStations}
              onChange={handleStationsChange}
              disabled={isSaving}
            />
            {showAdminModules && (
              <OperationsHubAdminLinks onOpenRestaurantMgmt={() => onOpenRestaurantMgmt?.()} />
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
