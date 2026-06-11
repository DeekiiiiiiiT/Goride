import type { PickupLocationDeliveryChannel } from '@roam/types/pickupLocationRequest';

export const PICKUP_LOCATION_ACTIVITY_HINT =
  'Choose someone above. Roam users get an in-app request; others receive a text with a share link.';

export function pickupLocationRequestCreatedToast(
  riderName: string,
  deliveryChannel: PickupLocationDeliveryChannel,
  smsSent: boolean,
): string {
  if (deliveryChannel === 'in_app') {
    return `Request sent in Roam — waiting for ${riderName} to share their location`;
  }
  if (smsSent) {
    return `Text sent to ${riderName} with a link to share their location`;
  }
  return 'Request created — SMS may be delayed';
}

export function pickupLocationPendingChannelLabel(
  deliveryChannel: PickupLocationDeliveryChannel | null | undefined,
): string | null {
  if (deliveryChannel === 'in_app') return 'Sent in their Roam app';
  if (deliveryChannel === 'sms') return 'Text message sent';
  return null;
}
