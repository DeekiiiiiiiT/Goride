import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../utils/supabase/client';

export type DriverMode = 'fleet' | 'independent';

export interface DriverProfile {
  id: string;
  userId: string;
  mode: DriverMode;
  fleetId?: string;
  fleetName?: string;
  fleetJoinedAt?: string;
  vehicleOwnership?: 'owned' | 'rented' | 'financed' | 'leased';
  insuranceProvider?: string;
  businessLicenseNumber?: string;
  status: 'active' | 'pending' | 'suspended' | 'deactivated';
  onboardingComplete: boolean;
  /** Google extended signup progress (`g_phone`, `g_archetype`) or null when complete / legacy. */
  onboardingStep?: string | null;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  gender?: 'male' | 'female' | 'other' | null;
  phone?: string;
  profilePhotoUrl?: string;
}

export interface FleetInfo {
  id: string;
  name: string;
  logoUrl?: string;
}

export interface DriverPermissions {
  canAccessEquipment: boolean;
  canAccessFuelCard: boolean;
  canAccessReimbursements: boolean;
  canAccessWeeklyCheckin: boolean;
  canAccessTaxCenter: boolean;
  canAccessInsurance: boolean;
  canAccessVehicleManagement: boolean;
}

interface DriverContextType {
  profile: DriverProfile | null;
  mode: DriverMode;
  isFleetDriver: boolean;
  isIndependentDriver: boolean;
  fleet: FleetInfo | null;
  permissions: DriverPermissions;
  loading: boolean;
  refreshProfile: () => Promise<void>;
}

const defaultPermissions: DriverPermissions = {
  canAccessEquipment: false,
  canAccessFuelCard: false,
  canAccessReimbursements: false,
  canAccessWeeklyCheckin: false,
  canAccessTaxCenter: false,
  canAccessInsurance: false,
  canAccessVehicleManagement: false,
};

const DriverContext = createContext<DriverContextType>({
  profile: null,
  mode: 'independent',
  isFleetDriver: false,
  isIndependentDriver: true,
  fleet: null,
  permissions: defaultPermissions,
  loading: true,
  refreshProfile: async () => {},
});

export const DriverProvider = ({ children }: { children: React.ReactNode }) => {
  const { user, isDriver } = useAuth();
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [fleet, setFleet] = useState<FleetInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async () => {
    if (!user || !isDriver) {
      setProfile(null);
      setFleet(null);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('driver_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching driver profile:', error);
      }

      if (data) {
        setProfile({
          id: data.id,
          userId: data.user_id,
          mode: data.mode as DriverMode,
          fleetId: data.fleet_id,
          fleetJoinedAt: data.fleet_joined_at,
          vehicleOwnership: data.vehicle_ownership,
          insuranceProvider: data.insurance_provider,
          businessLicenseNumber: data.business_license_number,
          status: data.status,
          onboardingComplete: data.onboarding_complete,
          onboardingStep: data.onboarding_step ?? null,
          displayName: data.display_name,
          firstName: data.first_name ?? undefined,
          lastName: data.last_name ?? undefined,
          dateOfBirth: data.date_of_birth ?? undefined,
          gender: (data.gender as DriverProfile['gender']) ?? undefined,
          phone: data.phone,
          profilePhotoUrl: data.profile_photo_url,
        });

        if (data.fleet_id) {
          const { data: fleetData } = await supabase
            .from('organizations')
            .select('id, name')
            .eq('id', data.fleet_id)
            .single();
          
          if (fleetData) {
            setFleet({
              id: fleetData.id,
              name: fleetData.name,
            });
          } else {
            setFleet(null);
          }
        } else {
          setFleet(null);
        }
      } else {
        setProfile(null);
      }
    } catch (error) {
      console.error('Error in fetchProfile:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [user, isDriver]);

  const mode: DriverMode = profile?.mode || 'independent';
  const isFleetDriver = mode === 'fleet';
  const isIndependentDriver = mode === 'independent';

  const permissions: DriverPermissions = {
    canAccessEquipment: isFleetDriver,
    canAccessFuelCard: isFleetDriver,
    canAccessReimbursements: isFleetDriver,
    canAccessWeeklyCheckin: isFleetDriver,
    canAccessTaxCenter: isIndependentDriver,
    canAccessInsurance: isIndependentDriver,
    canAccessVehicleManagement: isIndependentDriver,
  };

  return (
    <DriverContext.Provider
      value={{
        profile,
        mode,
        isFleetDriver,
        isIndependentDriver,
        fleet,
        permissions,
        loading,
        refreshProfile: fetchProfile,
      }}
    >
      {children}
    </DriverContext.Provider>
  );
};

export const useDriver = () => useContext(DriverContext);
