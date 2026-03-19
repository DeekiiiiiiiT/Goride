/**
 * Audit Log Helper — Roam Fleet Admin
 *
 * Records every admin action to KV for accountability.
 * Key pattern: audit:{timestamp}:{randomSuffix}
 */

import * as kv from "./kv_store.tsx";

export interface AuditEntry {
  actorId: string;
  actorName: string;
  action: string;
  targetId: string;
  targetEmail: string;
  details?: string;
  timestamp: string;
}

/**
 * Log an admin action. Call AFTER the action succeeds.
 */
export async function logAdminAction(params: {
  actorId: string;
  actorName: string;
  action: string;
  targetId: string;
  targetEmail: string;
  details?: string;
}): Promise<void> {
  try {
    const now = new Date();
    const ts = now.toISOString().replace(/[:.]/g, "-");
    const suffix = Math.random().toString(36).slice(2, 8);
    const key = `audit:${ts}:${suffix}`;
    const entry: AuditEntry = {
      ...params,
      timestamp: now.toISOString(),
    };
    await kv.set(key, entry);
    console.log(`[AuditLog] ${params.actorName} → ${params.action} → ${params.targetEmail}`);
  } catch (e: any) {
    // Never let audit logging break the main action
    console.error(`[AuditLog] Failed to write audit entry: ${e.message}`);
  }
}

/**
 * Retrieve audit log entries, sorted newest-first.
 */
export async function getAuditLogs(limit = 200): Promise<AuditEntry[]> {
  const raw = await kv.getByPrefix("audit:");
  if (!raw || raw.length === 0) return [];

  const entries: AuditEntry[] = raw
    .filter((r: any) => r && r.timestamp)
    .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return entries.slice(0, limit);
}

/**
 * Retrieve audit log entries by a specific actor.
 */
export async function getAuditLogsByActor(actorId: string, limit = 200): Promise<AuditEntry[]> {
  const all = await getAuditLogs(10000);
  return all.filter((e) => e.actorId === actorId).slice(0, limit);
}
