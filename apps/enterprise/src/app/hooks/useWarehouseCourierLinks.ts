import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/auth/AuthProvider';
import { freightService } from '@/app/services/freightService';

export function useWarehouseCourierLinks() {
  const { organizationId } = useAuth();
  return useQuery({
    queryKey: ['warehouse-courier-links', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => freightService.listWarehouseCourierLinks(organizationId),
  });
}

export function useEnsureInHouseWarehouse() {
  const { organizationId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => freightService.ensureInHouseWarehouseLink(organizationId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['warehouse-courier-links'] });
    },
  });
}

export function useInvitePartnerLink() {
  const { organizationId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { counterpartyOrgId: string; roleAs: 'warehouse' | 'courier' }) =>
      freightService.inviteWarehouseCourierLink(body, organizationId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['warehouse-courier-links'] });
    },
  });
}

export function useSetPartnerLinkStatus() {
  const { organizationId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: string;
      status: 'active' | 'paused' | 'revoked' | 'invited';
    }) => freightService.setWarehouseCourierLinkStatus(input.id, input.status, organizationId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['warehouse-courier-links'] });
    },
  });
}
