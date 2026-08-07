/** Re-export shared Gas Card statement matcher (single source of truth). */
export {
  matchJaaStatementToDriverLogs,
  applyFuelMatchLinks,
  buildJaaMatchUpdates,
  isJaaStatementLedgerRow,
  type FuelEntryLike,
  type FuelMatchPair,
  type FuelMatchStatus,
  type JaaMatchApplySummary,
} from '../../../../packages/roam-shared/src/fuel/jaaFuelStatementMatcher';
