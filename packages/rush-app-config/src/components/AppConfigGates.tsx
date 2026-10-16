import React from 'react';
import type { RushAppId } from '../types';
import { AnnouncementBanner } from './AnnouncementBanner';
import { ForceUpdateGate } from './ForceUpdateGate';
import { MaintenanceGate } from './MaintenanceGate';

type Props = {
  app: RushAppId;
  children: React.ReactNode;
  /** Hide sticky announcement strip (default false). */
  hideAnnouncements?: boolean;
};

/** Standard root wrap: maintenance → force-update → announcements → app. */
export function AppConfigGates({ app, children, hideAnnouncements = false }: Props) {
  return (
    <MaintenanceGate app={app}>
      <ForceUpdateGate app={app}>
        {!hideAnnouncements ? <AnnouncementBanner app={app} /> : null}
        {children}
      </ForceUpdateGate>
    </MaintenanceGate>
  );
}
