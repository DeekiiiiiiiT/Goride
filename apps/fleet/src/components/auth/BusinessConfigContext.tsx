import React, { createContext, useContext, useState, useEffect } from 'react';
import { BusinessType } from '../../types/data';
import { DEFAULT_BUSINESS_TYPE, isValidBusinessType } from '../../utils/businessTypes';
import { api } from '../../services/api';
import { supabase } from '../../utils/supabase/client';

interface BusinessConfigContextType {
  businessType: BusinessType;
  setBusinessType: (type: BusinessType) => void;
  isLoading: boolean;
}

const BusinessConfigContext = createContext<BusinessConfigContextType>({
  businessType: DEFAULT_BUSINESS_TYPE,
  setBusinessType: () => {},
  isLoading: true,
});

export function BusinessConfigProvider({ children }: { children: React.ReactNode }) {
  const [businessType, setBusinessTypeState] = useState<BusinessType>(DEFAULT_BUSINESS_TYPE);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadBusinessType() {
      try {
        // Priority 1: KV preferences (admin explicitly set via Settings)
        const prefs = await api.getPreferences();
        if (prefs?.businessType && isValidBusinessType(prefs.businessType)) {
          setBusinessTypeState(prefs.businessType);
          localStorage.setItem('preference_business_type', prefs.businessType);
        } else {
          // Priority 2: user_metadata.businessType (set during signup)
          try {
            const { data: { session } } = await supabase.auth.getSession();
            const metaBt = session?.user?.user_metadata?.businessType;
            if (metaBt && isValidBusinessType(metaBt)) {
              setBusinessTypeState(metaBt);
              localStorage.setItem('preference_business_type', metaBt);
              // Found in scope — skip further fallbacks
              setIsLoading(false);
              return;
            }
          } catch (sessionErr) {
            console.log('BusinessConfigContext: Could not read session metadata:', sessionErr);
          }

          // Priority 3: localStorage fallback
          const local = localStorage.getItem('preference_business_type');
          if (local && isValidBusinessType(local)) {
            setBusinessTypeState(local);
          }
        }
      } catch (err) {
        console.log('BusinessConfigContext: Failed to load preferences, using default:', err);
        // Fallback chain: session metadata -> localStorage -> default
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const metaBt = session?.user?.user_metadata?.businessType;
          if (metaBt && isValidBusinessType(metaBt)) {
            setBusinessTypeState(metaBt);
            localStorage.setItem('preference_business_type', metaBt);
            setIsLoading(false);
            return;
          }
        } catch (_) { /* ignore */ }

        const local = localStorage.getItem('preference_business_type');
        if (local && isValidBusinessType(local)) {
          setBusinessTypeState(local);
        }
      } finally {
        setIsLoading(false);
      }
    }

    loadBusinessType();
  }, []);

  const setBusinessType = (type: BusinessType) => {
    if (isValidBusinessType(type)) {
      setBusinessTypeState(type);
      localStorage.setItem('preference_business_type', type);
    }
  };

  return (
    <BusinessConfigContext.Provider value={{ businessType, setBusinessType, isLoading }}>
      {children}
    </BusinessConfigContext.Provider>
  );
}

export function useBusinessConfig() {
  return useContext(BusinessConfigContext);
}