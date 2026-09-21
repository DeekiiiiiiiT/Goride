import { describe, expect, it } from 'vitest';
import {
  classifyStopToStopBucketRemediation,
  sortBucketsForRemediation,
  summarizeStopToStopRemediation,
} from './classifyStopToStopBucketRemediation.ts';

function bucket(
  partial: Partial<Parameters<typeof classifyStopToStopBucketRemediation>[0]> & {
    id?: string;
  } = {},
) {
  return {
    startOdometer: 1000,
    endOdometer: 1100,
    rideShareDistance: 0,
    personalDistance: 0,
    companyMiscDistance: 0,
    unaccountedDistance: 0,
    ...partial,
  };
}

describe('classifyStopToStopBucketRemediation', () => {
  it('returns chain when chainAnomaly', () => {
    const r = classifyStopToStopBucketRemediation(
      bucket({ chainAnomaly: true, endOdometer: 900 }),
    );
    expect(r.kind).toBe('chain');
    expect(r.suggestedActions).toContain('fix_odo');
  });

  it('returns chain when indeterminate', () => {
    const r = classifyStopToStopBucketRemediation(
      bucket({ confidenceTier: 'indeterminate' }),
    );
    expect(r.kind).toBe('chain');
  });

  it('returns ok when over-log within GPS band', () => {
    // 100 km odo → band max(5, 3) = 5; 4 km over-log OK
    const r = classifyStopToStopBucketRemediation(
      bucket({
        rideShareDistance: 104,
        unaccountedDistance: 4,
      }),
    );
    expect(r.kind).toBe('ok');
  });

  it('returns trips when rideShare dominates over-log', () => {
    const r = classifyStopToStopBucketRemediation(
      bucket({
        rideShareDistance: 180,
        personalDistance: 10,
        companyMiscDistance: 0,
        unaccountedDistance: 90,
      }),
    );
    expect(r.kind).toBe('trips');
    expect(r.suggestedActions[0]).toBe('review_trips');
  });

  it('returns adjustments when personal+company dominate', () => {
    const r = classifyStopToStopBucketRemediation(
      bucket({
        rideShareDistance: 20,
        personalDistance: 100,
        companyMiscDistance: 50,
        unaccountedDistance: 70,
      }),
    );
    expect(r.kind).toBe('adjustments');
    expect(r.suggestedActions).toContain('review_adjustments');
  });

  it('returns mixed when neither side dominates', () => {
    const r = classifyStopToStopBucketRemediation(
      bucket({
        rideShareDistance: 0,
        personalDistance: 0,
        companyMiscDistance: 0,
        unaccountedDistance: 40,
      }),
    );
    expect(r.kind).toBe('mixed');
  });

  it('sortBucketsForRemediation puts chain first then largest over-log', () => {
    const sorted = sortBucketsForRemediation([
      bucket({ id: 'a', unaccountedDistance: 80, rideShareDistance: 180 }),
      bucket({ id: 'b', chainAnomaly: true }),
      bucket({ id: 'c', unaccountedDistance: 40, rideShareDistance: 140 }),
    ]);
    expect(sorted.map((b) => b.id)).toEqual(['b', 'a', 'c']);
  });

  it('summarizeStopToStopRemediation is plain English', () => {
    const s = summarizeStopToStopRemediation(
      [
        bucket({ unaccountedDistance: 80, rideShareDistance: 180 }),
        bucket({ unaccountedDistance: 40, rideShareDistance: 140 }),
      ],
      '5179KZ',
    );
    expect(s).toMatch(/2 fill windows on 5179KZ/);
    expect(s).toMatch(/odometer/);
  });
});
