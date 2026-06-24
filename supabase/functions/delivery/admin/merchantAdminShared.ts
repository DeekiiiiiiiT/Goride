import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type VerificationStatus =
  | "pending"
  | "in_review"
  | "docs_requested"
  | "approved"
  | "rejected";

export type OperationalStatus = "active" | "suspended" | "deactivated";

export const ALLOWED_TRANSITIONS: Record<VerificationStatus, VerificationStatus[]> = {
  pending: ["in_review", "approved", "rejected"],
  in_review: ["approved", "rejected", "docs_requested"],
  docs_requested: ["in_review", "approved", "rejected"],
  approved: [],
  rejected: ["pending"],
};

export const VERIFICATION_CHECKLIST_KEYS = [
  "id_verified",
  "business_proof_verified",
  "bank_verified",
  "hours_verified",
  "menu_preview_verified",
] as const;

export function isValidStatus(s: unknown): s is VerificationStatus {
  return typeof s === "string" && s in ALLOWED_TRANSITIONS;
}

export function isChecklistComplete(checklist: Record<string, boolean> | null | undefined): boolean {
  const c = checklist ?? {};
  return VERIFICATION_CHECKLIST_KEYS.every((k) => c[k] === true);
}

export function getDb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "delivery" } },
  );
}

export function getAuthAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export async function logMerchantAudit(
  sb: ReturnType<typeof getDb>,
  opts: {
    merchant_id: string;
    actor_id: string;
    actor_email: string;
    action: string;
    from_status?: string | null;
    to_status?: string | null;
    notes?: string | null;
    internal_notes?: string | null;
  },
) {
  await sb.from("merchant_audit_log").insert(opts);
}

