import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { useFleetTimezone } from '../../utils/timezoneDisplay';
import { fetchBusinessFinanceBundle } from './fetchBusinessFinanceBundle';
import { resolvePeriod } from './periodRange';
import type { PeriodPreset } from './types';

export function useBusinessFinanceBundle(
  preset: PeriodPreset,
  customStart?: string,
  customEnd?: string,
) {
  const { organizationId } = useAuth();
  const fleetTz = useFleetTimezone();
  const period = React.useMemo(
    () => resolvePeriod(preset, customStart, customEnd),
    [preset, customStart, customEnd],
  );

  const query = useQuery({
    queryKey: [
      'business-finance-bundle',
      period.startYmd,
      period.endYmd,
      organizationId || null,
      fleetTz,
    ],
    queryFn: () =>
      fetchBusinessFinanceBundle(period, {
        organizationId,
        fleetTimezone: fleetTz,
      }),
    staleTime: 60_000,
  });

  return { period, ...query };
}
