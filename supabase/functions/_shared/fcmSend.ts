/**
 * Firebase Cloud Messaging HTTP v1 (replaces deprecated legacy FCM_SERVER_KEY API).
 *
 * Supabase secret (one of):
 * - FCM_SERVICE_ACCOUNT_JSON — full service-account JSON string
 * - FCM_SERVICE_ACCOUNT_JSON_B64 — base64 of that JSON (easier for some shells)
 *
 * Optional fallback: FCM_SERVER_KEY (legacy) if still present on older projects.
 */

type ServiceAccount = {
  type?: string;
  project_id: string;
  private_key: string;
  client_email: string;
  token_uri?: string;
};

type SendResult = { ok: boolean; stale: boolean };

let cachedAccessToken: { token: string; expiresAtMs: number } | null = null;

function loadServiceAccount(): ServiceAccount | null {
  const raw =
    Deno.env.get("FCM_SERVICE_ACCOUNT_JSON")?.trim() ||
    (Deno.env.get("FCM_SERVICE_ACCOUNT_JSON_B64")?.trim()
      ? atob(Deno.env.get("FCM_SERVICE_ACCOUNT_JSON_B64")!.trim())
      : "");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ServiceAccount;
    if (!parsed.project_id || !parsed.private_key || !parsed.client_email) return null;
    return parsed;
  } catch {
    console.error("[fcm] FCM_SERVICE_ACCOUNT_JSON is not valid JSON");
    return null;
  }
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function base64UrlEncode(data: ArrayBuffer | Uint8Array | string): string {
  const bytes =
    typeof data === "string"
      ? new TextEncoder().encode(data)
      : data instanceof Uint8Array
        ? data
        : new Uint8Array(data);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function createSignedJwt(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: sa.token_uri || "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned =
    `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claim))}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  return `${unsigned}.${base64UrlEncode(signature)}`;
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAtMs > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }
  const assertion = await createSignedJwt(sa);
  const res = await fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const payload = await res.json().catch(() => ({})) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!res.ok || !payload.access_token) {
    throw new Error(`FCM token exchange failed: ${payload.error || res.status}`);
  }
  cachedAccessToken = {
    token: payload.access_token,
    expiresAtMs: Date.now() + Math.max(60, Number(payload.expires_in || 3600) - 120) * 1000,
  };
  return payload.access_token;
}

/** Legacy FCM HTTP API — only if FCM_SERVER_KEY is still set. */
async function sendFcmLegacy(
  token: string,
  title: string,
  message: string,
  url: string,
  logTag: string,
): Promise<SendResult> {
  const serverKey = Deno.env.get("FCM_SERVER_KEY")?.trim();
  if (!serverKey) return { ok: false, stale: false };

  const res = await fetch("https://fcm.googleapis.com/fcm/send", {
    method: "POST",
    headers: {
      Authorization: `key=${serverKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: token,
      notification: { title, body: message },
      data: { url },
      priority: "high",
    }),
  });

  if (res.status === 404 || res.status === 410) return { ok: false, stale: true };

  const payload = await res.json().catch(() => ({})) as {
    failure?: number;
    results?: Array<{ error?: string }>;
  };
  if (!res.ok) {
    console.error(`[${logTag}] FCM legacy HTTP error:`, res.status, payload);
    return { ok: false, stale: false };
  }
  const err = payload.results?.[0]?.error;
  if (err === "NotRegistered" || err === "InvalidRegistration") {
    return { ok: false, stale: true };
  }
  if ((payload.failure ?? 0) > 0 && err) {
    console.error(`[${logTag}] FCM legacy send failed:`, err);
    return { ok: false, stale: false };
  }
  return { ok: true, stale: false };
}

async function sendFcmHttpV1(
  sa: ServiceAccount,
  token: string,
  title: string,
  message: string,
  url: string,
  logTag: string,
): Promise<SendResult> {
  const accessToken = await getAccessToken(sa);
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body: message },
          data: { url },
          android: { priority: "HIGH" },
        },
      }),
    },
  );

  if (res.status === 404) return { ok: false, stale: true };

  const payload = await res.json().catch(() => ({})) as {
    error?: { status?: string; details?: Array<{ errorCode?: string }> };
  };

  if (!res.ok) {
    const code = payload.error?.details?.[0]?.errorCode || payload.error?.status;
    if (
      code === "UNREGISTERED" ||
      code === "NOT_FOUND" ||
      payload.error?.status === "NOT_FOUND"
    ) {
      return { ok: false, stale: true };
    }
    console.error(`[${logTag}] FCM v1 send failed:`, res.status, payload);
    return { ok: false, stale: false };
  }

  return { ok: true, stale: false };
}

/** Send to a device registration token (Android FCM / iOS FCM via Firebase). */
export async function sendFcmPush(
  token: string,
  title: string,
  message: string,
  url: string,
  logTag = "fcm",
): Promise<SendResult> {
  const sa = loadServiceAccount();
  if (sa) {
    try {
      return await sendFcmHttpV1(sa, token, title, message, url, logTag);
    } catch (err) {
      console.error(`[${logTag}] FCM v1 error:`, err);
      return { ok: false, stale: false };
    }
  }

  if (Deno.env.get("FCM_SERVER_KEY")?.trim()) {
    return sendFcmLegacy(token, title, message, url, logTag);
  }

  console.warn(
    `[${logTag}] No FCM_SERVICE_ACCOUNT_JSON (or FCM_SERVER_KEY); skipping native push`,
  );
  return { ok: false, stale: false };
}
