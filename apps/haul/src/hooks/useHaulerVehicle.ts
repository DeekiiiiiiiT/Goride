import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../utils/supabase/client';

export type HaulerVehicle = {
  id: string;
  make: string;
  model: string;
  year: number;
  licensePlate: string;
  registrationState?: string;
  bodyType?: string;
  vehiclePhotoUrl?: string;
  notes?: string;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  maxPayloadKg?: number;
};

function parseNotes(notes: string | null | undefined): Pick<HaulerVehicle, 'lengthCm' | 'widthCm' | 'heightCm' | 'maxPayloadKg'> {
  if (!notes) return {};
  const out: Pick<HaulerVehicle, 'lengthCm' | 'widthCm' | 'heightCm' | 'maxPayloadKg'> = {};
  const l = notes.match(/L:(\d+)cm/);
  const w = notes.match(/W:(\d+)cm/);
  const h = notes.match(/H:(\d+)cm/);
  const p = notes.match(/Payload:(\d+)kg/);
  if (l) out.lengthCm = Number(l[1]);
  if (w) out.widthCm = Number(w[1]);
  if (h) out.heightCm = Number(h[1]);
  if (p) out.maxPayloadKg = Number(p[1]);
  return out;
}

export function useHaulerVehicle() {
  const { user } = useAuth();
  const [vehicle, setVehicle] = useState<HaulerVehicle | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setVehicle(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: profile } = await supabase
        .from('driver_profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!profile?.id) {
        setVehicle(null);
        return;
      }

      const { data: row } = await supabase
        .from('driver_vehicles')
        .select(
          'id, make, model, year, license_plate, registration_state, body_type, vehicle_photo_url, notes',
        )
        .eq('driver_profile_id', profile.id)
        .eq('is_primary', true)
        .maybeSingle();

      if (!row) {
        setVehicle(null);
        return;
      }

      setVehicle({
        id: row.id,
        make: row.make,
        model: row.model,
        year: row.year,
        licensePlate: row.license_plate,
        registrationState: row.registration_state ?? undefined,
        bodyType: row.body_type ?? undefined,
        vehiclePhotoUrl: row.vehicle_photo_url ?? undefined,
        notes: row.notes ?? undefined,
        ...parseNotes(row.notes),
      });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { vehicle, loading, refresh };
}
