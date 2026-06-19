import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase/client';

export type ProfileUpdateData = {
  fullName: string;
  displayName: string;
  phone: string;
  photoFile?: File | null;
};

export async function updateHaulerProfile(user: User, data: ProfileUpdateData): Promise<void> {
  let photoUrl: string | undefined;

  if (data.photoFile) {
    const ext = data.photoFile.name.split('.').pop() || 'jpg';
    const path = `${user.id}/avatar.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from('driver-photos')
      .upload(path, data.photoFile, { upsert: true });
    if (!uploadErr) {
      const { data: urlData } = supabase.storage.from('driver-photos').getPublicUrl(path);
      photoUrl = urlData.publicUrl;
    }
  }

  const displayName = data.displayName.trim() || data.fullName.trim();

  const { data: existing } = await supabase
    .from('driver_profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  const row = {
    display_name: displayName,
    first_name: data.fullName.trim(),
    phone: data.phone.trim(),
    ...(photoUrl ? { profile_photo_url: photoUrl } : {}),
  };

  if (existing?.id) {
    const { error } = await supabase.from('driver_profiles').update(row).eq('id', existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('driver_profiles').insert({ ...row, user_id: user.id });
    if (error) throw new Error(error.message);
  }

  await supabase.auth.updateUser({
    data: {
      name: data.fullName.trim(),
      avatar_url: photoUrl ?? null,
      picture: null,
      full_name: null,
    },
  });
}
