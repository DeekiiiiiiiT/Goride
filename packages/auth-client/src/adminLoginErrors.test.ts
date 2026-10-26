import { describe, expect, it } from 'vitest';
import {
  ADMIN_INCORRECT_CREDENTIALS,
  DOMINION_ACCESS_DENIED_MESSAGE,
  adminPasswordFailureMessage,
  dominionAccessDeniedMessage,
} from './adminLoginErrors';

describe('dominion login copy', () => {
  it('keeps the first access refusal generic', () => {
    expect(dominionAccessDeniedMessage(1)).toBe(ADMIN_INCORRECT_CREDENTIALS);
  });

  it('explains the owner change after the second access refusal', () => {
    expect(dominionAccessDeniedMessage(2)).toBe(DOMINION_ACCESS_DENIED_MESSAGE);
  });

  it('shows attempts left once three or fewer remain', () => {
    expect(adminPasswordFailureMessage(4)).toBe(ADMIN_INCORRECT_CREDENTIALS);
    expect(adminPasswordFailureMessage(3)).toBe(
      'Incorrect credentials (3 attempts remaining before lockout)',
    );
    expect(adminPasswordFailureMessage(1)).toBe(
      'Incorrect credentials (1 attempt remaining before lockout)',
    );
    expect(adminPasswordFailureMessage(undefined)).toBe(ADMIN_INCORRECT_CREDENTIALS);
  });
});