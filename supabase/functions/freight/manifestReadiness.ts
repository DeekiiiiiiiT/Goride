import { isValidJamaicaTrn } from "./validateTrn.ts";

export type ReadinessPackage = {
  id: string;
  courier_tracking_number?: string | null;
  weight_lbs?: number | string | null;
  weight_kg?: number | string | null;
  declared_value_usd_minor?: number | null;
  invoice_storage_path?: string | null;
  invoice_file_name?: string | null;
  invoice_verified_at?: string | null;
  suites?: {
    suite_code?: string | null;
    trn?: string | null;
    trn_valid?: boolean | null;
  } | null;
};

export type ReadinessBlocker = {
  packageId: string;
  tracking: string;
  code:
    | "missing_trn"
    | "invalid_trn"
    | "missing_invoice"
    | "invoice_unverified"
    | "missing_weight"
    | "missing_declared_value";
  message: string;
};

function hasWeight(p: ReadinessPackage): boolean {
  const lbs = Number(p.weight_lbs);
  const kg = Number(p.weight_kg);
  return (Number.isFinite(lbs) && lbs > 0) || (Number.isFinite(kg) && kg > 0);
}

export function evaluatePackageReadiness(p: ReadinessPackage): ReadinessBlocker[] {
  const tracking = p.courier_tracking_number || p.id.slice(0, 8);
  const blockers: ReadinessBlocker[] = [];
  const trn = p.suites?.trn ?? null;
  const trnOk = p.suites?.trn_valid === true || isValidJamaicaTrn(trn);

  if (!trn) {
    blockers.push({
      packageId: p.id,
      tracking,
      code: "missing_trn",
      message: "Suite TRN is missing",
    });
  } else if (!trnOk) {
    blockers.push({
      packageId: p.id,
      tracking,
      code: "invalid_trn",
      message: "Suite TRN must be 9 digits",
    });
  }

  if (!p.invoice_storage_path && !p.invoice_file_name) {
    blockers.push({
      packageId: p.id,
      tracking,
      code: "missing_invoice",
      message: "Commercial invoice file is missing",
    });
  } else if (!p.invoice_verified_at) {
    blockers.push({
      packageId: p.id,
      tracking,
      code: "invoice_unverified",
      message: "Invoice not verified by clerk",
    });
  }

  if (!hasWeight(p)) {
    blockers.push({
      packageId: p.id,
      tracking,
      code: "missing_weight",
      message: "Metric/imperial weight is required",
    });
  }

  if (p.declared_value_usd_minor == null || Number(p.declared_value_usd_minor) < 0) {
    blockers.push({
      packageId: p.id,
      tracking,
      code: "missing_declared_value",
      message: "Declared USD value is required",
    });
  }

  return blockers;
}

export function evaluateManifestReadiness(packages: ReadinessPackage[]): {
  blockers: ReadinessBlocker[];
  readyCount: number;
  total: number;
  canSeal: boolean;
} {
  const blockers = packages.flatMap(evaluatePackageReadiness);
  const blockedIds = new Set(blockers.map((b) => b.packageId));
  const readyCount = packages.filter((p) => !blockedIds.has(p.id)).length;
  return {
    blockers,
    readyCount,
    total: packages.length,
    canSeal: packages.length > 0 && blockers.length === 0,
  };
}
