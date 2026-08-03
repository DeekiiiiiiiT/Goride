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
