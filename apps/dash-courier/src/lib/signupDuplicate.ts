/**
 * Detect duplicate email/phone from Supabase signUp responses.
 * With email confirmation on, duplicates often return no error but empty identities.
 */

const DUPLICATE_RE =
  /already(?: been)? registered|already exists|user already|email address.*already|phone.*already/i;

export const DUPLICATE_ACCOUNT_MESSAGE =
  'This email is already registered. Sign in with that account, or use a different email to create a new one.';

export const DUPLICATE_PHONE_MESSAGE =
  'This phone number is already registered. Sign in with that account, or use a different number to create a new one.';

export function isDuplicateAuthError(message: string | undefined | null): boolean {
  return Boolean(message && DUPLICATE_RE.test(message));
}

/** True when Auth soft-rejects an existing email (no identities attached). */
export function isSoftDuplicateSignUp(data: {
  user?: { identities?: unknown[] | null } | null;
} | null | undefined): boolean {
  const user = data?.user;
  if (!user) return false;
  const identities = user.identities;
  return Array.isArray(identities) && identities.length === 0;
}
