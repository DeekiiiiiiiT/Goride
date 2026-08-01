import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { freightService } from '@/app/services/freightService';
import { useAuth } from '@/app/auth/AuthProvider';

export function useFreightOrgId() {
  return useAuth().organizationId;
}

export function useFreightDashboard() {
  const { organizationId, session } = useAuth();
  return useQuery({
    queryKey: ['freight', 'dashboard', organizationId],
    queryFn: () => freightService.dashboard(organizationId),
    enabled: Boolean(session),
  });
}

export function useFreightShipments(status?: string) {
  const { organizationId, session } = useAuth();
  return useQuery({
    queryKey: ['freight', 'shipments', organizationId, status],
    queryFn: () => freightService.listShipments(organizationId, status),
    enabled: Boolean(session),
  });
}

export function useFreightShipment(id: string | undefined) {
  const { organizationId, session } = useAuth();
  return useQuery({
    queryKey: ['freight', 'shipment', organizationId, id],
    queryFn: () => freightService.getShipment(id!, organizationId),
    enabled: Boolean(session && id),
  });
}

export function useFreightCarriers(own?: boolean) {
  const { organizationId, session } = useAuth();
  return useQuery({
    queryKey: ['freight', 'carriers', organizationId, own],
    queryFn: () => freightService.listCarriers(organizationId, own),
    enabled: Boolean(session),
  });
}

export function useFreightClients() {
  const { organizationId, session } = useAuth();
  return useQuery({
    queryKey: ['freight', 'clients', organizationId],
    queryFn: () => freightService.listClients(organizationId),
    enabled: Boolean(session),
  });
}

export function useFreightRateCards() {
  const { organizationId, session } = useAuth();
  return useQuery({
    queryKey: ['freight', 'rate-cards', organizationId],
    queryFn: () => freightService.listRateCards(organizationId),
    enabled: Boolean(session),
  });
}

export function useCreateShipment() {
  const organizationId = useFreightOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => freightService.createShipment(body, organizationId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['freight', 'shipments'] });
      void qc.invalidateQueries({ queryKey: ['freight', 'dashboard'] });
    },
  });
}

export function useTransitionShipment() {
  const organizationId = useFreightOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; status: string; note?: string }) =>
      freightService.transitionShipment(args.id, args.status, args.note, organizationId),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['freight', 'shipment', organizationId, vars.id] });
      void qc.invalidateQueries({ queryKey: ['freight', 'shipments'] });
      void qc.invalidateQueries({ queryKey: ['freight', 'dashboard'] });
    },
  });
}

export function useBillShipment() {
  const organizationId = useFreightOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => freightService.billShipment(id, organizationId),
    onSuccess: (_d, id) => {
      void qc.invalidateQueries({ queryKey: ['freight', 'shipment', organizationId, id] });
      void qc.invalidateQueries({ queryKey: ['freight', 'shipments'] });
    },
  });
}

export function useCreateCarrier() {
  const organizationId = useFreightOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => freightService.createCarrier(body, organizationId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['freight', 'carriers'] }),
  });
}

export function useCreateClient() {
  const organizationId = useFreightOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => freightService.createClient(body, organizationId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['freight', 'clients'] }),
  });
}

export function useCreateRateCard() {
  const organizationId = useFreightOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => freightService.createRateCard(body, organizationId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['freight', 'rate-cards'] }),
  });
}
