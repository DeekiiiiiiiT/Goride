import type { User } from '@supabase/supabase-js';
import { shouldSkipOauthSurfaceWrite } from '@roam/auth-client';
import { supabase } from './supabase/client';

export async function ensureHaulerSurface(user: User): Promise<User> {
  if (shouldSkipOauthSurfaceWrite(user, 'hauler')) return user;
  const surface = user.user_metadata?.surface;
  if (surface === 'hauler') return user;
  const { data, error } = await supabase.auth.updateUser({ data: { surface: 'hauler' } });
  if (error) {
    console.warn('ensureHaulerSurface:', error.message);
    return user;
  }
  return data.user ?? user;
}