/** denomailer `from` must be a single mail string, e.g. `Name <email@domain.com>` */
function normalizeSmtpFrom(raw: string | undefined): string {
  const trimmed = (raw ?? "").trim().replace(/^["']|["']$/g, "");
  if (!trimmed) return "";

  const bracketed = trimmed.match(/^(.+?)\s*<([^>]+)>$/);
  if (bracketed) {
    const name = bracketed[1].trim().replace(/^["']|["']$/g, "");
    const mail = bracketed[2].trim();
    return name ? `${name} <${mail}>` : mail;
  }

  const embedded = trimmed.match(/<([^>\s]+@[^>\s]+)>/);
  if (embedded) return embedded[1].trim();

  const loose = trimmed.match(/[^\s<>]+@[^\s<>]+\.[^\s<>]+/);
  if (loose) return loose[0];

  return trimmed;
}

function isValidFromField(from: string): boolean {
  if (!from) return false;
  if (/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(from)) return true;
  return /^.+\s<[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>$/.test(from);
}

function resolveEmailFrom(smtpFromSecret: string, smtpUser: string | undefined): string {
  const candidates = [
    smtpFromSecret,
    Deno.env.get("RESEND_FROM")?.trim(),
    smtpUser?.includes("@") ? smtpUser : "",
  ].filter((v): v is string => Boolean(v));

  for (const raw of candidates) {
    const normalized = normalizeSmtpFrom(raw);
    if (isValidFromField(normalized)) return normalized;
  }
  return "";
}

async function sendViaResendApi(
  opts: { to: string; subject: string; html: string; text: string },
  apiKey: string,
  from: string,
): Promise<{ sent: boolean; reason?: string }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let reason = body || res.statusText;
    try {
      const parsed = JSON.parse(body) as { message?: string };
      if (parsed.message) reason = parsed.message;
    } catch {
      // keep raw body
    }
    console.error(`[email] Resend API failed for ${opts.to}:`, reason);
    return { sent: false, reason };
  }

  return { sent: true };
}

export async function sendNotificationEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const host = Deno.env.get("SMTP_HOST");
  const port = Deno.env.get("SMTP_PORT");
  const user = Deno.env.get("SMTP_USER");
  const pass = Deno.env.get("SMTP_PASS");
  const smtpFromSecret = Deno.env.get("SMTP_FROM")?.trim() || "";
  let from = resolveEmailFrom(smtpFromSecret, user);
  const useResendApi = Boolean(host?.includes("resend.com") && pass?.startsWith("re_"));

  if (!from && useResendApi) {
    // Last resort: verified domain default (override via RESEND_FROM or SMTP_FROM secrets)
    from = normalizeSmtpFrom("Roam Dash <noreply@roam-s.co>");
  }

  if (!host || !port || !user || !pass || !from || !isValidFromField(from)) {
    console.log(`[email] SMTP not configured - skipping send to ${opts.to}`);
    return { sent: false, reason: !isValidFromField(from) ? "invalid_smtp_from" : "smtp_not_configured" };
  }

  // Resend: prefer REST API (same API key as SMTP_PASS) — avoids denomailer from-field quirks
  if (useResendApi) {
    return sendViaResendApi(opts, pass, from);
  }

  try {
    const { SMTPClient } = await import("https://deno.land/x/denomailer@1.6.0/mod.ts");
    const client = new SMTPClient({
      connection: {
        hostname: host,
        port: Number(port),
        tls: true,
        auth: { username: user, password: pass },
      },
    });
    await client.send({
      from,
      to: opts.to,
      subject: opts.subject,
      content: opts.text,
      html: opts.html,
    });
    await client.close();
    return { sent: true };
  } catch (e) {
    console.error(`[email] Failed to send to ${opts.to}:`, e);
    return { sent: false, reason: e instanceof Error ? e.message : "unknown" };
  }
}

export function renderStatusEmail(
  status: VerificationStatus,
  merchant: { name: string; rejection_reason?: string | null; verification_notes?: string | null },
): { subject: string; html: string; text: string } {
  const portalUrl = "https://partner.roamdash.co";
  switch (status) {
    case "approved":
      return {
        subject: `${merchant.name} is now live on Roam Dash!`,
        text: `Great news! Your restaurant "${merchant.name}" has been approved.\n\n${portalUrl}`,
        html: `<p><strong>${merchant.name}</strong> has been approved. <a href="${portalUrl}">Open Partner Portal</a></p>`,
      };
    case "rejected":
      return {
        subject: `Update on your Roam Dash application`,
        text: `Reason: ${merchant.rejection_reason || "Not specified"}\n\n${portalUrl}`,
        html: `<p>Application not approved. Reason: ${merchant.rejection_reason || "Not specified"}</p>`,
      };
    case "docs_requested":
      return {
        subject: `Additional information needed for ${merchant.name}`,
        text: `${merchant.verification_notes || "Please log in"}\n\n${portalUrl}`,
        html: `<p>More info needed: ${merchant.verification_notes || "Please log in"}</p>`,
      };
    case "in_review":
      return {
        subject: `Your Roam Dash application is being reviewed`,
        text: `Application for "${merchant.name}" is under review.`,
        html: `<p>Application for <strong>${merchant.name}</strong> is under review.</p>`,
      };
    default:
      return {
        subject: `Update on ${merchant.name}`,
        text: `Status: ${status}`,
        html: `<p>Status: ${status}</p>`,
      };
  }
}

export async function writeKvAudit(
  admin: { id: string; email: string },
  action: string,
  targetId: string,
  targetEmail: string,
  details: string,
) {
  try {
    const kvClient = getAuthAdmin();
    const ts = new Date();
    const tsKey = ts.toISOString().replace(/[:.]/g, "-");
    const suffix = Math.random().toString(36).slice(2, 8);
    await kvClient.from("kv_store_37f42386").upsert({
      key: `audit:${tsKey}:${suffix}`,
      value: {
        actorId: admin.id,
        actorName: admin.email || "Admin",
        action,
        targetId,
        targetEmail,
        details,
        timestamp: ts.toISOString(),
      },
    });
  } catch (e) {
    console.error("[audit-bridge] failed:", e);
  }
}

export function canSuspendMerchant(verificationStatus: string): boolean {
  return verificationStatus === "approved";
}

export function canTransitionOperational(
  current: OperationalStatus,
  target: OperationalStatus,
): boolean {
  if (current === target) return true;
  if (current === "active" && (target === "suspended" || target === "deactivated")) return true;
  if (current === "suspended" && (target === "active" || target === "deactivated")) return true;
  if (current === "deactivated" && target === "active") return true;
  return false;
}
