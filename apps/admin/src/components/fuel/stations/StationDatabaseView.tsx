import React from 'react';
import {
  StationDatabaseView as PlatformStationDatabaseView,
  type ResolutionQueueSubTab,
} from '@roam/platform-ops-ui';
import { SilentStationAttachPanel } from '../../admin/fuel/SilentStationAttachPanel';

export type { ResolutionQueueSubTab };

type PlatformProps = React.ComponentProps<typeof PlatformStationDatabaseView>;

/** Dominion Station Database — Resolution Queue includes Silent Attach. */
export function StationDatabaseView(props: PlatformProps) {
  return (
    <PlatformStationDatabaseView
      {...props}
      enableSilentAttach
      silentAttachPanel={<SilentStationAttachPanel embedded />}
    />
  );
}
