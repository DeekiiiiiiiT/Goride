/** Jamaica TRN — 9 digits (format gate; not a live TAJ lookup). */

export function normalizeTrn(raw: string | null | undefined): string {
  return String(raw ?? "").replace(/\D/g, "");
}

export function isValidJamaicaTrn(raw: string | null | undefined): boolean {
  return /^\d{9}$/.test(normalizeTrn(raw));
}

export function validateTrn(raw: string | null | undefined): {
  valid: boolean;
  normalized: string;
  error?: string;
} {
  const normalized = normalizeTrn(raw);
  if (!normalized) {
    return { valid: false, normalized: "", error: "TRN is required" };
  }
  if (!/^\d{9}$/.test(normalized)) {
    return {
      valid: false,
      normalized,
      error: "TRN must be exactly 9 digits",
    };
  }
  return { valid: true, normalized };
}
