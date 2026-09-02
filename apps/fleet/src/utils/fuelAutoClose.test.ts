/**
 * Auto-close eligibility matrix (NEW-9 + v1 snapshot gate) — no jsdom.
 */
import { describe, expect, it } from 'vitest';
import {
  autoCloseStatusBadge,
  evaluateAutoCloseEligibility,
  shouldAutoClosePeriod,
} from './fuelAutoClose';

describe('fuelAutoClose eligibility', () => {
  it('allows clean zero-spend weeks', () => {
    expect(
      evaluateAutoCloseEligibility({
        locked: false,
        actionableTotal: 0,
        netLeakage: 0,
        totalSpend: 0,
        hasSettlementSnapshots: false,
        secondApproverThreshold: 50_000,
      }),
    ).toEqual({ eligible: true });
  });

  it('NEW-9: skips weeks above second-approver threshold', () => {
    const ev = evaluateAutoCloseEligibility({
      locked: false,
      actionableTotal: 0,
      netLeakage: 0,
      leakageReviewed: true,
      totalSpend: 60_000,
      hasSettlementSnapshots: true,
      secondApproverThreshold: 50_000,
    });
    expect(ev).toEqual({ eligible: false, reason: 'needs_approval' });
    expect(autoCloseStatusBadge({
      locked: false,
      actionableTotal: 0,
      netLeakage: 0,
      leakageReviewed: true,
      totalSpend: 60_000,
      hasSettlementSnapshots: true,
      secondApproverThreshold: 50_000,
    })?.label).toMatch(/second approval/i);
  });

  it('service_approve: high-spend weeks stay eligible with system badge', () => {
    const period = {
      locked: false,
      actionableTotal: 0,
      netLeakage: 0,
      leakageReviewed: true,
      totalSpend: 60_000,
      hasSettlementSnapshots: true,
      secondApproverThreshold: 50_000,
      autoCloseDualApprovalMode: 'service_approve' as const,
    };
    expect(evaluateAutoCloseEligibility(period)).toEqual({ eligible: true });
    expect(autoCloseStatusBadge(period)?.label).toMatch(/system approval/i);
  });

  it('NEW-9: threshold 0 disables approval gate', () => {
    expect(
      shouldAutoClosePeriod({
        locked: false,
        actionableTotal: 0,
        netLeakage: 0,
        leakageReviewed: true,
        totalSpend: 999_999,
        hasSettlementSnapshots: true,
        secondApproverThreshold: 0,
      }),
    ).toBe(true);
  });

  it('v1 Program 4: money week without client snapshots can still be eligible', () => {
    expect(
      evaluateAutoCloseEligibility({
        locked: false,
        actionableTotal: 0,
        netLeakage: 0,
        leakageReviewed: true,
        totalSpend: 1_000,
        hasSettlementSnapshots: false,
        secondApproverThreshold: 0,
      }),
    ).toEqual({ eligible: true });
  });

  it('allows money week when snapshots exist and under threshold', () => {
    expect(
      evaluateAutoCloseEligibility({
        locked: false,
        actionableTotal: 0,
        netLeakage: 0,
        leakageReviewed: true,
        totalSpend: 10_000,
        hasSettlementSnapshots: true,
        secondApproverThreshold: 50_000,
      }),
    ).toEqual({ eligible: true });
  });

  it('blocks open actionables and unreviewed leakage', () => {
    expect(
      evaluateAutoCloseEligibility({
        locked: false,
        actionableTotal: 2,
        netLeakage: 0,
        totalSpend: 0,
      }).reason,
    ).toBe('actionables');
    expect(
      evaluateAutoCloseEligibility({
        locked: false,
        actionableTotal: 0,
        netLeakage: 50,
        leakageReviewed: false,
        totalSpend: 0,
      }).reason,
    ).toBe('leakage');
  });
});
