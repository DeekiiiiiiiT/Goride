export function firstOrderCelebrationKey(merchantId: string) {
  return `roam_first_order_celebrated_${merchantId}`;
}

export function hasSeenFirstOrderCelebration(merchantId: string) {
  return localStorage.getItem(firstOrderCelebrationKey(merchantId)) === '1';
}

export function markFirstOrderCelebrationSeen(merchantId: string) {
  localStorage.setItem(firstOrderCelebrationKey(merchantId), '1');
}

export function shouldShowFirstOrderCelebration(merchantId: string) {
  return !hasSeenFirstOrderCelebration(merchantId);
}
