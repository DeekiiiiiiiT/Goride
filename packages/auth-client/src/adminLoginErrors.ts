/** Generic message for wrong password or non-admin role — never disclose which. */
export const ADMIN_INCORRECT_CREDENTIALS = 'Incorrect credentials';

/** Shown only after two access refusals in this browser. The password already worked. */
export const DOMINION_ACCESS_DENIED_MESSAGE =
  "This account doesn't have access to Roam Dominion. If you recently changed the owner account, sign in with the new owner email.";

const FLASH_KEY = 'roam_admin_login_error';
const ACCESS_DENIED_COUNT_KEY = 'roam_dominion_access_denied_count';

export function dominionAccessDeniedMessage(count: number): string {
  return count >= 2 ? DOMINION_ACCESS_DENIED_MESSAGE : ADMIN_INCORRECT_CREDENTIALS;
}

export function adminPasswordFailureMessage(attemptsRemaining: number | undefined): string {
  if (attemptsRemaining !== undefined && attemptsRemaining <= 3) {
    const noun = attemptsRemaining === 1 ? 'attempt' : 'attempts';
    return `${ADMIN_INCORRECT_CREDENTIALS} (${attemptsRemaining} ${noun} remaining before lockout)`;
  }
  return ADMIN_INCORRECT_CREDENTIALS;
}

/** Count consecutive "password worked, no Dominion access" results in this browser. */
export function recordDominionAccessDenied(): number {
  try {
    const next = Number(sessionStorage.getItem(ACCESS_DENIED_COUNT_KEY) || '0') + 1;
    const count = Number.isFinite(next) && next > 0 ? next : 1;
    sessionStorage.setItem(ACCESS_DENIED_COUNT_KEY, String(count));
    return count;
  } catch {
    return 1;
  }
}

export function clearDominionAccessDenied(): void {
  try {
    sessionStorage.removeItem(ACCESS_DENIED_COUNT_KEY);
  } catch {
    /* private mode / blocked storage */
  }
}

export function flashAdminLoginError(message = ADMIN_INCORRECT_CREDENTIALS): void {
  try {
    sessionStorage.setItem(FLASH_KEY, message);
  } catch {
    /* private mode / blocked storage */
  }
}

export function consumeAdminLoginErrorFlash(): string | null {
  try {
    const value = sessionStorage.getItem(FLASH_KEY);
    if (value) sessionStorage.removeItem(FLASH_KEY);
    return value;
  } catch {
    return null;
  }
}
