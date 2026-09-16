/**
 * Fleet edge kernel — every fleet function (and the monolith) must boot via createFleetFunction.
 * See docs/adr/0020-fleet-edge-kernel.md.
 *
 * Hono runtime: npm:hono@4.3.11 only (mounts _fleet-server controllers).
 */
import { Hono } from "npm:hono@4.3.11";
import type { Context, Next } from "npm:hono@4.3.11";
import { applyCorsNpm } from "./corsAllowlistNpm.ts";

export type FleetPathStyle = "slug" | "monolith";

export type CreateFleetFunctionOpts = {
  /** Edge function slug, e.g. fleet-fuel or make-server-37f42386 */
  slug: string;
  /**
   * slug: basePath(`/${slug}`) + strip /functions/v1/{slug}
   * monolith: legacy make-server path rewrites (admin/ledger prefixes)
   */
  pathStyle?: FleetPathStyle;
  /** Mounted domain controller (extracted functions) */
  domainApp?: Hono;
  /** Register service-role /internal/* and other parent routes before domain mount */
  registerParentRoutes?: (app: Hono) => void;
  /** Skip Deno.serve (tests / compose) */
  serve?: boolean;
};

function isConnectionError(err: unknown): boolean {
  const e = err as { message?: string; name?: string; code?: string };
  const msg = e?.message ?? "";
  const name = e?.name ?? "";
  return (
    msg.includes("connection closed") ||
    msg.includes("broken pipe") ||
    msg.includes("message completed") ||
    name === "Http" ||
    name === "BrokenPipe" ||
    name === "BadResource" ||
    e?.code === "ECONNRESET" ||
    e?.code === "EPIPE"
  );
}

/** Path rewrite parity with historical make-server gateway quirks. */
export function normalizeMonolithPathname(pathname: string): string {
  if (pathname.startsWith("/functions/v1/make-server-37f42386")) {
    return pathname.slice("/functions/v1".length) || "/make-server-37f42386";
  }
  if (
    pathname === "/make-server-37f42386" ||
    pathname.startsWith("/make-server-37f42386/")
  ) {
    return pathname;
  }
  if (pathname.startsWith("/admin/")) {
    return `/make-server-37f42386${pathname}`;
  }
  if (pathname === "/api-center" || pathname.startsWith("/api-center/")) {
    return `/make-server-37f42386${pathname}`;
  }
  if (
    pathname.startsWith("/ledger/") ||
    pathname.startsWith("/toll-reconciliation/") ||
    pathname.startsWith("/diagnostic/")
  ) {
    return `/make-server-37f42386${pathname}`;
  }
  return pathname;
}

export function normalizeSlugPathname(slug: string, pathname: string): string {
  const prefix = `/functions/v1/${slug}`;
  if (pathname.startsWith(prefix)) {
    return pathname.slice("/functions/v1".length) || `/${slug}`;
  }
  return pathname;
}

function maintenanceExempt(path: string): boolean {
  return (
    path.includes("/admin/") ||
    path.includes("/login") ||
    path.includes("/signup") ||
    path.includes("/platform-status") ||
    path.includes("/platform-feature-flags") ||
    path.includes("/health") ||
    path.includes("/ready") ||
    path.includes("/internal/")
  );
}

/**
 * Build a fleet Hono app with platform middleware in fixed order.
 * Domain routes must be registered via domainApp / registerParentRoutes / returned app
 * AFTER createFleetFunction returns (callers that register later still get middleware
 * because middleware is installed first on the parent).
 */
