/** Re-export from finance-core — edge + fleet share one classifier.
 * Relative path (not @roam/*) so any accidental edge pull stays Deno-safe.
 */
export {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  classifyPostedBusinessTransaction,
  type BusinessTransactionEventType,
  type BusinessTransactionClassification,
} from '../../../../packages/finance-core/src/businessTransactionAccounting.ts';
