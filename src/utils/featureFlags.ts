const STORAGE_KEY = 'roam_ledger_money_read_model';

/**
 * Phase 5 / 8 — When true, driver money UI uses `GET /ledger/driver-overview?source=canonical`
 * (canonical `ledger_event:*` aggregation).
 *
 * **Phase 8 default:** production builds (`import.meta.env.PROD`) use the canonical read model unless
 * `VITE_LEDGER_MONEY_READ_MODEL=false`. Development defaults off unless overridden.
 *
 * Overrides (first match wins):
 * - `localStorage.setItem('roam_ledger_money_read_model', '0')` — force legacy read path (emergency rollback in browser).
 * - `localStorage.setItem('roam_ledger_money_read_model', '1')` — force canonical in dev.
 * - `VITE_LEDGER_MONEY_READ_MODEL=true|false` in `.env` / CI.
 */
export function isLedgerMoneyReadModelEnabled(): boolean {
  try {
    if (typeof localStorage !== 'undefined') {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === '0') return false;
      if (v === '1') return true;
    }
    if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_LEDGER_MONEY_READ_MODEL === 'false') {
      return false;
    }
    if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_LEDGER_MONEY_READ_MODEL === 'true') {
      return true;
    }
    if (typeof import.meta !== 'undefined' && import.meta.env?.PROD) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}
