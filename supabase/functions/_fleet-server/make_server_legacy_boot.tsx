/**
 * Fleet monolith boot — F0 thin entry: kernel + registerResidualMonolithRoutes + Deno.serve.
 * See register_residual_monolith_routes.tsx for handlers (ADR-0021 / audit C1).
 */
import { createFleetFunction } from "../_shared/edgeKernel.ts";
import { assertRequiredEnv } from "./env_boot.ts";
import * as kv from "./kv_store.tsx";
import * as memCache from "./memory_cache.ts";
import { registerResidualMonolithRoutes } from "./register_residual_monolith_routes.tsx";

assertRequiredEnv();

const app = createFleetFunction({
  slug: "make-server-37f42386",
  pathStyle: "monolith",
  serve: false,
});

registerResidualMonolithRoutes(app);

// Global handler for unhandled promise rejections caused by client disconnects.
// Deno.serve's `onError` only catches errors thrown INSIDE the handler.
// Broken-pipe errors during response body streaming (`respondWith`) surface as
// unhandled rejections at the runtime level — suppress them here so they don't
// pollute the logs.
// ---------------------------------------------------------------------------
globalThis.addEventListener("unhandledrejection", (e) => {
  const err = e.reason;
  const msg = err instanceof Error ? err.message : String(err);
  const name = (err as any)?.name || "";
  const code = (err as any)?.code || "";

  const isConnectionError =
    msg.includes("broken pipe") ||
    msg.includes("connection closed") ||
    msg.includes("connection reset") ||
    msg.includes("message completed") ||
    name === "Http" ||
    name === "BrokenPipe" ||
    name === "BadResource" ||
    code === "EPIPE" ||
    code === "ECONNRESET";

  if (isConnectionError) {
    e.preventDefault(); // Suppress — client simply disconnected
    return;
  }
  // Let other unhandled rejections propagate normally
});

// ---------------------------------------------------------------------------
// Cache Warming on Server Startup
// Pre-loads critical data into memory cache for instant first-request performance
// ---------------------------------------------------------------------------
async function warmCache() {
  try {
    console.log("[MemoryCache] Warming cache on startup...");
    
    // Pre-load parent companies
    const companies = await kv.get("parent_companies");
    memCache.parentCompanyCache.set("parent_companies", companies || [], 5 * 60 * 1000);
    console.log(`[MemoryCache] Preloaded ${(companies || []).length} parent companies`);
    
    // Log cache stats
    console.log("[MemoryCache] Cache stats:", memCache.parentCompanyCache.getStats());
  } catch (e: any) {
    // Phase 7-8 fix: Improved error logging for network issues
    const errorType = e.name || e.constructor?.name || 'Unknown';
    const errorMsg = e.message || String(e);
    
    // TLS/connection errors are common on cold starts - they're safe to ignore
    if (errorMsg.includes('TLS') || errorMsg.includes('connection') || errorMsg.includes('ECONNRESET')) {
      console.log("[MemoryCache] Cache warming skipped due to cold start network issue (non-critical, will retry on first request)");
    } else {
      console.error(`[MemoryCache] Cache warming failed (non-critical): ${errorType}: ${errorMsg}`);
    }
  }
}

// Warm cache on startup (async, non-blocking)
warmCache().catch(e => console.error("[MemoryCache] Startup cache warm failed:", e));

Deno.serve({
  onError: (e) => {
    const msg = e instanceof Error ? e.message : String(e);
    const name = (e as any)?.name || '';
    const isConnectionError =
        msg.includes("broken pipe") ||
        msg.includes("connection closed") ||
        msg.includes("message completed") ||
        name === "Http" ||
        name === "BrokenPipe" ||
        name === "BadResource" ||
        (e as any).code === "EPIPE" ||
        (e as any).code === "ECONNRESET";

    if (isConnectionError) {
        // Silently handle client disconnects — this is normal when responses
        // are large or the client navigates away before transfer completes.
        return new Response(null, { status: 499 });
    }
    console.error(e);
    return new Response("Internal Server Error", { status: 500 });
  }
}, app.fetch);

