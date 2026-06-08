import type { RoamMode } from '@roam/types/riderContacts';

export const OPEN_ROAM_LABEL = 'Open Roam';
export const SHADOW_ROAM_LABEL = 'Shadow Roam';

export const ROAM_MODE_TOOLTIPS: Record<RoamMode, string> = {
  open_roam:
    "You'll see the driver, map, and trip status. The rider gets the trip PIN.",
  shadow_roam:
    "You only pay. You won't see pickup or drop-off locations — just a receipt when they arrive.",
};

export const ROAM_MODE_DESCRIPTIONS: Record<RoamMode, string> = {
  open_roam: 'They can follow your trip live',
  shadow_roam: 'They only pay — your locations stay private',
};
