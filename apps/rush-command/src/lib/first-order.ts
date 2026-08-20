export function firstOrderCelebrationKey(merchantId: string) {
  return `roam_first_order_celebrated_${merchantId}`;
}

export function hasSeenFirstOrderCelebration(merchantId: string) {
  return localStorage.getItem(firstOrderCelebrationKey(merchantId)) === '1';
}

export function markFirstOrderCelebrationSeen(merchantId: string) {
  localStorage.setItem(firstOrderCelebrationKey(merchantId), '1');
}

export function payoutSetupDismissedKey(merchantId: string) {
  return `roam_payout_setup_dismissed_${merchantId}`;
}

export function hasDismissedPayoutSetup(merchantId: string) {
  return localStorage.getItem(payoutSetupDismissedKey(merchantId)) === '1';
}

export function markPayoutSetupDismissed(merchantId: string) {
  localStorage.setItem(payoutSetupDismissedKey(merchantId), '1');
}

export function shouldShowFirstOrderCelebration(merchantId: string) {
  return !hasSeenFirstOrderCelebration(merchantId);
}
