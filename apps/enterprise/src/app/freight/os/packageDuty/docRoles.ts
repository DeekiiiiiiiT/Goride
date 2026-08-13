/** Shared labels / status for customer commercial invoice vs warehouse packing slip. */

export type DocRoleId = 'customer_invoice' | 'warehouse_slip';

export type DocRoleStatus = 'blocking' | 'optional_missing' | 'ok' | 'soft_hold';

export const DOC_ROLE = {
  customer_invoice: {
    id: 'customer_invoice' as const,
    label: 'Customer commercial invoice',
    shortLabel: 'Customer invoice',
    purpose: 'Value check — needed before seal (verify or mark unobtainable)',
  },
  warehouse_slip: {
    id: 'warehouse_slip' as const,
    label: 'Freight forwarder packing slip',
    shortLabel: 'Forwarder slip',
    purpose: 'What came with the box at US intake — optional, never blocks seal',
  },
} as const;

export function customerDocStatus(input: {
  hasFile: boolean;
  verified: boolean;
  unobtainable: boolean;
  requiredFromCustomer?: boolean;
  /** seal = blocking gaps; prealert = optional until later */
  context?: 'seal' | 'prealert' | 'receive';
}): DocRoleStatus {
  const ctx = input.context ?? 'seal';
  if (input.verified || input.unobtainable) return 'ok';
  if (input.hasFile) return 'ok';
  if (ctx === 'prealert') return 'optional_missing';
  if (input.requiredFromCustomer && ctx === 'receive') return 'soft_hold';
  if (ctx === 'receive' && !input.requiredFromCustomer) return 'optional_missing';
  // seal (default): missing customer invoice blocks
  return 'blocking';
}

export function warehouseDocStatus(hasFile: boolean): DocRoleStatus {
  return hasFile ? 'ok' : 'optional_missing';
}

export function emptyDocCopy(
  role: DocRoleId,
  status: DocRoleStatus,
): string {
  if (status === 'ok') return 'On file';
  if (role === 'warehouse_slip') return 'Not uploaded (optional)';
  if (status === 'blocking') return 'Missing — needed before seal';
  if (status === 'soft_hold') return 'Soft hold — still optional at receive';
  return 'Not uploaded yet';
}

export function fileDisplayName(
  role: DocRoleId,
  fileName: string | null | undefined,
  storagePath: string | null | undefined,
  status: DocRoleStatus,
): string {
  const name = String(fileName || storagePath || '').trim();
  if (name) return name;
  return emptyDocCopy(role, status);
}

export function sealReadinessLines(input: {
  hasCustomerFile: boolean;
  hasWarehouseSlip: boolean;
  verified: boolean;
  unobtainable: boolean;
}): { tone: 'ok' | 'warn' | 'info'; text: string }[] {
  const lines: { tone: 'ok' | 'warn' | 'info'; text: string }[] = [];
  if (input.verified) {
    lines.push({ tone: 'ok', text: 'Seal gate: customer invoice verified.' });
  } else if (input.unobtainable) {
    lines.push({
      tone: 'ok',
      text: 'Seal gate: customer invoice marked unobtainable (bypass).',
    });
  } else if (input.hasCustomerFile) {
    lines.push({
      tone: 'warn',
      text: 'Seal gate: customer invoice on file — still needs clerk verify.',
    });
  } else {
    lines.push({
      tone: 'warn',
      text: 'Seal gate blocked: upload & verify customer commercial invoice (or mark unobtainable).',
    });
  }
  if (!input.hasWarehouseSlip) {
    lines.push({
      tone: 'info',
      text: 'Packing slip optional — does not block seal.',
    });
  }
  return lines;
}
