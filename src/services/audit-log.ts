/**
 * Import/Export Audit Log — localStorage-based activity trail.
 * Records every import and export operation for accountability and debugging.
 * Retains the last 100 entries (FIFO eviction).
 */

const STORAGE_KEY = 'roam_fleet_audit_log';
const MAX_ENTRIES = 100;

export type AuditOperation = 'import' | 'export' | 'backup' | 'restore';
export type AuditStatus = 'success' | 'partial' | 'failed';

export interface AuditEntry {
  id: string;
  timestamp: string;
  operation: AuditOperation;
  category: string;
  recordCount: number;
  status: AuditStatus;
  fileName?: string;
  format?: 'csv' | 'json' | 'zip';
  errors?: string[];
  durationMs?: number;
}

/** Retrieve all audit entries (newest first). */
export function getAuditLog(): AuditEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as AuditEntry[];
  } catch {
    return [];
  }
}

/** Append a new audit entry. Trims to MAX_ENTRIES. */
export function logAuditEntry(entry: Omit<AuditEntry, 'id' | 'timestamp'>): AuditEntry {
  const full: AuditEntry = {
    ...entry,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  };
  const log = getAuditLog();
  log.unshift(full); // newest first
  if (log.length > MAX_ENTRIES) log.length = MAX_ENTRIES;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
  } catch (e) {
    console.warn('Failed to persist audit log:', e);
  }
  return full;
}

/** Clear entire audit log. */
export function clearAuditLog(): void {
  localStorage.removeItem(STORAGE_KEY);
}
