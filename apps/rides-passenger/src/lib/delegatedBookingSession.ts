const INVITE_RETURN_KEY = 'roam:passenger-invite-token';

export function persistInviteReturnToken(token: string): void {
  try {
    sessionStorage.setItem(INVITE_RETURN_KEY, token);
  } catch {
    /* ignore */
  }
}

export function readInviteReturnToken(): string | null {
  try {
    return sessionStorage.getItem(INVITE_RETURN_KEY);
  } catch {
    return null;
  }
}

export function clearInviteReturnToken(): void {
  try {
    sessionStorage.removeItem(INVITE_RETURN_KEY);
  } catch {
    /* ignore */
  }
}
