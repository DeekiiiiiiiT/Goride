/**
 * The research engine's only page reader (docs/research-engine-audit.md RE-01 / RE-20 / RE-21).
 *
 * Rules:
 * - Reads only https pages on a trusted_site whose automated_read = 'allowed' (and not backing off).
 * - Identifies itself honestly (never a browser disguise) and never goes around a block.
 * - Refuses private / loopback / link-local / metadata addresses; re-checks every redirect hop (max 3).
 * - Caps: 2 MB body, 15 s.
 * - A form recipe (RE-30) posts its fields once, as a normal form would; a 301/302/303 answer is then read with GET.
 *   307/308 (which would re-post the form) are refused.
 * - 401/403 twice in a row → the site becomes 'blocked' (its items go to owner browser checks).
 * - 429 → back off (Retry-After, else 15 min); the read is deferred, the site stays allowed.
 * - Every completed read (and every recipe test) is saved append-only in research_page_read.
 */
import { getServiceClient } from "./service_client.ts";

export const RESEARCH_USER_AGENT = "RoamResearchBot/1.0 (+https://roamfleet.co; parts reference lookups)";
export const MAX_BODY_BYTES = 2 * 1024 * 1024;
export const READ_TIMEOUT_MS = 15_000;
export const MAX_REDIRECTS = 3;
export const DEFAULT_BACKOFF_MINUTES = 15;

export type ReadPurpose = "job" | "recipe_test" | "recheck";

export type SiteState = {
  domain: string;
  automated_read: "allowed" | "blocked" | "not_checked";
  backoff_until: string | null;
};

export type ReadOutcome =
  | { kind: "ok"; readId: string | null; url: string; finalUrl: string; httpStatus: number; body: string; bodyHash: string }
  | { kind: "refused"; reason: string }
  | { kind: "deferred"; reason: "rate_limited"; until: string }
  | { kind: "blocked"; reason: string; httpStatus: number }
  | { kind: "failed"; reason: string; httpStatus: number };

export type ReaderDeps = {
  fetchImpl: typeof fetch;
  resolveIps: (host: string) => Promise<string[]>;
  now: () => Date;
  getSite: (domain: string) => Promise<SiteState | null>;
  /** HTTP status of the most recent saved read on this domain (null when none). */
  lastStatusFor: (domain: string) => Promise<number | null>;
  saveRead: (row: Record<string, unknown>) => Promise<string | null>;
  markBlocked: (domain: string, note: string) => Promise<void>;
  setBackoff: (domain: string, untilIso: string) => Promise<void>;
  bumpPagesConfirmed?: (domain: string) => Promise<void>;
};

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

/** lower-case host without a leading "www." — the trusted_site key. */
export function siteDomain(host: string): string {
  return host.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

export function isIpLiteral(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "");
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(":");
}

/** True for any address the reader must never touch (private, loopback, link-local, metadata, CGNAT, unspecified). */
export function isPrivateAddress(ip: string): boolean {
  const a = ip.replace(/^\[|\]$/g, "").toLowerCase();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(a)) {
    const [p, q] = a.split(".").map(Number);
    if (p === 10 || p === 127 || p === 0) return true;
    if (p === 169 && q === 254) return true; // link-local + cloud metadata
    if (p === 172 && q >= 16 && q <= 31) return true;
    if (p === 192 && q === 168) return true;
    if (p === 100 && q >= 64 && q <= 127) return true; // CGNAT
    if (p >= 224) return true; // multicast / reserved
    return false;
  }
  if (a === "::" || a === "::1") return true;
  if (a.startsWith("fc") || a.startsWith("fd")) return true; // unique local
  if (a.startsWith("fe8") || a.startsWith("fe9") || a.startsWith("fea") || a.startsWith("feb")) return true; // link-local
  const mapped = a.match(/^::ffff:(\d{1,3}(\.\d{1,3}){3})$/);
  if (mapped) return isPrivateAddress(mapped[1]);
  return false;
}

/** Retry-After as seconds or an HTTP date → minutes to wait (default 15, at most 24 h). */
export function backoffMinutes(retryAfter: string | null, now: Date): number {
  if (!retryAfter) return DEFAULT_BACKOFF_MINUTES;
  const secs = Number(retryAfter);
  if (Number.isFinite(secs) && secs >= 0) return Math.min(24 * 60, Math.max(1, Math.ceil(secs / 60)));
  const when = Date.parse(retryAfter);
  if (Number.isFinite(when)) return Math.min(24 * 60, Math.max(1, Math.ceil((when - now.getTime()) / 60_000)));
  return DEFAULT_BACKOFF_MINUTES;
}

