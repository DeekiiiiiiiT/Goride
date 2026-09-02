import { describe, expect, it } from 'vitest';
import {
  deriveFuelExpenseStatus,
  fuelExpenseStatusIsFinalized,
  fuelExpenseStatusLabel,
  isFuelReconPeriodLocked,
} from './fuelReconPeriodStatus';

describe('deriveFuelExpenseStatus', () => {
  it('finalized when recon period is locked by status', () => {
    expect(deriveFuelExpenseStatus(true, { status: 'locked' })).toBe('finalized');
    expect(fuelExpenseStatusIsFinalized('finalized')).toBe(true);
  });

  it('finalized when locked_at is set even if status lags', () => {
    expect(
      deriveFuelExpenseStatus(false, { status: 'ready', lockedAt: '2026-09-01T12:00:00Z' }),
    ).toBe('finalized');
    expect(isFuelReconPeriodLocked({ lockedAt: '2026-09-01T12:00:00Z' })).toBe(true);
  });

  it('in_progress when fuel activity and open recon period', () => {
    expect(deriveFuelExpenseStatus(true, { status: 'ready' })).toBe('in_progress');
    expect(deriveFuelExpenseStatus(true, { status: 'open' })).toBe('in_progress');
    expect(deriveFuelExpenseStatus(true, { status: 'in_review' })).toBe('in_progress');
    expect(deriveFuelExpenseStatus(true, { status: 'reopened' })).toBe('in_progress');
  });

  it('pending when fuel activity but no recon period row', () => {
    expect(deriveFuelExpenseStatus(true, null)).toBe('pending');
    expect(deriveFuelExpenseStatus(true, undefined)).toBe('pending');
  });

  it('n/a when no fuel activity and week not locked', () => {
    expect(deriveFuelExpenseStatus(false, { status: 'ready' })).toBe('n/a');
    expect(deriveFuelExpenseStatus(false, null)).toBe('n/a');
  });

  it('labels match Expenses badges', () => {
    expect(fuelExpenseStatusLabel('finalized')).toBe('Finalized');
    expect(fuelExpenseStatusLabel('in_progress')).toBe('In Progress');
    expect(fuelExpenseStatusLabel('pending')).toBe('Pending');
    expect(fuelExpenseStatusLabel('n/a')).toBe('—');
  });
});
