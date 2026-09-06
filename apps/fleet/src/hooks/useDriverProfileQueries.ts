/**
 * Profile tab: compliance docs, notes, audit trail — React Query.
 */
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../services/api';

export function driverComplianceQueryKey(driverId: string) {
  return ['driverCompliance', driverId] as const;
}
export function driverNotesQueryKey(driverId: string) {
  return ['driverNotes', driverId] as const;
}
export function driverAuditQueryKey(driverId: string) {
  return ['driverAudit', driverId] as const;
}

export function useDriverCompliance(driverId: string, _fallbackDocs: unknown[] = []) {
  const query = useQuery({
    queryKey: driverComplianceQueryKey(driverId),
    queryFn: async () => {
      const res = await api.getDriverCompliance(driverId);
      return {
        licenseExpiry: res?.licenseExpiry ? String(res.licenseExpiry).slice(0, 10) : null,
        documents: Array.isArray(res?.documents) ? res.documents : [],
      };
    },
    enabled: Boolean(driverId),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!query.isError) return;
    toast.error("Couldn't load compliance from server — showing local documents.");
  }, [query.isError]);

  return query;
}

export function useDriverNotes(driverId: string) {
  const query = useQuery({
    queryKey: driverNotesQueryKey(driverId),
    queryFn: async () => {
      const res = await api.getDriverNotes(driverId);
      return Array.isArray(res?.notes) ? res.notes : [];
    },
    enabled: Boolean(driverId),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!query.isError) return;
    toast.error("Couldn't load driver notes.");
  }, [query.isError]);

  return query;
}

export function useDriverAudit(driverId: string) {
  const query = useQuery({
    queryKey: driverAuditQueryKey(driverId),
    queryFn: async () => {
      const res = await api.getDriverAudit(driverId);
      return Array.isArray(res?.data) ? res.data : Array.isArray(res?.events) ? res.events : [];
    },
    enabled: Boolean(driverId),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!query.isError) return;
    toast.error("Couldn't load audit trail.");
  }, [query.isError]);

  return query;
}

export function useInvalidateDriverProfileQueries() {
  const qc = useQueryClient();
  return {
    invalidateCompliance: (driverId: string) =>
      qc.invalidateQueries({ queryKey: driverComplianceQueryKey(driverId) }),
    invalidateNotes: (driverId: string) =>
      qc.invalidateQueries({ queryKey: driverNotesQueryKey(driverId) }),
    invalidateAudit: (driverId: string) =>
      qc.invalidateQueries({ queryKey: driverAuditQueryKey(driverId) }),
  };
}
