import React, { useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../utils/supabase/client';

export type HaulerProfile = {
  userId: string;
  displayName?: string;
  onboardingComplete: boolean;
};

type HaulerContextType = {
  profile: HaulerProfile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
};

const HaulerContext = React.createContext<HaulerContextType>({
  profile: null,
  loading: true,
  refreshProfile: async () => {},
});

export function HaulerProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<HaulerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('driver_profiles')
        .select('user_id, display_name, onboarding_complete')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('hauler profile:', error);
      }

      if (data) {
        setProfile({
          userId: data.user_id,
          displayName: data.display_name ?? undefined,
          onboardingComplete: Boolean(data.onboarding_complete),
        });
      } else {
        setProfile({
          userId: user.id,
          onboardingComplete: false,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshProfile();
  }, [user?.id]);

  return (
    <HaulerContext.Provider value={{ profile, loading, refreshProfile }}>
      {children}
    </HaulerContext.Provider>
  );
}

export function useHauler() {
  return React.useContext(HaulerContext);
}
