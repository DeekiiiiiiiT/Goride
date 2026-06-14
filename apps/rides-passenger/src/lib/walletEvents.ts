/** Fired after cash settlement / wallet-affecting actions so Account + Wallet screens refetch. */
export const WALLET_BALANCE_CHANGED_EVENT = 'roam-wallet-balance-changed';

export function notifyWalletBalanceChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(WALLET_BALANCE_CHANGED_EVENT));
}