/** Block only on a second refusal (401/403) in a row; 429 never blocks. */
export function shouldBlock(previousStatus: number | null, status: number): boolean {
  const refusal = (s: number | null) => s === 401 || s === 403;
  return refusal(status) && refusal(previousStatus);
}

export function checkUrlShape(raw: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "not_a_url" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "https_only" };
  if (url.username || url.password) return { ok: false, reason: "credentials_in_url" };
  if (isIpLiteral(url.hostname)) return { ok: false, reason: "ip_address_host" };
  if (url.port && url.port !== "443") return { ok: false, reason: "non_standard_port" };
  return { ok: true, url };
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error("body_too_large");
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    all.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

// ---------------------------------------------------------------------------
// The reader
// ---------------------------------------------------------------------------

export async function readSourcePage(
  input: {
    url: string;
    purpose: ReadPurpose;
    jobId?: string | null;
    recipeId?: string | null;
    /** Form fields to post to `url` (application/x-www-form-urlencoded, already encoded). */
    form?: string | null;
  },
  deps: ReaderDeps = defaultReaderDeps(),
): Promise<ReadOutcome> {
  const shape = checkUrlShape(input.url);
  if (!shape.ok) return { kind: "refused", reason: shape.reason };

  let current = shape.url;
  const startDomain = siteDomain(current.hostname);
  const site = await deps.getSite(startDomain);
  if (!site) return { kind: "refused", reason: "not_a_trusted_site" };
  if (site.automated_read !== "allowed") return { kind: "refused", reason: `site_${site.automated_read}` };
  if (site.backoff_until && Date.parse(site.backoff_until) > deps.now().getTime()) {
    return { kind: "deferred", reason: "rate_limited", until: site.backoff_until };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), READ_TIMEOUT_MS);
  // Only the first request posts; every redirect after it is a plain GET.
  let form: string | null = input.form ? input.form : null;
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      // Every hop: https, an allowed trusted site, and only public addresses.
      const hopShape = checkUrlShape(current.toString());
      if (!hopShape.ok) return { kind: "refused", reason: `redirect_${hopShape.reason}` };
      const hopDomain = siteDomain(current.hostname);
      if (hopDomain !== startDomain) {
        const hopSite = await deps.getSite(hopDomain);
        if (!hopSite || hopSite.automated_read !== "allowed") {
          return { kind: "refused", reason: "redirect_to_untrusted_site" };
        }
      }
      let ips: string[];
      try {
        ips = await deps.resolveIps(current.hostname);
      } catch {
        return { kind: "failed", reason: "dns_failed", httpStatus: 0 };
      }
      if (ips.length === 0) return { kind: "failed", reason: "dns_empty", httpStatus: 0 };
      if (ips.some(isPrivateAddress)) return { kind: "refused", reason: "private_address" };

      const headers: Record<string, string> = {
        "User-Agent": RESEARCH_USER_AGENT,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
      };
      if (form !== null) headers["Content-Type"] = "application/x-www-form-urlencoded";
      const res = await deps.fetchImpl(current.toString(), {
        method: form !== null ? "POST" : "GET",
        redirect: "manual",
        signal: ctrl.signal,
        headers,
        ...(form !== null ? { body: form } : {}),
      });

      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        await res.body?.cancel();
        if (form !== null && (res.status === 307 || res.status === 308)) {
          return { kind: "refused", reason: "redirect_would_repost_form" };
        }
        form = null;
        current = new URL(res.headers.get("location")!, current);
        continue;
      }

      const domain = siteDomain(current.hostname);
      if (res.status === 429) {
        await res.body?.cancel();
        const mins = backoffMinutes(res.headers.get("retry-after"), deps.now());
        const until = new Date(deps.now().getTime() + mins * 60_000).toISOString();
        await deps.setBackoff(domain, until);
        return { kind: "deferred", reason: "rate_limited", until };
      }

      const previous = await deps.lastStatusFor(domain);
      let body = "";
      if (res.ok) {
        try {
          body = await readCapped(res);
        } catch (e) {
          return { kind: "failed", reason: e instanceof Error ? e.message : "read_failed", httpStatus: res.status };
        }
      } else {
        await res.body?.cancel();
      }
      const bodyHash = body ? await sha256Hex(body) : null;
      const readId = await deps.saveRead({
        job_id: input.jobId ?? null,
        purpose: input.purpose,
        path: "direct",
        domain,
        url: input.url,
        final_url: current.toString(),
        http_status: res.status,
        recipe_id: input.recipeId ?? null,
        body_hash: bodyHash,
      });

      if (res.status === 401 || res.status === 403) {
        // Recipe tests never block a site (RE-21 round 2).
        if (input.purpose !== "recipe_test" && shouldBlock(previous, res.status)) {
          await deps.markBlocked(domain, `HTTP ${res.status} twice in a row`);
          return { kind: "blocked", reason: `http_${res.status}`, httpStatus: res.status };
        }
        return { kind: "failed", reason: `http_${res.status}`, httpStatus: res.status };
      }
      if (!res.ok) return { kind: "failed", reason: `http_${res.status}`, httpStatus: res.status };

      return {
        kind: "ok",
        readId,
        url: input.url,
        finalUrl: current.toString(),
        httpStatus: res.status,
        body,
        bodyHash: bodyHash || "",
      };
    }
    return { kind: "refused", reason: "too_many_redirects" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { kind: "failed", reason: ctrl.signal.aborted ? "timeout" : msg.slice(0, 200), httpStatus: 0 };
  } finally {
    clearTimeout(timer);
  }
}

