/** Re-export fleet-canonical toll date parsing from @roam/toll-core. */
export {
  parseTollDate,
  getTollTransactionDate,
  ymdToLocalDate,
  normalizeWallClockTime,
} from '@roam/toll-core';
export type { TollDateSource } from '@roam/toll-core';
