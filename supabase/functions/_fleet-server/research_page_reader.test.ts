import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  backoffMinutes,
  checkUrlShape,
  isPrivateAddress,
  MAX_BODY_BYTES,
  readSourcePage,
  type ReaderDeps,
  RESEARCH_USER_AGENT,
  shouldBlock,
  type SiteState,
} from "./research_page_reader.ts";

type Fake = ReaderDeps & {
  saved: Record<string, unknown>[];
  blocked: string[];
  backoffs: Array<[string, string]>;
  fetched: Array<{ url: string; ua: string | null; redirect?: string }>;
};

function fakeDeps(opts: {
  sites?: Record<string, SiteState["automated_read"]>;
  backoff?: Record<string, string>;
  ips?: Record<string, string[]>;
  responses: Array<(url: string) => Response>;
  lastStatus?: number | null;
}): Fake {
  const queue = [...opts.responses];
  const fake: Fake = {
    saved: [],
    blocked: [],
    backoffs: [],
    fetched: [],
    fetchImpl: ((url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      const h = new Headers(init?.headers);
      fake.fetched.push({ url: u, ua: h.get("user-agent"), redirect: init?.redirect });
      const next = queue.shift();
      if (!next) throw new Error("no more fake responses");
      return Promise.resolve(next(u));
    }) as typeof fetch,
    resolveIps: (host: string) => Promise.resolve(opts.ips?.[host] ?? ["203.0.113.10"]),
    now: () => new Date("2026-11-21T00:00:00Z"),
    getSite: (domain: string) => {
      const ar = (opts.sites ?? { "jnbk-brakes.com": "allowed" })[domain];
      return Promise.resolve(ar ? { domain, automated_read: ar, backoff_until: opts.backoff?.[domain] ?? null } : null);
    },
    lastStatusFor: () => Promise.resolve(opts.lastStatus ?? null),
    saveRead: (row) => {
      fake.saved.push(row);
      return Promise.resolve(`read-${fake.saved.length}`);
    },
    markBlocked: (domain) => {
      fake.blocked.push(domain);
      return Promise.resolve();
    },
    setBackoff: (domain, until) => {
      fake.backoffs.push([domain, until]);
      return Promise.resolve();
    },
  };
  return fake;
}

const ok = (body = "<tr><td>PN-1</td><td>M900A</td></tr>") => () => new Response(body, { status: 200 });

Deno.test("reader: reads an allowed https page, saves it, and identifies itself honestly", async () => {
  const deps = fakeDeps({ responses: [ok()] });
  const out = await readSourcePage({ url: "https://www.jnbk-brakes.com/catalogue/x", purpose: "job", jobId: "j1" }, deps);
  assertEquals(out.kind, "ok");
  if (out.kind === "ok") {
    assertEquals(out.readId, "read-1");
    assert(out.body.includes("M900A"));
    assertEquals(out.bodyHash.length, 64);
  }
  assertEquals(deps.fetched[0].ua, RESEARCH_USER_AGENT);
  assert(!deps.fetched[0].ua!.includes("Mozilla"), "must not pretend to be a browser");
  assertEquals(deps.fetched[0].redirect, "manual");
  assertEquals(deps.saved[0].domain, "jnbk-brakes.com");
  assertEquals(deps.saved[0].job_id, "j1");
});

Deno.test("reader: refuses http, IP hosts, odd ports, untrusted, blocked and unchecked sites without fetching", async () => {
  const deps = fakeDeps({
    sites: { "jnbk-brakes.com": "allowed", "amayama.com": "blocked", "new-site.com": "not_checked" },
    responses: [],
  });
  const cases: Array<[string, string]> = [
    ["http://www.jnbk-brakes.com/x", "https_only"],
    ["https://169.254.169.254/latest/meta-data", "ip_address_host"],
    ["https://www.jnbk-brakes.com:8443/x", "non_standard_port"],
    ["https://evil.example.com/x", "not_a_trusted_site"],
    ["https://amayama.com/x", "site_blocked"],
    ["https://new-site.com/x", "site_not_checked"],
  ];
  for (const [url, reason] of cases) {
    const out = await readSourcePage({ url, purpose: "job" }, deps);
    assertEquals(out, { kind: "refused", reason }, url);
  }
  assertEquals(deps.fetched.length, 0);
});

Deno.test("reader: a trusted name that resolves to a private address is refused", async () => {
  const deps = fakeDeps({ ips: { "www.jnbk-brakes.com": ["10.0.0.5"] }, responses: [] });
  const out = await readSourcePage({ url: "https://www.jnbk-brakes.com/x", purpose: "job" }, deps);
  assertEquals(out, { kind: "refused", reason: "private_address" });
  assertEquals(deps.fetched.length, 0);
});

