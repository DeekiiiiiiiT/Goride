import { useState, useEffect } from 'react';
import { WeeklyCheckIn } from '../types/check-in';
import { projectId, publicAnonKey } from '../utils/supabase/info';
import { supabase } from '../utils/supabase/client';
import { api } from '../services/api';

const CHECK_IN_POST_MS = 45_000;
const STATUS_REFRESH_MS = 15_000;

export type VehicleCustodyStatus = 'none' | 'assigned' | 'handed_over' | 'in_custody';

async function fetchWithDeadline(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  ms: number,
  timeoutMessage: string,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error(timeoutMessage);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function useWeeklyCheckIn(driverId: string | undefined) {
  const [needsCheckIn, setNeedsCheckIn] = useState(false);
  const [eligible, setEligible] = useState(false);
  const [custodyStatus, setCustodyStatus] = useState<VehicleCustodyStatus>('none');
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [vehicleLabel, setVehicleLabel] = useState<string | null>(null);
  const [lastCheckIn, setLastCheckIn] = useState<WeeklyCheckIn | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const getWeekStart = () => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday.toISOString().split('T')[0];
  };

  const checkStatus = async () => {
    if (!driverId) {
      setIsLoading(false);
      setNeedsCheckIn(false);
      setEligible(false);
      return;
    }
    setIsLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const authToken = session?.access_token ?? publicAnonKey;

      const response = await fetchWithDeadline(
        `https://${projectId}.supabase.co/functions/v1/fleet-core/check-ins/eligibility?driverId=${encodeURIComponent(driverId)}`,
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        },
        STATUS_REFRESH_MS,
        'Could not verify vehicle handover status. Please try again.',
      );
      if (!response.ok) {
        console.error('Vehicle handover eligibility request failed', response.status);
        setNeedsCheckIn(false);
        setEligible(false);
        return;
      }
      const data = await response.json();
      setNeedsCheckIn(Boolean(data.needsCheckIn));
      setEligible(Boolean(data.eligible));
      setCustodyStatus((data.custodyStatus as VehicleCustodyStatus) || 'none');
      setVehicleId(data.vehicleId ?? null);
      setVehicleLabel(data.vehicleLabel ?? null);

      // Keep lastCheckIn hydrated when handover already done
      if (!data.needsCheckIn && data.reason === 'handover_complete') {
        setLastCheckIn((prev) => prev);
      }
    } catch (e) {
      console.error('Error checking handover status:', e);
      setNeedsCheckIn(false);
      setEligible(false);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void checkStatus();
  }, [driverId]);

  const submitCheckIn = async (
    odometer: number,
    photo: File | null,
    vehicleIdArg: string,
    method: 'ai_verified' | 'manual_override' = 'manual_override',
    reviewStatus: 'auto_approved' | 'pending_review' | 'approved' | 'rejected' = 'pending_review',
    aiReading: number | null = null,
    manualReadingReason?: string,
  ) => {
    if (!driverId) {
      throw new Error('Not signed in — reopen the app and try again');
    }

    let photoUrl = '';
    if (photo) {
      const uploadData = await api.uploadFile(photo);
      if (!uploadData?.url) {
        throw new Error('Photo upload failed. Please try again with a clearer photo.');
      }
      photoUrl = uploadData.url;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const authToken = session?.access_token ?? publicAnonKey;
    const weekStart = getWeekStart();

    const payload: WeeklyCheckIn = {
      id: crypto.randomUUID(),
      driverId,
      vehicleId: vehicleIdArg,
      timestamp: new Date().toISOString(),
      odometer,
      photoUrl,
      verified: reviewStatus === 'auto_approved' || reviewStatus === 'approved',
      weekStart,
      method,
      reviewStatus,
      aiReading,
      manualReadingReason,
      source: 'Vehicle Handover',
      isVerified: reviewStatus === 'auto_approved' || reviewStatus === 'approved',
    } as any;

    const res = await fetchWithDeadline(
      `https://${projectId}.supabase.co/functions/v1/fleet-core/check-ins`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
      CHECK_IN_POST_MS,
      'Vehicle handover timed out. Please try again.',
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to save vehicle handover');
    }

    setNeedsCheckIn(false);
    setLastCheckIn(payload);
    void checkStatus();
  };

  return {
    needsCheckIn,
    eligible,
    custodyStatus,
    vehicleId,
    vehicleLabel,
    lastCheckIn,
    isLoading,
    submitCheckIn,
    refresh: checkStatus,
  };
}
