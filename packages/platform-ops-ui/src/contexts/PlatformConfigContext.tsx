import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { API_ENDPOINTS, withProductLineHeaders } from '@roam/api-client';

interface PlatformConfig {
  defaultCurrency: string;
  fleetTimezone: string;
  formatCurrency: (amount: number) => string;
  formatDate: (date: string | Date) => string;
  formatDateTime: (date: string | Date) => string;
  isLoading: boolean;
}

const defaultFormatCurrency = (amount: number) =>
  `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PlatformConfigContext = createContext<PlatformConfig>({
  defaultCurrency: 'JMD',
  fleetTimezone: 'America/Jamaica',
  formatCurrency: defaultFormatCurrency,
  formatDate: (date) => new Date(date).toLocaleDateString(),
  formatDateTime: (date) => new Date(date).toLocaleString(),
  isLoading: true,
});

export function PlatformConfigProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrency] = useState('JMD');
  const [timezone, setTimezone] = useState('America/Jamaica');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_ENDPOINTS.admin}/platform-status`, { headers: withProductLineHeaders() })
      .then((res) => res.json())
      .then((data) => {
        if (data.defaultCurrency) setCurrency(data.defaultCurrency);
        if (data.fleetTimezone) setTimezone(data.fleetTimezone);
      })
      .catch((err) =>
        console.log('platform-ops PlatformConfigContext: Failed to load platform status:', err),
      )
      .finally(() => setIsLoading(false));
  }, []);

  const formatCurrency = useCallback(
    (amount: number): string => {
      try {
        return new Intl.NumberFormat(undefined, {
          style: 'currency',
          currency,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(amount);
      } catch {
        return defaultFormatCurrency(amount);
      }
    },
    [currency],
  );

  const formatDate = useCallback(
    (date: string | Date): string => {
      try {
        return new Date(date).toLocaleDateString(undefined, { timeZone: timezone });
      } catch {
        return new Date(date).toLocaleDateString();
      }
    },
    [timezone],
  );

  const formatDateTime = useCallback(
    (date: string | Date): string => {
      try {
        return new Date(date).toLocaleString(undefined, { timeZone: timezone });
      } catch {
        return new Date(date).toLocaleString();
      }
    },
    [timezone],
  );

  return (
    <PlatformConfigContext.Provider
      value={{
        defaultCurrency: currency,
        fleetTimezone: timezone,
        formatCurrency,
        formatDate,
        formatDateTime,
        isLoading,
      }}
    >
      {children}
    </PlatformConfigContext.Provider>
  );
}

export function usePlatformConfig() {
  return useContext(PlatformConfigContext);
}
