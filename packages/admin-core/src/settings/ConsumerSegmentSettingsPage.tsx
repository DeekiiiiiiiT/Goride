/**
 * Consumer segment settings — General, Registration, Announcements only.
 */
import React from 'react';
import { ProductLineSettingsPage, type ProductLineSettingsPageProps } from './ProductLineSettingsPage';

export type ConsumerSegment = 'rides' | 'driver' | 'haul' | 'dash';

const SEGMENT_LABELS: Record<ConsumerSegment, string> = {
  rides: 'Roam Rides',
  driver: 'Roam Driver',
  haul: 'Roam Haul',
  dash: 'Roam Dash',
};

export type ConsumerSegmentSettingsPageProps = Omit<
  ProductLineSettingsPageProps,
  'segment' | 'showBusinessTypes' | 'showDangerZone'
> & {
  segment: ConsumerSegment;
};

export function ConsumerSegmentSettingsPage({
  segment,
  platformLabel,
  ...rest
}: ConsumerSegmentSettingsPageProps) {
  const allowedTabs = new Set(['general', 'registration', 'announcements', 'security']);
  const activeTab = rest.activeTab && allowedTabs.has(rest.activeTab) ? rest.activeTab : 'general';

  return (
    <ProductLineSettingsPage
      {...rest}
      segment={segment}
      activeTab={activeTab}
      showBusinessTypes={false}
      showDangerZone={false}
      platformLabel={platformLabel ?? `${SEGMENT_LABELS[segment]} Admin`}
    />
  );
}
