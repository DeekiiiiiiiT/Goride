export type PartnerFeatureFlag =
  | 'menuDragReorder'
  | 'swipeAcceptOrders'
  | 'webPushNotifications'
  | 'staffOperationsV1'
  | 'staffStationPinV1'
  | 'restaurantMgmtPreviewV1';

const FLAG_DEFAULTS: Record<PartnerFeatureFlag, boolean> = {
  menuDragReorder: true,
  swipeAcceptOrders: true,
  webPushNotifications: true,
  staffOperationsV1: false,
  staffStationPinV1: false,
  restaurantMgmtPreviewV1: false,
};

function storageKey(merchantId: string) {
  return `roam_partner_flags_${merchantId}`;
}

function loadFlags(merchantId: string): Record<PartnerFeatureFlag, boolean> {
  try {
    const raw = localStorage.getItem(storageKey(merchantId));
    if (!raw) return { ...FLAG_DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Record<PartnerFeatureFlag, boolean>>;
    return { ...FLAG_DEFAULTS, ...parsed };
  } catch {
    return { ...FLAG_DEFAULTS };
  }
}

export function readFlag(merchantId: string, flag: PartnerFeatureFlag): boolean {
  return loadFlags(merchantId)[flag];
}

export function setFlag(merchantId: string, flag: PartnerFeatureFlag, enabled: boolean) {
  const flags = loadFlags(merchantId);
  flags[flag] = enabled;
  localStorage.setItem(storageKey(merchantId), JSON.stringify(flags));
}

export function setDefaultFlags(merchantId: string) {
  localStorage.setItem(storageKey(merchantId), JSON.stringify(FLAG_DEFAULTS));
}

export function enableAllPartnerFlags(merchantId: string) {
  localStorage.setItem(
    storageKey(merchantId),
    JSON.stringify({
      menuDragReorder: true,
      swipeAcceptOrders: true,
      webPushNotifications: true,
      staffOperationsV1: true,
      staffStationPinV1: true,
      restaurantMgmtPreviewV1: true,
    } satisfies Record<PartnerFeatureFlag, boolean>),
  );
}
