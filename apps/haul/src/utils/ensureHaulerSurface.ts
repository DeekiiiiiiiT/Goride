import type { User } from '@supabase/supabase-js';
import {
  clearOAuthProfileMetadataPatch,
  shouldSkipOauthSurfaceWrite,
  userHasGoogleIdentity,
} from '@roam/auth-client';
import { supabase } from './supabase/client';

async function shouldClearOAuthProfileMetadata(user: User): Promise<boolean> {
  if (!userHasGoogleIdentity(user)) return false;

  const { data: profile } = await supabase
    .from('driver_profiles')
    .select('onboarding_complete, display_name, first_name, profile_photo_url')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profile?.onboarding_complete) return false;

  const hasAppProfile = Boolean(
    profile?.display_name?.trim() ||
      profile?.first_name?.trim() ||
      profile?.profile_photo_url?.trim(),
  );

  return !hasAppProfile;
}

export async function ensureHaulerSurface(user: User): Promise<User> {
  if (shouldSkipOauthSurfaceWrite(user, 'hauler')) return user;

  const surface = user.user_metadata?.surface;
  const needsSurface = surface !== 'hauler';
  const needsProfileClear = await shouldClearOAuthProfileMetadata(user);

  if (!needsSurface && !needsProfileClear) return user;

  const metadataPatch: Record<string, unknown> = {};
  if (needsSurface) metadataPatch.surface = 'hauler';
  if (needsProfileClear) Object.assign(metadataPatch, clearOAuthProfileMetadataPatch());

  const { data, error } = await supabase.auth.updateUser({ data: metadataPatch });
  if (error) {
    console.warn('ensureHaulerSurface:', error.message);
    return user;
  }
  return data.user ?? user;
}
