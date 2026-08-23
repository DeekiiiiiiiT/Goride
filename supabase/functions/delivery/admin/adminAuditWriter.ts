/**
 * Unified blocking admin audit writer (Phase 4).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type AdminAuditInput = {
  actorUserId: string;
  targetUserId?: string;
  action: string;
  permissionKey?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  resourceType?: string;
  resourceId?: string;
};

function platformClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { db: { schema: "platform" } },
  );
}

export async function writeAdminAudit(input: AdminAuditInput): Promise<void> {
  const { error } = await platformClient().from("permission_audit_log").insert({
    actor_user_id: input.actorUserId,
    target_user_id: input.targetUserId ?? null,
    action: input.action,
    permission_key: input.permissionKey ?? null,
    resource_type: input.resourceType ?? null,
    resource_id: input.resourceId ?? null,
    metadata: {
      ...(input.metadata ?? {}),
      ...(input.reason ? { reason: input.reason } : {}),
    },
  });
  if (error) {
    throw new Error(`audit_write_failed: ${error.message}`);
  }
}

/** Dual-write during migration; KV path retired after backfill. */
export async function writeAdminAuditBestEffort(input: AdminAuditInput): Promise<void> {
  try {
    await writeAdminAudit(input);
  } catch (e) {
    console.error("[adminAudit]", e);
  }
}
