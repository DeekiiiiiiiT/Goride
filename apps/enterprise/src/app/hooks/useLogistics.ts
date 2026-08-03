import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { logisticsService } from '@/app/services/logisticsService';
import { useAuth } from '@/app/auth/AuthProvider';

export function useLogisticsJobs(status?: string) {
  const { organizationId, session } = useAuth();
  return useQuery({
    queryKey: ['logistics', 'jobs', organizationId, status ?? 'all'],
    queryFn: () => logisticsService.listJobs(organizationId, status),
    enabled: Boolean(session),
    refetchInterval: 30_000,
  });
}

export function useLogisticsJob(id: string | undefined) {
  const { organizationId, session } = useAuth();
  return useQuery({
    queryKey: ['logistics', 'job', organizationId, id],
    queryFn: () => logisticsService.getJob(id!, organizationId),
    enabled: Boolean(session && id),
  });
}

export function useAssignLogisticsJob() {
  const { organizationId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      id: string;
      assigneeType: 'org_fleet' | 'client_fleet' | 'third_party' | 'roam_marketplace';
      assigneeDriverId?: string | null;
      assigneeVehicleId?: string | null;
      clientFleetAssetId?: string | null;
      thirdPartyCarrierId?: string | null;
      note?: string;
    }) =>
      logisticsService.assignJob(
        args.id,
        {
          assigneeType: args.assigneeType,
          assigneeDriverId: args.assigneeDriverId,
          assigneeVehicleId: args.assigneeVehicleId,
          clientFleetAssetId: args.clientFleetAssetId,
          thirdPartyCarrierId: args.thirdPartyCarrierId,
          note: args.note,
        },
        organizationId,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['logistics', 'jobs'] });
      void qc.invalidateQueries({ queryKey: ['logistics', 'job'] });
    },
  });
}

export function useTransitionLogisticsJob() {
  const { organizationId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; status: string; note?: string }) =>
      logisticsService.transitionJob(args.id, args.status, args.note, organizationId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['logistics', 'jobs'] });
      void qc.invalidateQueries({ queryKey: ['logistics', 'job'] });
    },
  });
}

export function useLogisticsJobLive(id: string | undefined, enabled = true) {
  const { organizationId, session } = useAuth();
  return useQuery({
    queryKey: ['logistics', 'job-live', organizationId, id],
    queryFn: () => logisticsService.getJobLive(id!, organizationId),
    enabled: Boolean(session && id && enabled),
    refetchInterval: 12_000,
  });
}

export function useServiceZones(kind?: string) {
  const { organizationId, session } = useAuth();
  return useQuery({
    queryKey: ['logistics', 'zones', organizationId, kind ?? 'all'],
    queryFn: () => logisticsService.listZones(organizationId, kind),
    enabled: Boolean(session),
  });
}

export function useCreateServiceZone() {
  const { organizationId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      kind: 'service' | 'pricing';
      geojson: Record<string, unknown>;
      active?: boolean;
    }) => logisticsService.createZone(body, organizationId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['logistics', 'zones'] }),
  });
}

export function useDeleteServiceZone() {
  const { organizationId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => logisticsService.deleteZone(id, organizationId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['logistics', 'zones'] }),
  });
}

export function useOpsAlerts(enabled = true) {
  const { organizationId, session } = useAuth();
  return useQuery({
    queryKey: ['logistics', 'alerts', organizationId],
    queryFn: () => logisticsService.listAlerts(organizationId),
    enabled: Boolean(session && enabled),
    refetchInterval: 20_000,
  });
}

export function useMarkAlertRead() {
  const { organizationId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => logisticsService.markAlertRead(id, organizationId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['logistics', 'alerts'] }),
  });
}

export function useMarkAllAlertsRead() {
  const { organizationId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => logisticsService.markAllAlertsRead(organizationId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['logistics', 'alerts'] }),
  });
}
