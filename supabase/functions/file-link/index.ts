/**
 * Opens a private R2 file from a signed long-lived link (see _shared/objectStorage/fileLink.ts).
 * No login (verify_jwt = false): receipts are shown with plain <img> tags. The signature and
 * expiry are the lock. Answers with a redirect to a 10-minute R2 link, so file bytes never
 * pass through Supabase.
 *   GET /file-link?b=private&k=<key>&e=<exp>&s=<sig>  → 302 to R2
 */
import { r2FromEnv } from "../_shared/objectStorage/r2Client.ts";
import { verifyFileLink } from "../_shared/objectStorage/fileLink.ts";

const DOWNLOAD_SECONDS = 600;

const text = (body: string, status: number) =>
  new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "HEAD") return text("GET only", 405);
  const secret = (Deno.env.get("FILE_LINK_SECRET") || "").trim();
  if (!secret) return text("Not available", 503);

  const check = await verifyFileLink(new URL(req.url).searchParams, secret);
  if (!check.ok) {
    return check.reason === "expired" ? text("This link has expired", 410) : text("Not found", 404);
  }

  try {
    const target = await r2FromEnv().presignDownload("private", check.key, DOWNLOAD_SECONDS);
    return new Response(null, {
      status: 302,
      headers: {
        Location: target,
        // Browsers may reuse the redirect for a few minutes; it stays inside the 10-minute R2 link.
        "Cache-Control": "private, max-age=300",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (e) {
    console.error("[file-link] presign failed:", e instanceof Error ? e.message : String(e));
    return text("Not available", 503);
  }
});
