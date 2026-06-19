const DRAFT_KEY = 'roam-haul:documents-draft';

export type DocumentSlotKey =
  | 'license_front'
  | 'license_back'
  | 'vehicle_registration'
  | 'insurance_certificate';

export type DocumentsDraft = {
  consent: boolean;
  uploaded: Partial<Record<DocumentSlotKey, boolean>>;
};

const emptyDraft = (): DocumentsDraft => ({ consent: false, uploaded: {} });

export function readDocumentsDraft(): DocumentsDraft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return emptyDraft();
    return { ...emptyDraft(), ...(JSON.parse(raw) as DocumentsDraft) };
  } catch {
    return emptyDraft();
  }
}

export function writeDocumentsDraft(draft: DocumentsDraft): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* ignore */
  }
}

export function clearDocumentsDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}
