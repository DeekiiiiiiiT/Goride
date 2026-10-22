import { describe, expect, it } from 'vitest';
import { closedWeekSaveError, isClosedWeekSaveError } from './closedWeekTrip';

describe('closed week trip save', () => {
  it('keeps the office reason and the next step', () => {
    const err = closedWeekSaveError();
    expect(err.message).toContain('That pay week is closed');
    expect(err.message).toContain('Change the date to an open week');
    expect(isClosedWeekSaveError(err)).toBe(true);
  });

  it('recognises the server refusal', () => {
    expect(
      isClosedWeekSaveError(new Error('Failed to save trips: That pay week is closed, so this trip cannot be changed.')),
    ).toBe(true);
    expect(isClosedWeekSaveError(new Error('Network down'))).toBe(false);
  });
});