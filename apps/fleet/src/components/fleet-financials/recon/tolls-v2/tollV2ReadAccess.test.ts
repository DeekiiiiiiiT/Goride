import { describe, expect, it } from 'vitest';
import { isTollReadAccessRefusal, TOLL_V2_NO_ACCESS_MESSAGE } from './tollV2ReadAccess';

/**
 * A refused toll read is a permission answer, not a broken network. The screens pick their message from here, so
 * these two codes must be recognised and nothing else must be mistaken for them.
 */
describe('isTollReadAccessRefusal', () => {
  it('P0001 FORBIDDEN (toll_v2_weeks / toll_v2_metrics) is an access refusal', () => {
    expect(isTollReadAccessRefusal({ code: 'P0001', message: 'FORBIDDEN' })).toBe(true);
  });

  it('P0001 NO_COMPANY (no company on the sign-in) is an access refusal', () => {
    expect(isTollReadAccessRefusal({ code: 'P0001', message: 'NO_COMPANY' })).toBe(true);
  });

  it('42501 (insufficient privilege) is an access refusal', () => {
    expect(
      isTollReadAccessRefusal({ code: '42501', message: 'permission denied for function toll_v2_weeks' }),
    ).toBe(true);
  });

  it('a dropped connection is not an access refusal', () => {
    expect(isTollReadAccessRefusal(new TypeError('Failed to fetch'))).toBe(false);
  });

  it('an expired session or other server error is not an access refusal', () => {
    expect(isTollReadAccessRefusal({ code: 'PGRST301', message: 'JWT expired' })).toBe(false);
  });

  it('P0001 BAD_REQUEST (a week key that is not a Monday) is not an access refusal', () => {
    expect(
      isTollReadAccessRefusal({
        code: 'P0001',
        message: 'BAD_REQUEST',
        details: '{"week_key":"must be a Monday (ADR 0007)"}',
      }),
    ).toBe(false);
  });

  it('a P0001 command refusal is not an access refusal', () => {
    expect(isTollReadAccessRefusal({ code: 'P0001', message: 'PENDING_NOT_RESOLVED' })).toBe(false);
  });

  it('P0001 with no message is not treated as an access refusal', () => {
    expect(isTollReadAccessRefusal({ code: 'P0001' })).toBe(false);
  });

  it('nothing to read is not an access refusal', () => {
    expect(isTollReadAccessRefusal(null)).toBe(false);
    expect(isTollReadAccessRefusal(undefined)).toBe(false);
  });

  it('the message says the toll data is not theirs, in plain words', () => {
    expect(TOLL_V2_NO_ACCESS_MESSAGE).toBe("You don't have access to toll data for this company.");
  });
});
