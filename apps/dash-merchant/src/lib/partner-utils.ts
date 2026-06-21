export type PartnerTab = 'dashboard' | 'orders' | 'menu' | 'analytics' | 'account' | 'earnings';

export function formatJmd(amount: number) {
  return `J$${amount.toLocaleString('en-JM', { maximumFractionDigits: 0 })}`;
}

export function formatSignedJmd(amount: number) {
  const prefix = amount >= 0 ? '+' : '-';
  return `${prefix}J$${Math.abs(amount).toLocaleString('en-JM', { maximumFractionDigits: 0 })}`;
}

export function formatElapsedTimer(from: string) {
  const totalSeconds = Math.max(0, Math.floor((Date.now() - new Date(from).getTime()) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatCountdown(remainingSeconds: number) {
  const total = Math.max(0, remainingSeconds);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatTimeAgo(dateString: string) {
  const mins = Math.round((Date.now() - new Date(dateString).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function formatMinAgo(dateString: string) {
  const mins = Math.round((Date.now() - new Date(dateString).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  return `${mins} min ago`;
}

export type StoreStatus = 'open' | 'closed' | 'paused';

export function getStoreStatus(
  isActive: boolean,
  isAcceptingOrders: boolean,
): StoreStatus {
  if (!isActive) return 'closed';
  if (!isAcceptingOrders) return 'paused';
  return 'open';
}
