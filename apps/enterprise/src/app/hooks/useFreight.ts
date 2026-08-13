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

export function usePipelineDashboard() {
  const { organizationId, session } = useAuth();
  return useQuery({
    queryKey: ['freight', 'pipeline-dashboard', organizationId],
    queryFn: () => freightService.pipelineDashboard(organizationId),
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
      void qc.invalidateQueries({ queryKey: ['logistics', 'jobs'] });
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
      void qc.invalidateQueries({ queryKey: ['logistics', 'jobs'] });
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

export function useUpdateRateCard() {
  const { organizationId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; body: unknown }) =>
      freightService.updateRateCard(args.id, args.body, organizationId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['freight', 'rate-cards'] }),
  });
}

// --- Pipeline hooks ---

export function useFacilities(type?: string) {
  const { organizationId, session } = useAuth();
  return useQuery({
    queryKey: ['freight', 'facilities', organizationId, type],
    queryFn: () => freightService.listFacilities(organizationId, type),
    enabled: Boolean(session),
  });
}

export function useIntakeWarehouses(purpose: 'join' | 'connect' = 'join') {
  const { organizationId, session } = useAuth();
  return useQuery({
    queryKey: ['freight', 'intake-warehouses', organizationId, purpose],
    queryFn: () => freightService.listIntakeWarehouses(organizationId, purpose),
    enabled: Boolean(session),
  });
}

export function useIntakeClaims() {
  const { organizationId, session } = useAuth();
  return useQuery({
    queryKey: ['freight', 'intake-claims', organizationId],
    queryFn: () => freightService.listIntakeClaims(organizationId),
    enabled: Boolean(session),
  });
}

export function useSubmitIntakeClaim() {
  const organizationId = useFreightOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => freightService.submitIntakeClaim(body, organizationId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['freight', 'intake-claims'] }),
  });
}

export function useCreateFacility() {
  const organizationId = useFreightOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => freightService.createFacility(body, organizationId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['freight', 'facilities'] });
      void qc.invalidateQueries({ queryKey: ['freight', 'intake-warehouses'] });
    },
  });
}

export function useUpdateFacility() {
  const organizationId = useFreightOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) =>
      freightService.updateFacility(id, body, organizationId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['freight', 'facilities'] });
      void qc.invalidateQueries({ queryKey: ['freight', 'intake-warehouses'] });
    },
  });
}

export function useDeleteFacility() {
  const organizationId = useFreightOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => freightService.deleteFacility(id, organizationId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['freight', 'facilities'] });
      void qc.invalidateQueries({ queryKey: ['freight', 'intake-warehouses'] });
    },
  });
}

export function useSuites() {
  const { organizationId, session } = useAuth();
  return useQuery({
    queryKey: ['freight', 'suites', organizationId],
    queryFn: () => freightService.listSuites(organizationId),
    enabled: Boolean(session),
  });
}

export function useCreateSuite() {
  const organizationId = useFreightOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => freightService.createSuite(body, organizationId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['freight', 'suites'] }),
  });
}

export function useUpdateSuite() {
  const organizationId = useFreightOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) =>
      freightService.updateSuite(id, body, organizationId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['freight', 'suites'] }),
  });
}

export function useImportSuites() {
  const organizationId = useFreightOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      rows: Array<{
        suiteCode: string;
        contactName?: string | null;
        contactPhone?: string | null;
        contactEmail?: string | null;
        trn?: string | null;
        clientName?: string | null;
        pickupBranch?: string | null;
        defaultFulfillmentMode?: string;
        defaultAssigneeType?: string;
        deliveryAddress?: string | null;
      }>,
    ) => freightService.importSuites(rows, organizationId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['freight', 'suites'] }),
  });
}

export function usePackages(status?: string) {
  const { organizationId, session } = useAuth();
  return useQuery({
    queryKey: ['freight', 'packages', organizationId, status],
    queryFn: () => freightService.listPackages(organizationId, status),
    enabled: Boolean(session),
  });
}

export function usePackage(id: string | undefined) {
  const { organizationId, session } = useAuth();
  return useQuery({
    queryKey: ['freight', 'package', organizationId, id],
    queryFn: () => freightService.getPackage(id!, organizationId),
    enabled: Boolean(session && id),
  });
}

export function useCreatePackage() {
  const organizationId = useFreightOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => freightService.createPackage(body, organizationId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['freight', 'packages'] });
      void qc.invalidateQueries({ queryKey: ['freight', 'pipeline-dashboard'] });
    },
  });
}