Deno.test("reader: redirects are re-checked hop by hop", async () => {
  const toMeta = fakeDeps({
    responses: [() => new Response(null, { status: 302, headers: { location: "https://169.254.169.254/x" } })],
  });
  assertEquals(
    await readSourcePage({ url: "https://www.jnbk-brakes.com/x", purpose: "job" }, toMeta),
    { kind: "refused", reason: "redirect_ip_address_host" },
  );
  const toOther = fakeDeps({
    responses: [() => new Response(null, { status: 301, headers: { location: "https://evil.example.com/" } })],
  });
  assertEquals(
    await readSourcePage({ url: "https://www.jnbk-brakes.com/x", purpose: "job" }, toOther),
    { kind: "refused", reason: "redirect_to_untrusted_site" },
  );
  const sameSite = fakeDeps({
    responses: [() => new Response(null, { status: 301, headers: { location: "/catalogue/y" } }), ok()],
  });
  const out = await readSourcePage({ url: "https://www.jnbk-brakes.com/x", purpose: "job" }, sameSite);
  assertEquals(out.kind, "ok");
  if (out.kind === "ok") assertEquals(out.finalUrl, "https://www.jnbk-brakes.com/catalogue/y");
});

Deno.test("reader: one 403 fails the read; a second 403 in a row blocks the site", async () => {
  const first = fakeDeps({ lastStatus: 200, responses: [() => new Response("no", { status: 403 })] });
  assertEquals((await readSourcePage({ url: "https://www.jnbk-brakes.com/x", purpose: "job" }, first)).kind, "failed");
  assertEquals(first.blocked.length, 0);

  const second = fakeDeps({ lastStatus: 403, responses: [() => new Response("no", { status: 403 })] });
  assertEquals((await readSourcePage({ url: "https://www.jnbk-brakes.com/x", purpose: "job" }, second)).kind, "blocked");
  assertEquals(second.blocked, ["jnbk-brakes.com"]);
});

Deno.test("reader: 429 backs off and never blocks", async () => {
  const deps = fakeDeps({
    lastStatus: 429,
    responses: [() => new Response("slow down", { status: 429, headers: { "retry-after": "120" } })],
  });
  const out = await readSourcePage({ url: "https://www.jnbk-brakes.com/x", purpose: "job" }, deps);
  assertEquals(out.kind, "deferred");
  assertEquals(deps.blocked.length, 0);
  assertEquals(deps.backoffs[0], ["jnbk-brakes.com", "2026-11-21T00:02:00.000Z"]);

  const backingOff = fakeDeps({ backoff: { "jnbk-brakes.com": "2026-11-21T00:10:00Z" }, responses: [] });
  assertEquals((await readSourcePage({ url: "https://www.jnbk-brakes.com/x", purpose: "job" }, backingOff)).kind, "deferred");
  assertEquals(backingOff.fetched.length, 0);
});

Deno.test("reader: recipe tests never block a site", async () => {
  const deps = fakeDeps({ lastStatus: 403, responses: [() => new Response("no", { status: 403 })] });
  const out = await readSourcePage({ url: "https://www.jnbk-brakes.com/x", purpose: "recipe_test" }, deps);
  assertEquals(out.kind, "failed");
  assertEquals(deps.blocked.length, 0);
  assertEquals(deps.saved[0].purpose, "recipe_test");
});

Deno.test("reader: bodies over 2 MB are refused", async () => {
  const deps = fakeDeps({ responses: [() => new Response("x".repeat(MAX_BODY_BYTES + 10), { status: 200 })] });
  const out = await readSourcePage({ url: "https://www.jnbk-brakes.com/x", purpose: "job" }, deps);
  assertEquals(out, { kind: "failed", reason: "body_too_large", httpStatus: 200 });
});

Deno.test("reader helpers: private ranges, retry-after, block rule, url shape", () => {
  for (const ip of ["10.1.2.3", "127.0.0.1", "169.254.169.254", "172.20.0.1", "192.168.1.1", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) {
    assert(isPrivateAddress(ip), ip);
  }
  for (const ip of ["203.0.113.10", "8.8.8.8", "172.32.0.1", "2606:4700::1111"]) {
    assert(!isPrivateAddress(ip), ip);
  }
  const now = new Date("2026-11-21T00:00:00Z");
  assertEquals(backoffMinutes(null, now), 15);
  assertEquals(backoffMinutes("30", now), 1);
  assertEquals(backoffMinutes("Sat, 21 Nov 2026 00:10:00 GMT", now), 10);
  assertEquals(shouldBlock(403, 403), true);
  assertEquals(shouldBlock(401, 403), true);
  assertEquals(shouldBlock(200, 403), false);
  assertEquals(shouldBlock(429, 429), false);
  assertEquals(checkUrlShape("https://user:pw@sbparts.jp/").ok, false);
});

Deno.test("grounding redirects: asks Google where the link leads, without reading the target", async () => {
  const { resolveGroundingRedirect } = await import("./research_page_reader.ts");
  const calls: string[] = [];
  const fake = ((url: string | URL | Request) => {
    calls.push(String(url));
    return Promise.resolve(new Response(null, { status: 302, headers: { location: "https://www.jnbk-brakes.com/catalogue/m900a" } }));
  }) as typeof fetch;
  assertEquals(
    await resolveGroundingRedirect("https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc", fake),
    "https://www.jnbk-brakes.com/catalogue/m900a",
  );
  assertEquals(calls.length, 1);
  assertEquals(await resolveGroundingRedirect("https://sbparts.jp/x", fake), "https://sbparts.jp/x");
  assertEquals(await resolveGroundingRedirect("http://vertexaisearch.cloud.google.com/x", fake), null);
  assertEquals(calls.length, 1, "non-redirect links are not fetched");
});
