const STORAGE_KEY = 'roam_ledger_money_read_model';

/**
 * Phase 5 — When true, driver money UI uses `GET /ledger/driver-overview?source=canonical`
 * (canonical `ledger_event:*` aggregation). Default off until Phase 8 cutover.
 *
 * Enable: `localStorage.setItem('roam_ledger_money_read_model', '1')` or
 * `VITE_LEDGER_MONEY_READ_MODEL=true` at build time.
 */
export function isLedgerMoneyReadModelEnabled(): boolean {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_LEDGER_MONEY_READ_MODEL === 'true') {
      return true;
    }
    if (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === '1') {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}
