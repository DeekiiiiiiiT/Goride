import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '@roam/api-client';
import { supabase } from '@/lib/supabase';
import { loadSignupDraft } from '@/lib/signupDraft';

export type CourierVehicleRow = {
  id: string;
  user_id: string;
  make: string;
  model: string;
  year: number | null;
  color: string | null;
  license_plate: string;
  vehicle_type: string | null;
  is_primary: boolean;
};

async function getDeliveryClient() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  return {
    session,
    delivery: createClient(`https://${projectId}.supabase.co`, publicAnonKey, {
      db: { schema: 'delivery' },
      global: { headers: { Authorization: `Bearer ${session.access_token}` } },
    }),
  };
}

function splitMakeModel(makeModel: string): { make: string; model: string } {
  const trimmed = makeModel.trim();
  if (!trimmed) return { make: 'Unknown', model: 'Unknown' };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { make: parts[0], model: parts[0] };
  return { make: parts[0], model: parts.slice(1).join(' ') };
}

export async function loadPrimaryVehicle(): Promise<CourierVehicleRow | null> {
  const client = await getDeliveryClient();
  if (!client) return null;
  const { data, error } = await client.delivery
    .from('courier_vehicles')
    .select('id, user_id, make, model, year, color, license_plate, vehicle_type, is_primary')
    .eq('user_id', client.session.user.id)
    .order('is_primary', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as CourierVehicleRow;
}

export async function upsertCourierVehicle(input: {
  makeModel: string;
  licensePlate: string;
  color: string;
  vehicleType: string;
  year?: number | null;
}): Promise<{ ok: true; vehicle: CourierVehicleRow } | { ok: false; error: string }> {
  const client = await getDeliveryClient();
  if (!client) return { ok: false, error: 'Not signed in' };

  const plate = input.licensePlate.trim().toUpperCase();
  if (!plate) return { ok: false, error: 'License plate required' };

  const { make, model } = splitMakeModel(input.makeModel);
  const payload = {
    user_id: client.session.user.id,
    make,
    model,
    year: input.year ?? null,
    color: input.color || null,
    license_plate: plate,
    vehicle_type: input.vehicleType,
    is_primary: true,
    status: 'active',
    updated_at: new Date().toISOString(),
  };

  const existing = await loadPrimaryVehicle();
  if (existing) {
    const { data, error } = await client.delivery
      .from('courier_vehicles')
      .update(payload)
      .eq('id', existing.id)
      .select('id, user_id, make, model, year, color, license_plate, vehicle_type, is_primary')
      .single();
    if (error || !data) return { ok: false, error: error?.message || 'Update failed' };
    return { ok: true, vehicle: data as CourierVehicleRow };
  }

  const { data, error } = await client.delivery
    .from('courier_vehicles')
    .insert(payload)
    .select('id, user_id, make, model, year, color, license_plate, vehicle_type, is_primary')
    .single();
  if (error || !data) return { ok: false, error: error?.message || 'Insert failed' };
  return { ok: true, vehicle: data as CourierVehicleRow };
}

/** Persist vehicle fields from signup draft after profile exists. */
export async function syncVehicleFromSignupDraft(): Promise<boolean> {
  const draft = loadSignupDraft();
  if (!draft.licensePlate && draft.vehicleType === 'bicycle') {
    const result = await upsertCourierVehicle({
      makeModel: draft.makeModel || 'Bicycle',
      licensePlate: draft.licensePlate || 'N/A',
      color: draft.color || 'N/A',
      vehicleType: draft.vehicleType,
    });
    return result.ok;
  }
  if (!draft.makeModel || !draft.licensePlate) return false;
  const result = await upsertCourierVehicle({
    makeModel: draft.makeModel,
    licensePlate: draft.licensePlate,
    color: draft.color || '',
    vehicleType: draft.vehicleType,
  });
  return result.ok;
}
