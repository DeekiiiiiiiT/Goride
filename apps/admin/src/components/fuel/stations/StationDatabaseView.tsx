import React from 'react';
import { StationDatabaseView as FleetStationDatabaseView } from '@fleet/components/fuel/stations/StationDatabaseView';
import type { ResolutionQueueSubTab } from '@fleet/components/fuel/stations/ResolutionQueueTab';
import { SilentStationAttachPanel } from '../../admin/fuel/SilentStationAttachPanel';

export type { ResolutionQueueSubTab };

type FleetProps = React.ComponentProps<typeof FleetStationDatabaseView>;

/** Dominion Station Database — Resolution Queue includes Silent Attach. */
export function StationDatabaseView(props: FleetProps) {
  return (
    <FleetStationDatabaseView
      {...props}
      enableSilentAttach
      silentAttachPanel={<SilentStationAttachPanel embedded />}
    />
  );
}
