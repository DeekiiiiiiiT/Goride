/**
 * Cross-tag low-balance queue — who needs a top-up before they run dry.
 */
import {
  computeTagBurnRate,
  estimateDaysToEmpty,
  estimateTripsRemaining,
  avgCostPerPassage,
  classifyTagBalance,
  resolveLowBalanceThreshold,
  type TagBalanceAttention,
  type BurnRateRow,
} from './tollTagBurnRate';

export interface LowBalanceTagInput {
  id: string;
  tagNumber: string;
  provider: string;
  status: string;
  assignedVehicleId?: string;
  assignedVehicleName?: string;
  /** Null when the server has never calculated a balance. */
  balance: number | null;
  lowBalanceThreshold?: number;
  orgDefaultThreshold?: number | null;
  usageRows?: BurnRateRow[];
}

export interface LowBalanceQueueItem {
  id: string;
  tagNumber: string;
  provider: string;
  vehicleLabel: string;
  balance: number | null;
  threshold: number;
  ring: TagBalanceAttention;
  tripsRemaining: number | null;
  daysToEmpty: number | null;
  shortfall: number | null;
}

export function buildLowBalanceQueue(
  tags: LowBalanceTagInput[],
): LowBalanceQueueItem[] {
  const items: LowBalanceQueueItem[] = [];

  for (const tag of tags) {
    const status = String(tag.status).toLowerCase();
    if (status === 'inactive' || status === 'retired') continue;
    const threshold = resolveLowBalanceThreshold(tag.lowBalanceThreshold, tag.orgDefaultThreshold);
    const balance = typeof tag.balance === 'number' && Number.isFinite(tag.balance) ? tag.balance : null;
    const ring = classifyTagBalance(balance, threshold);
    // Watch (at or above the alert, under 2×) is healthy enough to stay off this queue.
    if (ring === 'healthy' || ring === 'watch') continue;

    const usage = tag.usageRows || [];
    const burn = computeTagBurnRate(usage);
    const avg = avgCostPerPassage(usage);
    const known = balance != null;

    items.push({
      id: tag.id,
      tagNumber: tag.tagNumber,
      provider: tag.provider,
      vehicleLabel: tag.assignedVehicleName || (tag.assignedVehicleId ? 'Assigned' : 'Unassigned'),
      balance,
      threshold,
      ring,
      tripsRemaining: known ? estimateTripsRemaining(balance, avg) : null,
      daysToEmpty: known ? estimateDaysToEmpty(balance, burn) : null,
      shortfall: known ? Math.max(0, threshold - balance) : null,
    });
  }

  const rank = (ring: TagBalanceAttention) => (ring === 'empty' ? 0 : ring === 'low' ? 1 : 2);
  return items.sort((a, b) => {
    const byRing = rank(a.ring) - rank(b.ring);
    if (byRing !== 0) return byRing;
    const aDays = a.daysToEmpty;
    const bDays = b.daysToEmpty;
    if (aDays != null && bDays != null && aDays !== bDays) return aDays - bDays;
    if (aDays == null && bDays != null) return 1;
    if (aDays != null && bDays == null) return -1;
    return (a.balance ?? Number.POSITIVE_INFINITY) - (b.balance ?? Number.POSITIVE_INFINITY);
  });
}
