import React, { createContext, useContext, useState, useEffect } from 'react';
import { BusinessType } from '../../types/data';
import { DEFAULT_BUSINESS_TYPE, isValidBusinessType } from '../../utils/businessTypes';
import { api } from '../../services/api';
import { supabase } from '../../utils/supabase/client';
import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import { withProductLineHeaders } from '../../config/productLine';
import { useAuth } from './AuthContext';

export type ServiceLine = 'rideshare' | 'rush_delivery';

interface BusinessConfigContextType {
  businessType: BusinessType;
  serviceLines: ServiceLine[];
  primaryServiceLine: ServiceLine;
  setBusinessType: (type: BusinessType) => void;
  refreshConfig: () => Promise<void>;
  isLoading: boolean;
}

const BusinessConfigContext = createContext<BusinessConfigContextType>({
  businessType: DEFAULT_BUSINESS_TYPE,
  serviceLines: ['rideshare'],
  primaryServiceLine: 'rideshare',
  setBusinessType: () => {},
  refreshConfig: async () => {},
  isLoading: true,
});

function serviceLineToBusinessType(lines: ServiceLine[]): BusinessType {
  if (lines.includes('rush_delivery') && !lines.includes('rideshare')) return 'delivery';
  return 'rideshare';
}

function normalizeServiceLines(raw: unknown): ServiceLine[] {
  if (!Array.isArray(raw) || raw.length === 0) return ['rideshare'];
  const out = raw.filter((v): v is ServiceLine => v === 'rideshare' || v === 'rush_delivery');
  return out.length ? out : ['rideshare'];
}

export function BusinessConfigProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [businessType, setBusinessTypeState] = useState<BusinessType>(DEFAULT_BUSINESS_TYPE);
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>(['rideshare']);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  const refreshConfig = async () => {
    setReloadToken((t) => t + 1);
  };

  useEffect(() => {
    async function loadBusinessConfig() {
      setIsLoading(true);
      try {
        const prefs = await api.getPreferences();
        let orgLines: ServiceLine[] = normalizeServiceLines(prefs?.serviceLines);

        try {
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token;
          if (token) {
            const res = await fetch(`${API_ENDPOINTS.fleet}/enterprise/me/modules`, {
              headers: {
                ...withProductLineHeaders(),
                Authorization: `Bearer ${token}`,
                apikey: publicAnonKey,
              },
            });
            if (res.ok) {
              const data = await res.json();
              const lines = normalizeServiceLines(data.serviceLines);
              if (lines.length) orgLines = lines;
            }
          }
        } catch {
          /* fall back to prefs/meta */
        }

        setServiceLines(orgLines);
        const derived = serviceLineToBusinessType(orgLines);

        if (prefs?.businessType && isValidBusinessType(prefs.businessType)) {
          setBusinessTypeState(prefs.businessType);
        } else {
          setBusinessTypeState(derived);
        }
        localStorage.setItem('preference_business_type', derived);
      } catch (err) {
        console.log('BusinessConfigContext: Failed to load preferences, using fallbacks:', err);
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const metaLines = normalizeServiceLines(session?.user?.user_metadata?.serviceLines);
          if (metaLines.length) {
            setServiceLines(metaLines);
            const derived = serviceLineToBusinessType(metaLines);
            setBusinessTypeState(derived);
            localStorage.setItem('preference_business_type', derived);
            return;
          }
          const metaBt = session?.user?.user_metadata?.businessType;
          if (metaBt && isValidBusinessType(metaBt)) {
            setBusinessTypeState(metaBt);
            localStorage.setItem('preference_business_type', metaBt);
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

    void loadBusinessConfig();
  }, [reloadToken, user?.id]);

  const setBusinessType = (type: BusinessType) => {
    if (isValidBusinessType(type)) {
      setBusinessTypeState(type);
      localStorage.setItem('preference_business_type', type);
    }
  };

  const primaryServiceLine: ServiceLine = serviceLines.includes('rideshare')
    ? 'rideshare'
    : serviceLines[0] ?? 'rideshare';

  return (
    <BusinessConfigContext.Provider
      value={{ businessType, serviceLines, primaryServiceLine, setBusinessType, refreshConfig, isLoading }}
    >
      {children}
    </BusinessConfigContext.Provider>
  );
}

export function useBusinessConfig() {
  return useContext(BusinessConfigContext);
}
