/**
 * Expense Hub React Query hooks.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { expenseHubService } from '../services/expenseHubService';

export const expenseHubKeys = {
  all: ['expense-hub'] as const,
  flag: () => [...expenseHubKeys.all, 'flag'] as const,
  summary: (start: string, end: string) => [...expenseHubKeys.all, 'summary', start, end] as const,
  documents: (filters: Record<string, unknown>) =>
    [...expenseHubKeys.all, 'documents', filters] as const,
  document: (id: string) => [...expenseHubKeys.all, 'document', id] as const,
  rules: () => [...expenseHubKeys.all, 'rules'] as const,
  rule: (id: string) => [...expenseHubKeys.all, 'rule', id] as const,
  vendors: () => [...expenseHubKeys.all, 'vendors'] as const,
};

export function useExpenseHubFlag() {
  return useQuery({
    queryKey: expenseHubKeys.flag(),
    queryFn: () => expenseHubService.getFlag(),
    staleTime: 30_000,
  });
}

export function useExpenseHubSummary(startYmd: string, endYmd: string) {
  return useQuery({
    queryKey: expenseHubKeys.summary(startYmd, endYmd),
    queryFn: () => expenseHubService.getSummary(startYmd, endYmd),
    enabled: Boolean(startYmd && endYmd),
  });
}

export function useExpenseHubDocuments(filters: {
  status?: string;
  vehicleId?: string;
  q?: string;
}) {
  return useQuery({
    queryKey: expenseHubKeys.documents(filters),
    queryFn: () => expenseHubService.listDocuments(filters),
  });
}

export function useExpenseHubDocument(id: string | null) {
  return useQuery({
    queryKey: expenseHubKeys.document(id || ''),
    queryFn: () => expenseHubService.getDocument(id!),
    enabled: Boolean(id),
  });
}

export function useExpenseHubRules() {
  return useQuery({
    queryKey: expenseHubKeys.rules(),
    queryFn: () => expenseHubService.listRules(),
  });
}

export function useExpenseHubVendors() {
  return useQuery({
    queryKey: expenseHubKeys.vendors(),
    queryFn: () => expenseHubService.listVendors(),
  });
}

function useInvalidateHub() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: expenseHubKeys.all });
}

export function useCreateExpenseDocument() {
  const invalidate = useInvalidateHub();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => expenseHubService.createDocument(body),
    onSuccess: () => invalidate(),
  });
}

export function useApproveExpenseDocument() {
  const invalidate = useInvalidateHub();
  return useMutation({
    mutationFn: ({ id, allowSelfApprove }: { id: string; allowSelfApprove?: boolean }) =>
      expenseHubService.approveDocument(id, allowSelfApprove),
    onSuccess: () => invalidate(),
  });
}

export function useRejectExpenseDocument() {
  const invalidate = useInvalidateHub();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      expenseHubService.rejectDocument(id, reason),
    onSuccess: () => invalidate(),
  });
}

export function useRecordExpensePayment() {
  const invalidate = useInvalidateHub();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      amount: number;
      paymentDate?: string;
      paymentMethod?: string;
      reference?: string;
    }) => expenseHubService.recordPayment(id, body),
    onSuccess: () => invalidate(),
  });
}

export function useCreateExpenseRule() {
  const invalidate = useInvalidateHub();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => expenseHubService.createRule(body),
    onSuccess: () => invalidate(),
  });
}

export function useBulkExpenseRuleAction() {
  const invalidate = useInvalidateHub();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      expenseHubService.bulkRuleAction(id, body),
    onSuccess: () => invalidate(),
  });
}

export function useCreateExpenseVendor() {
  const invalidate = useInvalidateHub();
  return useMutation({
    mutationFn: (body: { name: string; categoryDefault?: string; notes?: string }) =>
      expenseHubService.createVendor(body),
    onSuccess: () => invalidate(),
  });
}
