/**
 * Cross-tag low-balance queue — who needs a top-up before they run dry.
 */
import {
  computeTagBurnRate,
  estimateDaysToEmpty,
  estimateTripsRemaining,
  avgCostPerPassage,
  balanceRingState,
  type BalanceRingState,
  type BurnRateRow,
} from './tollTagBurnRate';

export interface LowBalanceTagInput {
  id: string;
  tagNumber: string;
  provider: string;
  status: string;
  assignedVehicleId?: string;
  assignedVehicleName?: string;
  /** Prefer live calculated balance; fall back to last cached. */
  balance: number;
  lowBalanceThreshold?: number;
  usageRows?: BurnRateRow[];
}

export interface LowBalanceQueueItem {
  id: string;
  tagNumber: string;
  provider: string;
  vehicleLabel: string;
  balance: number;
  threshold: number;
  ring: BalanceRingState;
  tripsRemaining: number | null;
  daysToEmpty: number | null;
  shortfall: number;
}

export function buildLowBalanceQueue(
  tags: LowBalanceTagInput[],
): LowBalanceQueueItem[] {
  const items: LowBalanceQueueItem[] = [];

  for (const tag of tags) {
    if (String(tag.status).toLowerCase() === 'inactive') continue;
    const threshold =
      Number.isFinite(tag.lowBalanceThreshold) && (tag.lowBalanceThreshold as number) > 0
        ? (tag.lowBalanceThreshold as number)
        : 500;
    const balance = Number.isFinite(tag.balance) ? tag.balance : 0;
    const ring = balanceRingState(balance, threshold);
    if (ring !== 'low' && ring !== 'empty' && ring !== 'watch') continue;
    // Queue only tags that are at/under threshold (or empty), not the 2× "watch" band.
    if (ring === 'watch') continue;

    const usage = tag.usageRows || [];
    const burn = computeTagBurnRate(usage);
    const avg = avgCostPerPassage(usage);

    items.push({
      id: tag.id,
      tagNumber: tag.tagNumber,
      provider: tag.provider,
      vehicleLabel: tag.assignedVehicleName || (tag.assignedVehicleId ? 'Assigned' : 'Unassigned'),
      balance,
      threshold,
      ring,
      tripsRemaining: estimateTripsRemaining(balance, avg),
      daysToEmpty: estimateDaysToEmpty(balance, burn),
      shortfall: Math.max(0, threshold - balance),
    });
  }

  return items.sort((a, b) => {
    if (a.ring === 'empty' && b.ring !== 'empty') return -1;
    if (b.ring === 'empty' && a.ring !== 'empty') return 1;
    return a.balance - b.balance;
  });
}
