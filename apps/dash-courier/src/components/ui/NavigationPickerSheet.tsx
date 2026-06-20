import React from 'react';
import { ActionSheet } from '@/components/ui/ActionSheet';

const NAV_APPS = [
  { id: 'google', label: 'Google Maps', icon: 'map' },
  { id: 'waze', label: 'Waze', icon: 'navigation' },
  { id: 'apple', label: 'Apple Maps', icon: 'explore' },
];

type NavigationPickerSheetProps = {
  open: boolean;
  destination?: string;
  onSelect: (appId: string) => void;
  onClose: () => void;
};

export function NavigationPickerSheet({
  open,
  destination,
  onSelect,
  onClose,
}: NavigationPickerSheetProps) {
  return (
    <ActionSheet
      open={open}
      title={destination ? `Navigate to ${destination}` : 'Open in maps'}
      options={NAV_APPS}
      onSelect={onSelect}
      onClose={onClose}
    />
  );
}
