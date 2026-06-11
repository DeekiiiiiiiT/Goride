import type { PickupLocationDeliveryChannel } from '@roam/types/pickupLocationRequest';

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
