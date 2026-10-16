/**
 * Client/server-safe rollout evaluation (mirrors edge enterpriseReaders).
 */
export type RolloutValue = {
  mode: 'off' | 'beta_list' | 'percent' | 'on';
  percent: number;
  betaUserIds: string[];
};

export function rolloutPercentBucket(userId: string): number {
  let h = 2166136261;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 100;
}

export function evaluateRollout(
  rollout: RolloutValue,
  userId: string | null | undefined,
): boolean {
  switch (rollout.mode) {
    case 'off':
      return false;
    case 'on':
      return true;
    case 'beta_list':
      if (!userId) return false;
      return (rollout.betaUserIds || []).includes(userId);
    case 'percent': {
      if (!userId) return false;
      const pct = Math.max(0, Math.min(100, Number(rollout.percent) || 0));
      return rolloutPercentBucket(userId) < pct;
    }
    default:
      return false;
  }
}

/** Convenience: evaluate enterprise.rollouts.<app> bag. */
export function isRolloutEnabled(
  rollout: RolloutValue | null | undefined,
  userId: string | null | undefined,
): boolean {
  if (!rollout) return true;
  return evaluateRollout(rollout, userId);
}
