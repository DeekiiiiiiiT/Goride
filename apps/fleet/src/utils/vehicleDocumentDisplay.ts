import { differenceInCalendarDays, format, isValid } from 'date-fns';
import type { Vehicle, VehicleDocument } from '../types/vehicle';

function parseDisplayDate(dateStr: string | Date | undefined | null): Date | null {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return Number.isNaN(dateStr.getTime()) ? null : dateStr;
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? null : d;
}

function uploadTimestamp(doc: VehicleDocument): number {
  const d = parseDisplayDate(doc.uploadDate);
  return d ? d.getTime() : 0;
}

export function dedupeVehicleDocuments(docs: VehicleDocument[]): VehicleDocument[] {
  const byId = new Map<string, VehicleDocument>();
  for (const doc of docs) {
    const prev = byId.get(doc.id);
    if (!prev || uploadTimestamp(doc) > uploadTimestamp(prev)) {
      byId.set(doc.id, doc);
    }
  }
  return Array.from(byId.values());
}

export type VehicleDocumentExpiryKind = 'expired' | 'soon' | 'ok';

export type VehicleDocumentExpiryState = {
  kind: VehicleDocumentExpiryKind;
  label: string;
  badgeClassName: string;
  statusLabel: string;
};

function formatExpiryDate(expiryDate: string | undefined): string | null {
  if (!expiryDate) return null;
  const d = parseDisplayDate(expiryDate);
  return d && isValid(d) ? format(d, 'MMM d, yyyy') : null;
}

export function getVehicleDocumentExpiryState(
  expiryDate: string | undefined,
  status: VehicleDocument['status'],
): VehicleDocumentExpiryState {
  const formatted = formatExpiryDate(expiryDate);
  const d = parseDisplayDate(expiryDate);
  const days = d ? differenceInCalendarDays(d, new Date()) : null;

  if (days != null && days < 0) {
    const label = formatted ? `Expired on ${formatted}` : 'Expired';
    return {
      kind: 'expired',
      label,
      statusLabel: label,
      badgeClassName:
        'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
    };
  }

  if (days != null && days <= 30) {
    return {
      kind: 'soon',
      label: 'Expires soon',
      statusLabel: 'Expires soon',
      badgeClassName:
        'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
    };
  }

  const statusLabel = status === 'Verified' ? 'Verified' : status === 'Pending' ? 'Pending' : status;
  const badgeClassName =
    status === 'Verified'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
      : 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';

  return { kind: 'ok', label: statusLabel, statusLabel, badgeClassName };
}

export function formatVehicleDocumentExpiryLine(expiryDate: string | undefined): string {
  const formatted = formatExpiryDate(expiryDate);
  return formatted ?? '—';
}

export function resolveDocumentFileUrl(doc: VehicleDocument, vehicle: Vehicle): string | undefined {
  if (doc.url?.trim()) return doc.url.trim();
  if (doc.type === 'Registration' && vehicle.registrationCertificateUrl?.trim()) {
    return vehicle.registrationCertificateUrl.trim();
  }
  if (doc.type === 'Fitness' && vehicle.fitnessCertificateUrl?.trim()) {
    return vehicle.fitnessCertificateUrl.trim();
  }
  return undefined;
}

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s || undefined;
}

function formatJmdMoney(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const n = Number(String(raw).replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(n) || n === 0) {
    const t = raw.trim();
    return t || undefined;
  }
  return `J$${Math.round(n).toLocaleString()}`;
}

function formatOdometerKm(raw: string | undefined): string | undefined {
  const s = str(raw);
  if (!s) return undefined;
  const n = Number(s.replace(/[^0-9.-]/g, ''));
  if (Number.isFinite(n)) return `${Math.round(n).toLocaleString()} km`;
  return s;
}

export type VehicleDocumentDetailRow = { label: string; value: string };

function pushRow(rows: VehicleDocumentDetailRow[], label: string, value: string | undefined) {
  const v = str(value);
  if (v) rows.push({ label, value: v });
}

