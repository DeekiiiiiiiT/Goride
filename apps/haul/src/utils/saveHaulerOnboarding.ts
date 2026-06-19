import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase/client';
import type { ProfileSetupData } from '../components/auth/onboarding/HaulProfileSetupScreen';
import type { VehicleSetupData } from '../components/auth/onboarding/HaulVehicleSetupScreen';

function splitMakeModel(makeModel: string): { make: string; model: string } {
  const parts = makeModel.trim().split(/\s+/);
  if (parts.length === 0) return { make: 'Unknown', model: 'Vehicle' };
  if (parts.length === 1) return { make: parts[0], model: 'Vehicle' };
  return { make: parts[0], model: parts.slice(1).join(' ') };
}

function resolveYear(year: string): number {
  if (year === 'older') return 2019;
  const n = Number(year);
  return Number.isFinite(n) ? n : 2020;
}

export async function saveHaulerOnboarding(
  user: User,
  profile: ProfileSetupData,
  vehicle: VehicleSetupData,
): Promise<void> {
  let photoUrl: string | null = null;

  if (profile.photoFile) {
    const ext = profile.photoFile.name.split('.').pop() || 'jpg';
    const path = `${user.id}/avatar.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from('driver-photos')
      .upload(path, profile.photoFile, { upsert: true });
    if (!uploadErr) {
      const { data: urlData } = supabase.storage.from('driver-photos').getPublicUrl(path);
      photoUrl = urlData.publicUrl;
    }
  }

  const displayName = profile.displayName || profile.fullName;
  const { make, model } = splitMakeModel(vehicle.makeModel);
  const cargoNote = [
    vehicle.lengthCm && `L:${vehicle.lengthCm}cm`,
    vehicle.widthCm && `W:${vehicle.widthCm}cm`,
    vehicle.heightCm && `H:${vehicle.heightCm}cm`,
    vehicle.maxPayloadKg && `Payload:${vehicle.maxPayloadKg}kg`,
  ]
    .filter(Boolean)
    .join(' ');

  const { data: existing } = await supabase
    .from('driver_profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  const profileRow = {
    display_name: displayName,
    phone: profile.phone,
    profile_photo_url: photoUrl,
    onboarding_complete: false,
    onboarding_step: 'documents',
    mode: 'independent' as const,
    status: 'pending' as const,
  };

  let profileId = existing?.id as string | undefined;

  if (profileId) {
    const { error } = await supabase.from('driver_profiles').update(profileRow).eq('id', profileId);
    if (error) throw new Error(error.message);
  } else {
    const { data: inserted, error } = await supabase
      .from('driver_profiles')
      .insert({ ...profileRow, user_id: user.id })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    profileId = inserted.id;
  }

  await supabase.auth.updateUser({
    data: {
      surface: 'hauler',
      name: profile.fullName,
      avatar_url: photoUrl ?? undefined,
    },
  });

  const vehicleRow = {
    driver_profile_id: profileId,
    make,
    model,
    year: resolveYear(vehicle.year),
    license_plate: vehicle.licensePlate,
    registration_state: vehicle.plateRegion,
    body_type: vehicle.vehicleType,
    ownership_type: 'owned' as const,
    is_primary: true,
    status: 'active' as const,
    notes: cargoNote || null,
  };

  const { data: existingVehicle } = await supabase
    .from('driver_vehicles')
    .select('id')
    .eq('driver_profile_id', profileId)
    .eq('is_primary', true)
    .maybeSingle();

  if (existingVehicle?.id) {
    const { error: vehicleErr } = await supabase
      .from('driver_vehicles')
      .update(vehicleRow)
      .eq('id', existingVehicle.id);
    if (vehicleErr) throw new Error(vehicleErr.message);
  } else {
    const { error: insertErr } = await supabase.from('driver_vehicles').insert(vehicleRow);
    if (insertErr) throw new Error(insertErr.message);
  }
}
