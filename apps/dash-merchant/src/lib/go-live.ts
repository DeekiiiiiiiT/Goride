import type { Merchant } from '../hooks/useMerchant';

export function goLiveStorageKey(merchantId: string) {
  return `roam_go_live_complete_${merchantId}`;
}

export function hasCompletedGoLive(merchantId: string) {
  return localStorage.getItem(goLiveStorageKey(merchantId)) === '1';
}

export function markGoLiveComplete(merchantId: string) {
  localStorage.setItem(goLiveStorageKey(merchantId), '1');
}

/** Post-approval go-live screen — only after platform admin sets verified_at. */
export function shouldShowGoLiveScreen(merchant: Pick<Merchant, 'id' | 'verification_status' | 'verified_at'>): boolean {
  if (merchant.verification_status !== 'approved') return false;
  if (!merchant.verified_at) return false;
  return !hasCompletedGoLive(merchant.id);
}

/** Owner has not finished the partner onboarding application. */
export function needsOwnerOnboarding(merchant: Pick<Merchant, 'submitted_at' | 'name'>): boolean {
  if (!merchant.submitted_at) return true;
  if (!merchant.name?.trim()) return true;
  return false;
}

/** Customer app deep link — opens restaurant page on roamdash.co */
export function getCustomerListingUrl(merchantId: string) {
  return `https://roamdash.co/?merchant=${encodeURIComponent(merchantId)}`;
}
