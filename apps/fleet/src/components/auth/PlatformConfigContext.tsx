import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { API_ENDPOINTS } from '../../services/apiConfig';

interface PlatformConfig {
  defaultCurrency: string;
  fleetTimezone: string;
  formatCurrency: (amount: number) => string;
  formatDate: (date: string | Date) => string;
  formatDateTime: (date: string | Date) => string;
  isLoading: boolean;
}

const PlatformConfigContext = createContext<PlatformConfig>({
  defaultCurrency: 'JMD',
  fleetTimezone: 'America/Jamaica',
  formatCurrency: (amount) => `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  formatDate: (date) => new Date(date).toLocaleDateString(),
  formatDateTime: (date) => new Date(date).toLocaleString(),
  isLoading: true,
});

export function PlatformConfigProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrency] = useState('JMD');
  const [timezone, setTimezone] = useState('America/Jamaica');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_ENDPOINTS.admin}/platform-status`)
      .then(res => res.json())
      .then(data => {
        if (data.defaultCurrency) setCurrency(data.defaultCurrency);
        if (data.fleetTimezone) setTimezone(data.fleetTimezone);
      })
      .catch(err => console.log('PlatformConfigContext: Failed to load platform status:', err))
      .finally(() => setIsLoading(false));
  }, []);

  const formatCurrency = useCallback((amount: number): string => {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
  }, [currency]);

  const formatDate = useCallback((date: string | Date): string => {
    try {
      return new Date(date).toLocaleDateString(undefined, { timeZone: timezone });
    } catch {
      return new Date(date).toLocaleDateString();
    }
  }, [timezone]);

  const formatDateTime = useCallback((date: string | Date): string => {
    try {
      return new Date(date).toLocaleString(undefined, { timeZone: timezone });
    } catch {
      return new Date(date).toLocaleString();
    }
  }, [timezone]);

  return (
    <PlatformConfigContext.Provider value={{ defaultCurrency: currency, fleetTimezone: timezone, formatCurrency, formatDate, formatDateTime, isLoading }}>
      {children}
    </PlatformConfigContext.Provider>
  );
}

export function usePlatformConfig() {
  return useContext(PlatformConfigContext);
}
