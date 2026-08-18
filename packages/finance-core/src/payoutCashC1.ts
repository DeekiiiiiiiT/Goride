/**
 * C1: two payout_cash rows for the same driver, calendar day, and amount
 * from different idempotency keys — a re-import twin, not two real remittances.
 */
export type PayoutCashC1Row = {
  idempotencyKey?: string | null;
  amountMinor: number;
  effectiveAt?: string | null;
  driverId?: string | null;
};

export type PayoutCashC1Cluster = {
  key: string;
  copies: number;
  posted: number;
  real: number;
  keys: string[];
};

function dollars(minor: number): number {
  return Math.round(Number(minor || 0)) / 100;
}

export function clusterPayoutCashC1(rows: PayoutCashC1Row[]): PayoutCashC1Cluster[] {
  const groups = new Map<string, PayoutCashC1Row[]>();
  for (const e of rows) {
    const driver = String(e.driverId || '').trim().toLowerCase() || '__none__';
    const day = String(e.effectiveAt || '').slice(0, 10);
    const amt = dollars(e.amountMinor);
    const k = `${driver}|${day}|${amt.toFixed(2)}`;
    const g = groups.get(k) || [];
    g.push(e);
    groups.set(k, g);
  }
  const out: PayoutCashC1Cluster[] = [];
  for (const [k, group] of groups) {
    if (group.length < 2) continue;
    const uniq = new Set(group.map((e) => String(e.idempotencyKey || '').trim()).filter(Boolean));
    if (uniq.size < 2) continue;
    const posted = group.reduce((s, e) => s + dollars(e.amountMinor), 0);
    out.push({
      key: k,
      copies: group.length,
      posted,
      real: posted / group.length,
      keys: group.map((e) => String(e.idempotencyKey || '').slice(0, 90)),
    });
  }
  return out;
}