export function buildVehicleDocumentDetailRows(
  doc: VehicleDocument,
  vehicle: Vehicle,
): VehicleDocumentDetailRow[] {
  const m = doc.metadata ?? {};
  const rows: VehicleDocumentDetailRow[] = [];
  const type = doc.type;

  const formatDateField = (raw: string | undefined) => {
    if (!raw) return undefined;
    const d = parseDisplayDate(raw);
    return d && isValid(d) ? format(d, 'MMM d, yyyy') : raw;
  };

  if (type === 'Registration') {
    pushRow(rows, 'Plate', str(m.plateNumber) ?? str(vehicle.licensePlate));
    pushRow(rows, 'LA number', str(m.laNumber) ?? str(vehicle.laNumber));
    pushRow(rows, 'MVID', str(m.mvid) ?? str(vehicle.mvid));
    pushRow(rows, 'Control number', str(m.controlNumber) ?? str(vehicle.controlNumber));
    pushRow(rows, 'Chassis number', str(m.chassisNumber) ?? str(vehicle.vin));
    pushRow(rows, 'Issued', formatDateField(str(m.issueDate) ?? str(vehicle.registrationIssueDate)));
    pushRow(rows, 'Expires', formatDateField(doc.expiryDate || vehicle.registrationExpiry));
  } else if (type === 'Fitness') {
    pushRow(rows, 'Make', str(m.make) ?? str(vehicle.make));
    pushRow(rows, 'Model', str(m.model) ?? str(vehicle.model));
    pushRow(rows, 'Year', str(m.year) ?? str(vehicle.year));
    pushRow(rows, 'Body type', str(m.bodyType) ?? str(vehicle.bodyType));
    pushRow(rows, 'Engine number', str(m.engineNumber) ?? str(vehicle.engineNumber));
    const cc = str(m.ccRating) ?? str(vehicle.ccRating);
    if (cc) {
      const ccVal = /cc/i.test(cc) ? cc : `${cc} cc`;
      pushRow(rows, 'Engine size (cc)', ccVal);
    }
    pushRow(rows, 'Issued', formatDateField(str(m.issueDate) ?? str(vehicle.fitnessIssueDate)));
    pushRow(rows, 'Expires', formatDateField(doc.expiryDate || vehicle.fitnessExpiry));
  } else if (type === 'Valuation') {
    pushRow(rows, 'Valuation date', formatDateField(str(m.valuationDate)));
    const market = formatJmdMoney(str(m.marketValue));
    if (market) pushRow(rows, 'Market value', market);
    const forced = formatJmdMoney(str(m.forcedSaleValue));
    if (forced) pushRow(rows, 'Forced-sale value', forced);
    const odo = formatOdometerKm(str(m.odometer));
    if (odo) pushRow(rows, 'Odometer (km)', odo);
    pushRow(rows, 'Engine number', str(m.engineNumber) ?? str(vehicle.engineNumber));
    pushRow(rows, 'Chassis number', str(m.chassisNumber) ?? str(vehicle.vin));
    pushRow(rows, 'Colour', str(m.color) ?? str(vehicle.color));
  } else if (type === 'Insurance') {
    pushRow(rows, 'Policy number', str(m.policyNumber));
    pushRow(rows, 'Expires', formatDateField(doc.expiryDate || vehicle.insuranceExpiry));
    const idv = formatJmdMoney(str(m.idv));
    if (idv) pushRow(rows, 'Insured value', idv);
    const premium = formatJmdMoney(str(m.policyPremium));
    if (premium) pushRow(rows, 'Premium', premium);
    const excess = formatJmdMoney(str(m.excessDeductible));
    if (excess) pushRow(rows, 'Excess', excess);
    pushRow(rows, 'Authorised drivers', str(m.authorizedDrivers));
    pushRow(rows, 'Permitted use', str(m.limitationsUse));
  } else {
    pushRow(rows, 'Expires', formatDateField(doc.expiryDate));
  }

  return rows;
}
