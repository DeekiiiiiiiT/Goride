/**
 * Centralized permission and admin action audit logging.
 */
import { serviceClient } from "./rbacQuery.ts";

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return request.headers.get("x-real-ip");
}

export async function logPermissionCheck(params: {
  actorUserId: string | null;
  action: "permission.granted" | "permission.denied";
  permissionKey: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  request: Request;
}): Promise<void> {
  try {
    await serviceClient().schema("platform").from("permission_audit_log").insert({
      actor_user_id: params.actorUserId,
      action: params.action,
      permission_key: params.permissionKey,
      resource_type: params.resourceType ?? null,
      resource_id: params.resourceId ?? null,
      metadata: params.metadata ?? {},
      ip_address: clientIp(params.request),
      user_agent: params.request.headers.get("user-agent"),
    });
  } catch (e) {
    console.warn("[audit] logPermissionCheck failed:", e);
  }
}

export async function logRoleChange(params: {
  actorUserId: string | null;
  targetUserId: string;
  action: "role.granted" | "role.revoked";
  roleName: string;
  request?: Request;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await serviceClient().schema("platform").from("permission_audit_log").insert({
      actor_user_id: params.actorUserId,
      target_user_id: params.targetUserId,
      action: params.action,
      role_name: params.roleName,
      metadata: params.metadata ?? {},
      ip_address: params.request ? clientIp(params.request) : null,
      user_agent: params.request?.headers.get("user-agent") ?? null,
    });
  } catch (e) {
    console.warn("[audit] logRoleChange failed:", e);
  }
}

export async function logAdminAction(params: {
  actorUserId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
  request: Request;
}): Promise<void> {
  try {
    await serviceClient().schema("platform").from("permission_audit_log").insert({
      actor_user_id: params.actorUserId,
      action: params.action,
      resource_type: params.resourceType,
      resource_id: params.resourceId,
      metadata: params.metadata ?? {},
      ip_address: clientIp(params.request),
      user_agent: params.request.headers.get("user-agent"),
    });
  } catch (e) {
    console.warn("[audit] logAdminAction failed:", e);
  }
}
