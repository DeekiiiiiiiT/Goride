import { describe, expect, it } from 'vitest';

const FORGOTTEN_ISSUE_TYPES = new Set(['never_arrived', 'late_order', 'other']);
const MIN_COURIER_WAIT_MINUTES = 20;

function shouldEvaluateForgottenRule(issueType: string, orderStatus: string, waitMinutes: number): boolean {
  return (
    FORGOTTEN_ISSUE_TYPES.has(issueType) &&
    ['preparing', 'accepted', 'placed'].includes(orderStatus) &&
    waitMinutes >= MIN_COURIER_WAIT_MINUTES
  );
}

describe('dispute resolution rules', () => {
  it('R1 triggers for never_arrived with long courier wait', () => {
    expect(shouldEvaluateForgottenRule('never_arrived', 'preparing', 25)).toBe(true);
  });

  it('R1 does not trigger before wait threshold', () => {
    expect(shouldEvaluateForgottenRule('never_arrived', 'preparing', 10)).toBe(false);
  });

  it('R1 does not trigger after delivery', () => {
    expect(shouldEvaluateForgottenRule('never_arrived', 'delivered', 30)).toBe(false);
  });
});
