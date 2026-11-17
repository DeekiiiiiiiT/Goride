export type StoredDocumentParse = {
  fileSha256: string;
  fields: Record<string, unknown>;
  flags?: string[];
  colorStandard?: string | null;
};

export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

export async function prepareCertificateFile(
  file: File,
  convertPdfToImage: (f: File) => Promise<File | null>,
): Promise<File> {
  if (!isPdfFile(file)) return file;
  const imageFile = await convertPdfToImage(file);
  if (!imageFile) {
    throw new Error('Could not convert PDF to image');
  }
  return imageFile;
}

export function buildDocumentChecksPayload(
  fitness: StoredDocumentParse | null,
  registration: StoredDocumentParse | null,
): Array<{
  docType: 'fitness' | 'registration';
  fileSha256: string;
  fields: Record<string, unknown>;
}> {
  const out: Array<{
    docType: 'fitness' | 'registration';
    fileSha256: string;
    fields: Record<string, unknown>;
  }> = [];
  if (fitness?.fileSha256) {
    out.push({ docType: 'fitness', fileSha256: fitness.fileSha256, fields: fitness.fields });
  }
  if (registration?.fileSha256) {
    out.push({
      docType: 'registration',
      fileSha256: registration.fileSha256,
      fields: registration.fields,
    });
  }
  return out;
}

export function isAddVehicleSaveDisabled(opts: {
  licensePlate: string;
  catalogSaveBlocked: boolean;
  isLoading: boolean;
}): boolean {
  if (opts.isLoading || opts.catalogSaveBlocked) return true;
  return !opts.licensePlate.trim();
}

const CERT_ERROR_TOASTS: Record<string, string> = {
  PLATE_IN_OTHER_FLEET:
    'This plate is registered to another fleet on Roam — contact Roam support.',
  READ_LIMIT_USER:
    "You've scanned a lot of documents — try again in an hour, or type the details.",
  READ_LIMIT_ORG:
    "Your fleet has scanned a lot of documents today — try again tomorrow, or type the details.",
  FILE_TYPE_NOT_ALLOWED: "We couldn't read this file — please use a photo (JPEG, PNG, WebP, or HEIC).",
  FILE_TOO_LARGE: "We couldn't read this file — it's too large. Try a smaller photo.",
  READ_TIMEOUT: "We couldn't read this file — the scan timed out. Try again or type the details.",
  READ_PAUSED: 'Scanning is paused right now — type the details instead.',
};

export function certificateScanErrorToast(code: string | undefined, fallback: string): string {
  if (code && CERT_ERROR_TOASTS[code]) return CERT_ERROR_TOASTS[code];
  return fallback;
}