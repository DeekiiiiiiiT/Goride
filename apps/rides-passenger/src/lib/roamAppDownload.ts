import { RIDES_PLAY_STORE_META } from '@roam/play-store-launch';
import type { ShareContent } from '@/utils/systemShare';

export const ROAM_RIDES_PLAY_STORE_URL =
  `https://play.google.com/store/apps/details?id=${RIDES_PLAY_STORE_META.packageId}`;

/** Update when the iOS App Store listing is live. */
export const ROAM_RIDES_APP_STORE_URL = 'https://roam-s.co';

export function buildRoamRidesInviteShare(contactName?: string): ShareContent {
  const firstName = contactName?.trim().split(/\s+/)[0];
  const lead = firstName ? `Hey ${firstName}, get Roam on your phone!` : 'Get Roam on your phone!';

  return {
    title: 'Get Roam',
    message: `${lead}

Android (Google Play):
${ROAM_RIDES_PLAY_STORE_URL}

iPhone:
${ROAM_RIDES_APP_STORE_URL}`,
    url: ROAM_RIDES_PLAY_STORE_URL,
  };
}