export function useDeletePackage() {
  const organizationId = useFreightOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => freightService.deletePackage(id, organizationId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['freight', 'packages'] });
      void qc.invalidateQueries({ queryKey: ['freight', 'pipeline-dashboard'] });
      void qc.invalidateQueries({ queryKey: ['freight', 'pipeline-command'] });
      void qc.invalidateQueries({ queryKey: ['freight', 'pre-alerts'] });
    },
  });
}

export function useScanPackage() {
  const organizationId = useFreightOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { body: unknown; idempotencyKey?: string }) =>
      freightService.scan(args.body, organizationId, args.idempotencyKey),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['freight', 'packages'] });
      void qc.invalidateQueries({ queryKey: ['freight', 'pipeline-dashboard'] });
    },
  });
}

export function useHubSort() {
  const organizationId = useFreightOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => freightService.hubSort(body, organizationId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['freight', 'packages'] });
      void qc.invalidateQueries({ queryKey: ['freight', 'fulfillment'] });
    },
  });
}

export function useManifests(status?: string) {
  const { organizationId, session } = useAuth();
  return useQuery({
    queryKey: ['freight', 'manifests', organizationId, status],
    queryFn: () => freightService.listManifests(organizationId, status),
    enabled: Boolean(session),
  });
}

export function useManifest(id: string | undefined) {
  const { organizationId, session } = useAuth();
  return useQuery({
    queryKey: ['freight', 'manifest', organizationId, id],
    queryFn: () => freightService.getManifest(id!, organizationId),
    enabled: Boolean(session && id),
  });
}

export function useCreateManifest() {
  const organizationId = useFreightOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => freightService.createManifest(body, organizationId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['freight', 'manifests'] }),
  });
}

export function useUpdateManifest() {
  const organizationId = useFreightOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) =>
      freightService.updateManifest(id, body, organizationId),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['freight', 'manifests'] });
      void qc.invalidateQueries({ queryKey: ['freight', 'manifest', organizationId, vars.id] });
    },
  });
}

export function useDeleteManifest() {
  const organizationId = useFreightOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => freightService.deleteManifest(id, organizationId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['freight', 'manifests'] });
      void qc.invalidateQueries({ queryKey: ['freight', 'packages'] });
    },
  });
}

export function useImportWarehouseManifest() {
  const organizationId = useFreightOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof freightService.importWarehouseManifest>[0]) =>
      freightService.importWarehouseManifest(body, organizationId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['freight', 'manifests'] });
      void qc.invalidateQueries({ queryKey: ['freight', 'packages'] });
    },
  });
}

export function useCustomsCases() {
  const { organizationId, session } = useAuth();
  return useQuery({
    queryKey: ['freight', 'customs', organizationId],
    queryFn: () => freightService.listCustomsCases(organizationId),
    enabled: Boolean(session),
  });
}

export function useReadyFulfillment() {
  const { organizationId, session } = useAuth();
  return useQuery({
    queryKey: ['freight', 'fulfillment', organizationId],
    queryFn: () => freightService.listReadyFulfillment(organizationId),
    enabled: Boolean(session),
  });
}

export function useClientFleet(clientId?: string) {
  const { organizationId, session } = useAuth();
  return useQuery({
    queryKey: ['freight', 'client-fleet', organizationId, clientId],
    queryFn: () => freightService.listClientFleet(organizationId, clientId),
    enabled: Boolean(session),
  });
}

export function useCreateClientFleet() {
  const organizationId = useFreightOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => freightService.createClientFleet(body, organizationId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['freight', 'client-fleet'] }),
  });
}

export function useDeliveryBatches() {
  const { organizationId, session } = useAuth();
  return useQuery({
    queryKey: ['freight', 'batches', organizationId],
    queryFn: () => freightService.listDeliveryBatches(organizationId),
    enabled: Boolean(session),
  });
}

export function useOrgFiles(params?: { kind?: string; q?: string }) {
  const { organizationId, session } = useAuth();
  return useQuery({
    queryKey: ['freight', 'org-files', organizationId, params?.kind ?? '', params?.q ?? ''],
    queryFn: () => freightService.listOrgFiles(organizationId, params),
    enabled: Boolean(session),
  });
}

export function useDeleteOrgFile() {
  const organizationId = useFreightOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => freightService.deleteOrgFile(id, organizationId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['freight', 'org-files'] }),
  });
}
