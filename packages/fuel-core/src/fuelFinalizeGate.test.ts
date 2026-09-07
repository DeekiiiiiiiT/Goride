import { describe, expect, it } from 'vitest';
import {
  FUEL_MISC_MAX_RATIO,
  floorMiscForSplit,
  isFuelMiscWithinGate,
  isOverExplainedFuelWeek,
} from './fuelFinalizeGate';

describe('isOverExplainedFuelWeek', () => {
  it('passes a week whose misc is inside the 25% band', () => {
    expect(isOverExplainedFuelWeek(10000, 2000)).toBe(false);
    expect(isFuelMiscWithinGate(10000, 2000)).toBe(true);
  });

  it('flags a week whose misc exceeds 25% of spend', () => {
    expect(isOverExplainedFuelWeek(10000, 3000)).toBe(true);
    expect(isFuelMiscWithinGate(10000, 3000)).toBe(false);
  });

  it('flags large negative misc (fleet owes driver) — the audit debit week', () => {
    // audit headline #1: residual so large it flipped the driver negative
    expect(isOverExplainedFuelWeek(30000, -27898.73)).toBe(true);
  });

  it('treats any nonzero misc with zero spend as over-explained', () => {
    expect(isOverExplainedFuelWeek(0, 0.01)).toBe(true);
    expect(isOverExplainedFuelWeek(0, 0)).toBe(false);
  });

  it('honors a custom ratio', () => {
    expect(isOverExplainedFuelWeek(10000, 3000, 0.5)).toBe(false);
    expect(FUEL_MISC_MAX_RATIO).toBe(0.25);
  });
});

describe('floorMiscForSplit', () => {
  it('passes a positive misc straight through', () => {
    expect(floorMiscForSplit(1500)).toEqual({
      miscForSplit: 1500,
      overExplainedCost: 0,
    });
  });

  it('floors a negative misc to 0 and reports it as over-explained', () => {
    expect(floorMiscForSplit(-27898.73)).toEqual({
      miscForSplit: 0,
      overExplainedCost: 27898.73,
    });
  });

  it('handles zero and dirty input', () => {
    expect(floorMiscForSplit(0)).toEqual({ miscForSplit: 0, overExplainedCost: 0 });
    // @ts-expect-error characterization of dirty upstream input
    expect(floorMiscForSplit(undefined)).toEqual({ miscForSplit: 0, overExplainedCost: 0 });
  });
});