export function createFleetFunction(opts: CreateFleetFunctionOpts): Hono {
  const slug = opts.slug;
  const pathStyle: FleetPathStyle = opts.pathStyle ?? "slug";
  const app =
    pathStyle === "slug" ? new Hono().basePath(`/${slug}`) : new Hono();

  // 1. Path normalization
  app.use("*", async (c, next) => {
    const url = new URL(c.req.url);
    const fixed =
      pathStyle === "monolith"
        ? normalizeMonolithPathname(url.pathname)
        : normalizeSlugPathname(slug, url.pathname);
    if (fixed !== url.pathname) {
      url.pathname = fixed;
      return app.fetch(new Request(url.toString(), c.req.raw));
    }
    await next();
  });

  // 2. CORS (union defaults)
  applyCorsNpm(app);

  // 3. Correlation / request ID
  app.use("*", async (c, next) => {
    const incoming =
      c.req.header("X-Request-Id") ||
      c.req.header("x-request-id") ||
      crypto.randomUUID();
    c.set("requestId" as never, incoming as never);
    await next();
    try {
      c.res.headers.set("X-Request-Id", String(incoming));
    } catch {
      /* response may be locked */
    }
  });

  // 4. Error boundary + payload logging
  app.use("*", async (c, next) => {
    const start = Date.now();
    try {
      await next();
    } catch (err: unknown) {
      if (isConnectionError(err)) {
        console.warn(
          `[Network] Client disconnected prematurely: ${(err as Error).message || (err as Error).name}`,
        );
        return;
      }
      console.error(
        `[Fatal Error] Request crashed: ${(err as Error).message ?? err}`,
      );
      try {
        return c.json({ error: "Server Error: Internal failure" }, 500);
      } catch {
        return;
      }
    }
    const ms = Date.now() - start;
    try {
      const status = c.res?.status;
      const len = c.res?.headers?.get("Content-Length");
      if (len && parseInt(len, 10) > 1024 * 1024) {
        console.warn(
          `[Heavy Payload] ${c.req.method} ${c.req.path} - ${len} bytes - ${ms}ms`,
        );
      } else if (status && status >= 400) {
        console.log(`[Error] ${c.req.method} ${c.req.path} - ${status} - ${ms}ms`);
      }
    } catch {
      /* ignore logging errors */
    }
  });

  // 5. Maintenance-mode gate (fail-open on settings read errors)
  app.use("*", async (c, next) => {
    if (maintenanceExempt(c.req.path)) {
      return next();
    }
    try {
      const { resolveProductLine } = await import(
        "../_fleet-server/product_line.ts"
      );
      const { getPlatformSettingsCached } = await import(
        "../_fleet-server/platform_settings.ts"
      );
      const productLine = resolveProductLine(c);
      const settings = await getPlatformSettingsCached(productLine);
      if (settings.maintenanceMode === true) {
        return c.json(
          {
            error: "Platform is under maintenance. Please try again later.",
            maintenanceMode: true,
            maintenanceMessage:
              settings.maintenanceMessage ||
              "We're performing scheduled maintenance. Back soon!",
          },
          503,
        );
      }
    } catch (e: unknown) {
      console.log(
        `[MaintenanceMiddleware] Error reading settings, failing open: ${(e as Error).message}`,
      );
    }
    return next();
  });

  // 6. Health / ready
  app.get("/health", (c) => c.json({ service: slug, status: "ok" }));
  app.get("/ready", (c) => c.json({ service: slug, status: "ready" }));

  // 7. Service-role guard for /internal/* (parent-level; domain may also check)
  app.use("/internal/*", async (c, next) => {
    const auth = c.req.header("Authorization") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "").trim();
    if (!serviceKey || token !== serviceKey) {
      return c.json({ error: "unauthorized" }, 401);
    }
    await next();
  });

  opts.registerParentRoutes?.(app);

  // 8. Domain app
  if (opts.domainApp) {
    app.route("/", opts.domainApp);
  }

  if (opts.serve !== false) {
    Deno.serve(
      {
        onError: (e) => {
          if (isConnectionError(e)) {
            return new Response(null, { status: 499 });
          }
          console.error(e);
          return new Response("Internal Server Error", { status: 500 });
        },
      },
      app.fetch,
    );
  }

  return app;
}

/** Lint/helpers: detect hand-rolled Hono in mains */
export function assertKernelOnly(_c?: Context, _n?: Next): void {
  /* marker for tooling */
}
