import type { Merchant } from '../hooks/useMerchant';
import { fetchApplicationStatus } from './partner-api';
import { resolveGoLiveRule } from '@roam/vertical-config';

export function goLiveStorageKey(merchantId: string) {
  return `roam_go_live_complete_${merchantId}`;
}

export function hasCompletedGoLive(merchantId: string) {
  return localStorage.getItem(goLiveStorageKey(merchantId)) === '1';
}

/** Persist that the approval gate is done — does not clear setup/dismiss bypass flags. */
export function rememberGoLiveComplete(merchantId: string) {
  localStorage.setItem(goLiveStorageKey(merchantId), '1');
}

export function markGoLiveComplete(merchantId: string) {
  rememberGoLiveComplete(merchantId);
  clearRestaurantSetupInProgress(merchantId);
  localStorage.removeItem(goLiveDismissedKey(merchantId));
}

export function goLiveDismissedKey(merchantId: string) {
  return `roam_go_live_dismissed_${merchantId}`;
}

/** Owner finished setup but chose dashboard over going live yet. */
export function dismissGoLiveScreen(merchantId: string) {
  localStorage.setItem(goLiveDismissedKey(merchantId), '1');
  // Pausing later must not reopen this first-time screen.
  rememberGoLiveComplete(merchantId);
}

export function hasDismissedGoLiveScreen(merchantId: string) {
  return localStorage.getItem(goLiveDismissedKey(merchantId)) === '1';
}

export function restaurantSetupInProgressKey(merchantId: string) {
  return `roam_restaurant_setup_${merchantId}`;
}

/** Owner left the approved screen to set up menu/catalog in the partner app. */
export function markRestaurantSetupInProgress(merchantId: string) {
  localStorage.setItem(restaurantSetupInProgressKey(merchantId), '1');
}

export function hasRestaurantSetupInProgress(merchantId: string) {
  return localStorage.getItem(restaurantSetupInProgressKey(merchantId)) === '1';
}

export function clearRestaurantSetupInProgress(merchantId: string) {
  localStorage.removeItem(restaurantSetupInProgressKey(merchantId));
}

/**
 * Post-approval go-live screen — first-time gate only.
 * Pausing orders (is_accepting_orders=false) must NOT reopen this screen once
 * the owner has already operated or left the gate.
 */
export function shouldShowGoLiveScreen(
  merchant: Pick<
    Merchant,
    'id' | 'verification_status' | 'verified_at' | 'is_accepting_orders'
  >,
): boolean {
  if (merchant.verification_status !== 'approved') return false;
  if (!merchant.verified_at) return false;
  if (hasCompletedGoLive(merchant.id)) return false;
  // Soft skip while currently accepting; rememberGoLiveComplete should run on load
  // so a later pause does not fall through and trap the owner here.
  if (merchant.is_accepting_orders) return false;
  return true;
}

/** Allow main app navigation instead of the full-screen go-live gate. */
export function shouldBypassGoLiveGate(merchantId: string): boolean {
  return hasDismissedGoLiveScreen(merchantId) || hasRestaurantSetupInProgress(merchantId);
}

/** Payout verified by admin, or test store bypass. */
export function isMerchantPayoutGoLiveReady(
  merchant: Pick<Merchant, 'payout_ready' | 'is_test_merchant'>,
): boolean {
  return Boolean(merchant.payout_ready || merchant.is_test_merchant);
}

export async function isVerticalGoLiveReady(
  merchant: Pick<Merchant, 'go_live_rule' | 'payout_ready' | 'is_test_merchant'>,
): Promise<boolean> {
  const status = await fetchApplicationStatus();
  const rule = resolveGoLiveRule(merchant.go_live_rule ?? status.merchant?.go_live_rule);
  const c = status.checklist;
  const setupReady =
    rule === 'catalog_imported' || rule === 'pos_connected'
      ? c.catalogComplete && c.profileComplete && c.hoursComplete && c.documentsComplete
      : c.menuComplete && c.profileComplete && c.hoursComplete && c.documentsComplete;
  return setupReady && isMerchantPayoutGoLiveReady(merchant);
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
