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

export function goLiveDismissedKey(merchantId: string) {
  return `roam_go_live_dismissed_${merchantId}`;
}

/** Skip the full-screen go-live gate; owner can finish setup in the partner app. */
export function dismissGoLiveScreen(merchantId: string) {
  localStorage.setItem(goLiveDismissedKey(merchantId), '1');
}

export function hasDismissedGoLiveScreen(merchantId: string) {
  return localStorage.getItem(goLiveDismissedKey(merchantId)) === '1';
}

/** Post-approval go-live screen — only after platform admin sets verified_at. */
export function shouldShowGoLiveScreen(merchant: Pick<Merchant, 'id' | 'verification_status' | 'verified_at'>): boolean {
  if (merchant.verification_status !== 'approved') return false;
  if (!merchant.verified_at) return false;
  if (hasCompletedGoLive(merchant.id)) return false;
  if (hasDismissedGoLiveScreen(merchant.id)) return false;
  return true;
}

/** Owner has not finished the partner onboarding application. */
export function needsOwnerOnboarding(
  merchant: Pick<Merchant, 'submitted_at' | 'name' | 'onboarding_status'>,
): boolean {
  if (merchant.onboarding_status === 'draft') return true;
  if (!merchant.submitted_at) return true;
  if (!merchant.name?.trim()) return true;
  return false;
}
