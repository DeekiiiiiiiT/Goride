import { describe, expect, it } from 'vitest';
import {
  TollV2CommandError,
  commandSavedDespiteFailure,
  isTollCommandTransportFailure,
} from './tollV2CommandError';

describe('isTollCommandTransportFailure', () => {
  it('546 and common gateway statuses', () => {
    expect(isTollCommandTransportFailure(new TollV2CommandError('x', 546, 'REQUEST_FAILED'))).toBe(true);
    expect(isTollCommandTransportFailure(new TollV2CommandError('x', 409, 'VERSION_CHANGED'))).toBe(false);
  });

  it('network errors', () => {
    expect(isTollCommandTransportFailure(new TypeError('Failed to fetch'))).toBe(true);
    expect(isTollCommandTransportFailure(new Error('network timeout'))).toBe(true);
  });
});

describe('commandSavedDespiteFailure', () => {
  it('seal_week when desk is sealed', () => {
    expect(commandSavedDespiteFailure('seal_week', { sealed: true })).toBe(true);
    expect(commandSavedDespiteFailure('seal_week', { sealed: false })).toBe(false);
  });

  it('reopen_week when desk is open', () => {
    expect(commandSavedDespiteFailure('reopen_week', { sealed: false })).toBe(true);
    expect(commandSavedDespiteFailure('reopen_week', { sealed: true })).toBe(false);
  });
});