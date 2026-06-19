/**
 * Google OAuth profile scope injects name/avatar into user_metadata.
 * Consumer apps should request email only and store profile data from onboarding.
 */

import type { User } from '@supabase/supabase-js';

/** Limits Google OAuth to email — avoids name/avatar in Supabase user_metadata. */
export const GOOGLE_OAUTH_EMAIL_ONLY_SCOPES = 'https://www.googleapis.com/auth/userinfo.email';

const OAUTH_PROFILE_METADATA_KEYS = ['name', 'full_name', 'avatar_url', 'picture'] as const;

export function userHasGoogleIdentity(user: Pick<User, 'identities'> | null | undefined): boolean {
  if (!user?.identities?.length) return false;
  return user.identities.some((identity) => identity.provider === 'google');
}

/** Patch values that clear OAuth-injected profile fields from user_metadata. */
export function clearOAuthProfileMetadataPatch(): Record<string, null> {
  return Object.fromEntries(OAUTH_PROFILE_METADATA_KEYS.map((key) => [key, null])) as Record<
    string,
    null
  >;
}

export function hasOAuthInjectedProfileMetadata(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  if (!metadata) return false;
  return OAUTH_PROFILE_METADATA_KEYS.some((key) => {
    const value = metadata[key];
    return typeof value === 'string' && value.trim().length > 0;
  });
}
