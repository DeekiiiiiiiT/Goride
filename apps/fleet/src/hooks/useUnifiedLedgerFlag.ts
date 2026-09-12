/** Client flag for unified ledger read model (Block E). Server still gated separately. */
export function useUnifiedLedgerFlag(): boolean {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('roam_ledger_read_model') === '1') {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}
