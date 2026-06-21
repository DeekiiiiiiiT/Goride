export function goLiveStorageKey(merchantId: string) {
  return `roam_go_live_complete_${merchantId}`;
}

export function hasCompletedGoLive(merchantId: string) {
  return localStorage.getItem(goLiveStorageKey(merchantId)) === '1';
}

export function markGoLiveComplete(merchantId: string) {
  localStorage.setItem(goLiveStorageKey(merchantId), '1');
}

export function shouldShowGoLiveScreen(
  verificationStatus: string,
  merchantId: string,
): boolean {
  if (verificationStatus !== 'approved') return false;
  return !hasCompletedGoLive(merchantId);
}

export function getCustomerListingUrl(slug: string) {
  return `https://roamdash.co/restaurant/${slug}`;
}
