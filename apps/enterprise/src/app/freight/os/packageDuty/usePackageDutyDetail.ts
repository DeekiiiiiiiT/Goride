import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/auth/AuthProvider';
import { freightService } from '@/app/services/freightService';
import { parseRetailInvoice } from '@/app/freight/invoiceParse/parseRetailInvoice';
import type { InvoiceParseSuggestion } from '@/app/freight/invoiceParse/types';

function minorToUsd(n: unknown) {
  return Number(n ?? 0) / 100;
}

/** Queries + mutations for Package Duty mission-control. */
export function usePackageDutyDetail(packageId: string) {
  const { organizationId, session } = useAuth();
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const [unobtainableNote, setUnobtainableNote] = useState('');
  const [parseReading, setParseReading] = useState(false);
  const [invoiceSuggestion, setInvoiceSuggestion] = useState<InvoiceParseSuggestion | null>(
    null,
  );

  useEffect(() => {
    setNote('');
    setUnobtainableNote('');
    setInvoiceSuggestion(null);
  }, [packageId]);

  const packages = useQuery({
    queryKey: ['freight', 'packages', organizationId, 'duty-picker'],
    queryFn: () => freightService.listPackages(organizationId),
    enabled: Boolean(session),
  });

  const detail = useQuery({
    queryKey: ['freight', 'package', organizationId, packageId],
    queryFn: () => freightService.getPackage(packageId, organizationId),
    enabled: Boolean(session && packageId),
  });

  const dutyQ = useQuery({
    queryKey: ['freight', 'duty', organizationId, packageId],
    queryFn: () => freightService.getPackageDuty(packageId, organizationId),
    enabled: Boolean(session && packageId),
  });

  const billingQ = useQuery({
    queryKey: ['freight', 'billing-invoices', organizationId, packageId],
    queryFn: () => freightService.listConsolidatedInvoices(packageId, organizationId),
    enabled: Boolean(session && packageId),
  });

  const verify = useMutation({
    mutationFn: () => freightService.verifyInvoice(packageId, note || undefined, organizationId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['freight', 'package', organizationId, packageId] });
      void qc.invalidateQueries({ queryKey: ['freight', 'invoice-audit'] });
    },
  });

  const uploadInvoice = useMutation({
    mutationFn: ({ file, slot }: { file: File; slot: 'warehouse' | 'customer' }) =>
      freightService.uploadPackageInvoice(packageId, file, organizationId, slot),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['freight', 'package', organizationId, packageId] });
      void qc.invalidateQueries({ queryKey: ['freight', 'invoice-audit'] });
    },
  });

  const applyInvoiceFill = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      freightService.updatePackage(packageId, body, organizationId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['freight', 'package', organizationId, packageId] });
      void qc.invalidateQueries({ queryKey: ['freight', 'packages'] });
      setInvoiceSuggestion(null);
    },
  });

  const invoiceFlags = useMutation({
    mutationFn: (body: {
      invoiceRequiredFromCustomer?: boolean;
      invoiceUnobtainable?: boolean;
      unobtainableNote?: string | null;
    }) => freightService.setInvoiceFlags(packageId, body, organizationId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['freight', 'package', organizationId, packageId] });
      void qc.invalidateQueries({ queryKey: ['freight', 'invoice-audit'] });
    },
  });

  const compute = useMutation({
    mutationFn: () => freightService.computeDuty(packageId, organizationId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['freight', 'duty', organizationId, packageId] });
    },
  });

  async function handleInvoiceUpload(file: File, slot: 'warehouse' | 'customer') {
    await uploadInvoice.mutateAsync({ file, slot });
    setParseReading(true);
    setInvoiceSuggestion(null);
    try {
      setInvoiceSuggestion(await parseRetailInvoice(file));
    } finally {
      setParseReading(false);
    }
  }

  function applyParsedInvoiceFields() {
    const current = detail.data?.package;
    if (!invoiceSuggestion || !current) return;
    const body: Record<string, unknown> = {};
    if (!String(current.retailer ?? '').trim() && invoiceSuggestion.retailer) {
      body.retailer = invoiceSuggestion.retailer;
    }
    if (!String(current.description ?? '').trim() && invoiceSuggestion.description) {
      body.description = invoiceSuggestion.description;
    }
    if (
      (current.declared_value_usd_minor == null ||
        Number(current.declared_value_usd_minor) === 0) &&
      invoiceSuggestion.declaredValueUsd != null
    ) {
      body.declaredValueUsdMinor = Math.round(invoiceSuggestion.declaredValueUsd * 100);
    }
    if (
      (current.weight_lbs == null || Number(current.weight_lbs) === 0) &&
      invoiceSuggestion.weightLbs != null
    ) {
      body.weightLbs = invoiceSuggestion.weightLbs;
    }
    if (Object.keys(body).length === 0) {
      setInvoiceSuggestion(null);
      return;
    }
    applyInvoiceFill.mutate(body);
  }

  const pkg = detail.data?.package;
  const suite = pkg?.suites as
    | { suite_code?: string; contact_name?: string; trn?: string; trn_valid?: boolean }
    | undefined;
  const duty = dutyQ.data?.duty ?? compute.data?.duty ?? null;
  const invoices = billingQ.data?.invoices ?? [];

  const dutyView = useMemo(() => {
    if (!duty) return null;
    return {
      aboveThreshold: Boolean(duty.above_threshold),
      cifUsd: minorToUsd(duty.cif_usd_minor),
      importDutyUsd: minorToUsd(duty.import_duty_usd_minor),
      scfUsd: minorToUsd(duty.scf_usd_minor),
      envUsd: minorToUsd(duty.env_usd_minor),
      gctUsd: minorToUsd(duty.gct_usd_minor),
      stampJmd: Number(duty.stamp_jmd_minor ?? 0) / 100,
      cafJmd: Number(duty.caf_jmd_minor ?? 0) / 100,
      totalDutyUsd: minorToUsd(duty.total_duty_usd_minor),
    };
  }, [duty]);

  return {
    organizationId,
    packages,
    detail,
    pkg,
    suite,
    duty,
    dutyView,
    invoices,
    scanEvents: detail.data?.scanEvents ?? [],
    note,
    setNote,
    unobtainableNote,
    setUnobtainableNote,
    parseReading,
    invoiceSuggestion,
    setInvoiceSuggestion,
    verify,
    uploadInvoice,
    applyInvoiceFill,
    invoiceFlags,
    compute,
    handleInvoiceUpload,
    applyParsedInvoiceFields,
    hasCustomerInvoice: Boolean(pkg?.invoice_storage_path || pkg?.invoice_file_name),
    hasWarehouseSlip: Boolean(
      pkg?.warehouse_invoice_storage_path || pkg?.warehouse_invoice_file_name,
    ),
    requiredFromCustomer: Boolean(pkg?.invoice_required_from_customer),
    unobtainable: Boolean(pkg?.invoice_unobtainable_at),
  };
}

export { minorToUsd };
