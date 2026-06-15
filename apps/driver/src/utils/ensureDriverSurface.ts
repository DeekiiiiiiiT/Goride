import type { User } from '@supabase/supabase-js';
import { shouldSkipOauthSurfaceWrite } from '@roam/auth-client';
import { supabase } from './supabase/client';

/** Rides driver edge routes require user_metadata.surface (or legacy role) = driver. */
export async function ensureDriverSurface(user: User): Promise<User> {
  if (shouldSkipOauthSurfaceWrite(user, 'driver')) return user;
  const { data, error } = await supabase.auth.updateUser({ data: { surface: 'driver' } });
  if (error) {
    console.warn('ensureDriverSurface:', error.message);
    return user;
  }
  return data.user ?? user;
}
