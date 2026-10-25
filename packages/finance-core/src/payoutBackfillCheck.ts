import { round2 } from './money.ts';

export type PaidMovement = {
  week: string;
  kind: string;
  status: string;
  amount: number;
  reversedKind?: string | null;
  idempotencyKey?: string | null;
};

export type ExtraPay = {
  week: string;
  amount: number;
  idempotencyKey: string;
};

/** A collect or write-off reversal does not change what the driver was paid. */
export function reversalReducesPay(reversedKind: string | null | undefined): boolean {
  const kind = String(reversedKind || '');
  return kind !== 'collect' && kind !== 'write_off';
}

/**
 * After the extra payments, pay minus payment-reversals must equal settlement_paid.
 * Returns the weeks that would still be off.
 */
export function weeksStillOff(input: {
  weeks: Array<{ week: string; settlementPaid: number }>;
  movements: PaidMovement[];
  extraPays: ExtraPay[];
}): Array<{ week: string; settlementPaid: number; payMinusReverse: number; gap: number }> {
  const postedKeys = new Set(
    input.movements
      .map((row) => String(row.idempotencyKey || ''))
      .filter(Boolean),
  );
  const byWeek = new Map<string, { pay: number; reverse: number }>();
  const touch = (week: string) => {
    const key = week.slice(0, 10);
    const cur = byWeek.get(key) || { pay: 0, reverse: 0 };
    byWeek.set(key, cur);
    return cur;
  };
  for (const row of input.movements) {
    if (String(row.status || '') !== 'posted') continue;
    const bucket = touch(row.week);
    if (row.kind === 'pay') bucket.pay += Number(row.amount) || 0;
    else if (row.kind === 'reverse' && reversalReducesPay(row.reversedKind)) {
      bucket.reverse += Number(row.amount) || 0;
    }
  }
  for (const extra of input.extraPays) {
    if (postedKeys.has(extra.idempotencyKey)) continue;
    touch(extra.week).pay += Number(extra.amount) || 0;
  }
  const off: Array<{ week: string; settlementPaid: number; payMinusReverse: number; gap: number }> = [];
  const seen = new Set<string>();
  for (const week of input.weeks) {
    const key = week.week.slice(0, 10);
    seen.add(key);
    const bucket = byWeek.get(key) || { pay: 0, reverse: 0 };
    const payMinusReverse = round2(bucket.pay - bucket.reverse);
    const settlementPaid = round2(Number(week.settlementPaid) || 0);
    const gap = round2(payMinusReverse - settlementPaid);
    if (Math.abs(gap) > 0.01) off.push({ week: key, settlementPaid, payMinusReverse, gap });
  }
  for (const [key, bucket] of byWeek) {
    if (seen.has(key)) continue;
    const payMinusReverse = round2(bucket.pay - bucket.reverse);
    if (Math.abs(payMinusReverse) > 0.01) {
      off.push({ week: key, settlementPaid: 0, payMinusReverse, gap: payMinusReverse });
    }
  }
  return off;
}
