import type { DriverCarKitItem } from '../../services/driverInventoryApi';

export function carKitItemStatusLabel(status?: DriverCarKitItem['status']): string {
  if (status === 'linked') return 'Linked';
  if (status === 'present') return 'In the car';
  if (status === 'reported') return 'Reported';
  return 'Missing';
}

export function carKitItemStatusClass(status?: DriverCarKitItem['status']): string {
  if (status === 'missing' || status === 'reported') {
    return 'px-space-xs py-1 rounded-full bg-error-container text-on-error-container font-label-status text-label-status flex items-center gap-1 flex-shrink-0 shadow-sm';
  }
  if (status === 'linked') {
    return 'px-space-xs py-1 rounded-full bg-surface-container-lowest text-secondary font-label-status text-label-status flex items-center gap-1 flex-shrink-0 shadow-sm';
  }
  return 'px-space-xs py-1 rounded-full bg-surface-container-lowest text-primary font-label-status text-label-status flex items-center gap-1 flex-shrink-0 shadow-sm';
}

export function carKitItemIcon(status?: DriverCarKitItem['status']): string {
  if (status === 'missing') return 'error';
  if (status === 'linked') return 'link';
  return 'check_circle';
}