/** Save the block (the evidence row of text) a recipe found, as its own append-only read row tied to the page read. */
export async function saveBlockEvidence(
  input: {
    pageRead: { readId: string | null; url: string; finalUrl: string; httpStatus: number; bodyHash: string };
    blockText: string;
    jobId?: string | null;
    recipeId?: string | null;
    purpose: ReadPurpose;
  },
  save: (row: Record<string, unknown>) => Promise<string | null> = defaultSaveRead,
): Promise<string | null> {
  return await save({
    job_id: input.jobId ?? null,
    purpose: input.purpose,
    path: "direct",
    domain: siteDomain(new URL(input.pageRead.finalUrl).hostname),
    url: input.pageRead.url,
    final_url: input.pageRead.finalUrl,
    http_status: input.pageRead.httpStatus,
    recipe_id: input.recipeId ?? null,
    block_text: input.blockText,
    block_hash: await sha256Hex(input.blockText),
    body_hash: input.pageRead.bodyHash || null,
  });
}

// ---------------------------------------------------------------------------
// Default (database) dependencies
// ---------------------------------------------------------------------------

async function defaultSaveRead(row: Record<string, unknown>): Promise<string | null> {
  const { data, error } = await getServiceClient().from("research_page_read").insert(row).select("id").single();
  if (error) throw new Error(`research_page_read insert: ${error.message}`);
  return (data as { id: string }).id;
}

async function defaultResolveIps(host: string): Promise<string[]> {
  const out: string[] = [];
  for (const type of ["A", "AAAA"] as const) {
    try {
      const rows = await Deno.resolveDns(host, type);
      out.push(...rows.map(String));
    } catch {
      // a missing record type is fine; an all-empty result is handled by the caller
    }
  }
  return out;
}

export function defaultReaderDeps(): ReaderDeps {
  const db = getServiceClient();
  return {
    fetchImpl: fetch,
    resolveIps: defaultResolveIps,
    now: () => new Date(),
    getSite: async (domain) => {
      const { data } = await db.from("trusted_site").select("domain, automated_read, backoff_until").eq("domain", domain)
        .maybeSingle();
      return (data as SiteState | null) ?? null;
    },
    lastStatusFor: async (domain) => {
      const { data } = await db.from("research_page_read").select("http_status").eq("domain", domain)
        .eq("path", "direct").neq("purpose", "recipe_test").order("read_at", { ascending: false }).limit(1).maybeSingle();
      return (data as { http_status: number | null } | null)?.http_status ?? null;
    },
    saveRead: defaultSaveRead,
    markBlocked: async (domain, note) => {
      const nowIso = new Date().toISOString();
      await db.from("trusted_site").update({
        automated_read: "blocked",
        blocked_at: nowIso,
        automated_read_note: note,
        updated_at: nowIso,
      }).eq("domain", domain);
    },
    setBackoff: async (domain, untilIso) => {
      await db.from("trusted_site").update({ backoff_until: untilIso, updated_at: new Date().toISOString() })
        .eq("domain", domain);
    },
    bumpPagesConfirmed: async (domain) => {
      await db.rpc("trusted_site_bump_pages_confirmed", { p_domain: domain });
    },
  };
}

export const GROUNDING_REDIRECT_HOST = "vertexaisearch.cloud.google.com";

/**
 * Google's grounding links point at its own redirect service. Ask Google where one leads (manual redirect, no body
 * read) without visiting the target; the target is then read — or not — by readSourcePage under the normal rules.
 */
export async function resolveGroundingRedirect(url: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.hostname !== GROUNDING_REDIRECT_HOST) return u.protocol === "https:" ? url : null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8_000);
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      redirect: "manual",
      signal: ctrl.signal,
      headers: { "User-Agent": RESEARCH_USER_AGENT },
    });
    await res.body?.cancel();
    const loc = res.headers.get("location");
    if (!loc) return null;
    const target = new URL(loc, url);
    return target.protocol === "https:" ? target.toString() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
