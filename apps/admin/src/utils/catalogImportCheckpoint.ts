/** localStorage checkpoint for resumable catalog CSV imports. */
export type CatalogImportCheckpoint = {
  importBatchId: string;
  completedRowIndices: number[];
  fileNameHint?: string;
  updatedAt: string;
};

const KEY = "vehicle_catalog_import_checkpoint_v1";

export function loadCatalogImportCheckpoint(): CatalogImportCheckpoint | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CatalogImportCheckpoint;
    if (!parsed?.importBatchId || !Array.isArray(parsed.completedRowIndices)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveCatalogImportCheckpoint(cp: CatalogImportCheckpoint): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(cp));
  } catch {
    /* ignore quota */
  }
}

export function clearCatalogImportCheckpoint(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
