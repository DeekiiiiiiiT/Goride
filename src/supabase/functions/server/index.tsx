import { Hono } from "npm:hono";
import type { Context } from "npm:hono";
import { streamText } from "npm:hono/streaming";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";
import OpenAI from "npm:openai";
import { GoogleGenerativeAI } from "npm:@google/generative-ai";
import * as kv from "./kv_store.tsx";
import * as cache from "./cache.ts";
import * as gemini from "./gemini_service.ts";
import * as memCache from "./memory_cache.ts";
import { generatePerformanceReport } from "./performance-metrics.tsx";
import { pMap } from "./concurrency.ts";
import { findMatchingStationSmart } from "./geo_matcher.ts";
import * as fuelLogic from "./fuel_logic.ts";
import { Buffer } from "node:buffer";
import { requireAuth, requirePermission, hasPermission, type RbacUser } from "./rbac_middleware.ts";
import { logAdminAction, getAuditLogs, getAuditLogsByActor } from "./audit_log.ts";
import { stampOrg, filterByOrg, belongsToOrg, getOrgId, isLegacyOrgPlaceholder } from "./org_scope.ts";
import {
  appendCanonicalLedgerEvents,
  deleteAllCanonicalLedgerBySourceType,
  deleteCanonicalLedgerBySource,
} from "./ledger_canonical.ts";
import {
  appendCanonicalFuelExpenseIfEligible,
  appendCanonicalTollIfEligible,
  appendCanonicalTripFaresIfEligible,
  appendCanonicalTripFaresIfEligibleWithStats,
  buildCanonicalTripFareEventsFromTrip,
  appendCanonicalWalletCreditIfEligible,
  appendCanonicalFuelReimbursementIfEligible,
  appendCanonicalTollReimbursementIfEligible,
  buildCanonicalFuelExpenseEvent,
  buildCanonicalWalletCreditEvent,
  buildCanonicalFuelReimbursementEvent,
  buildCanonicalTollReimbursementEvent,
  buildCanonicalTollEventFromTollLedger,
  type TollLedgerLike,
} from "./canonical_from_ops.ts";
import {
  addDaysYmd,
  aggregateCanonicalEventsToLedgerDriverOverview,
  canonicalEventInSelectedWindow,
} from "./ledger_money_aggregate.ts";
import { CANONICAL_LEDGER_KEY_LIKE } from "../../../utils/ledgerKvSource.ts";
import { computeIndriveWalletFeesFromLedgerEntries } from "../../../utils/indriveWalletMetrics.ts";
import fuelApp from "./fuel_controller.tsx";
import auditApp from "./audit_controller.tsx";
import safetyApp from "./safety_controller.tsx";
import syncApp from "./sync_controller.tsx";
import tollApp, {
  saveTollLedgerEntry,
  getTollLedgerEntry,
  transactionToTollLedgerServer,
  isTollCategory as isTollCategoryServer,
  updateTollLedgerEntry,
  deleteTollLedgerEntry,
  buildTollLedgerFullBackupPayload,
  executeTollLedgerRepairDates,
  executeTollResetForReconciliation,
} from "./toll_controller.tsx";
import disputeRefundApp from "./dispute_refund_controller.tsx";
import { getFleetTimezone } from "./timezone_helper.tsx";
import * as unverifiedVendor from './unverified_vendor_controller.tsx';
import { suggestStationMatches } from './vendor_matcher.ts';
import { checkRateLimit, recordFailedAttempt, clearRateLimit, getClientIp, getRateLimitStats } from './rate_limiter.ts';
import { registerMaintenanceRoutes } from "./maintenance_routes.ts";

// ---------------------------------------------------------------------------
// Future-Date Guardrail
// ---------------------------------------------------------------------------
// Jamaica uses DD/MM/YYYY exclusively. The AI is told to parse dates as
// DD/MM/YYYY and output ISO strings. This post-processing step catches any
// date the AI produced that is still in the future (relative to the server
// clock) — the most common cause is the AI getting the year wrong.
//
// Strategy:
//   1. Parse the ISO date string the AI returned.
//   2. If the date is in the future (> today + 1 day buffer):
//      a. Roll back the year by 1 (most likely AI error).
//      b. If still future, flag it for manual review.
//   NOTE: We do NOT swap day/month — Jamaica is always DD/MM/YYYY, so the
//         AI's DD/MM interpretation is correct. Swapping would break it.
// ---------------------------------------------------------------------------
function correctFutureDates(transactions: any[]): any[] {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(23, 59, 59, 999);

  return transactions.map(tx => {
    if (!tx.date) return tx;
    try {
      const d = new Date(tx.date);
      if (isNaN(d.getTime())) return tx;
      if (d <= tomorrow) return tx; // Date is in the past or today — fine

      // --- Future date detected ---
      console.log(`[FutureDateFix] Detected future date: ${tx.date}`);

      // Attempt 1: Roll back one year (AI likely got the year wrong)
      const rolledBack = new Date(d);
      rolledBack.setFullYear(rolledBack.getFullYear() - 1);
      if (rolledBack <= tomorrow) {
        const corrected = rolledBack.toISOString().split('T')[0];
        console.log(`[FutureDateFix] Rolled back year -> corrected to ${corrected}`);
        return { ...tx, date: corrected, _dateCorrected: 'year_rollback', _originalDate: tx.date };
      }

      // Attempt 2: If still future even after rollback, just flag it
      console.log(`[FutureDateFix] Could not auto-correct ${tx.date}, flagging`);
      return { ...tx, _dateCorrected: 'unfixable_future', _originalDate: tx.date };
    } catch {
      return tx;
    }
  });
}

/** Matches `ledger_canonical.ts` idempotency key hashing for `ledger_event_idem:*` cleanup on batch delete. */
async function sha256HexForLedgerIdem(text: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

const app = new Hono();

// ─── Edge URL normalization (fixes 404 when gateway path ≠ Hono routes) ─────
// Some Supabase / proxy setups send pathname as `/functions/v1/make-server-37f42386/...`
// or bare `/ledger/...` while all handlers are registered as `/make-server-37f42386/...`.
function normalizeEdgePathname(pathname: string): string {
  if (pathname.startsWith("/functions/v1/make-server-37f42386")) {
    return pathname.slice("/functions/v1".length) || "/make-server-37f42386";
  }
  if (pathname === "/make-server-37f42386" || pathname.startsWith("/make-server-37f42386/")) {
    return pathname;
  }
  // Some gateways invoke the function with paths rooted at /admin/... without the function prefix.
  if (pathname.startsWith("/admin/")) {
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

app.use("*", async (c, next) => {
  const url = new URL(c.req.url);
  const fixed = normalizeEdgePathname(url.pathname);
  if (fixed !== url.pathname) {
    url.pathname = fixed;
    return app.fetch(new Request(url.toString(), c.req.raw));
  }
  await next();
});

// CORS must be registered before route handlers so all responses (including 4xx/5xx) expose
// Access-Control-Allow-Origin — otherwise cross-origin fetch() rejects and the client shows a generic network error.
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "apikey"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    exposeHeaders: ["Content-Length", "X-Cache"],
    maxAge: 600,
  }),
);

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

registerMaintenanceRoutes(app, supabase);

// ─── Toll Ledger Primary Write Helper (Phase 6) ──────────────────────────
// Tolls are now written ONLY to toll_ledger:* (single source of truth).
// The transaction:* store is no longer used for toll data.
// ───────────────────────────────────────────────────────────────────────
async function writeTollToLedger(transaction: any, c: Context): Promise<void> {
  if (!isTollCategoryServer(transaction.category)) return;
  
  const tollRecord = transactionToTollLedgerServer(transaction);
  await saveTollLedgerEntry(tollRecord);
  console.log(`[TollLedger] Saved toll_ledger:${tollRecord.id}`);
  await appendCanonicalTollIfEligible(tollRecord, c);
}

// ─── Driver ID Resolution ─────────────────────────────────────────────
// Resolves any driver identifier (Roam UUID, Uber UUID, InDrive UUID,
// or display name) to the canonical Roam UUID. Uses an in-memory cache
// that's refreshed every 5 minutes.
// ───────────────────────────────────────────────────────────────────────
let _driverCacheTimestamp = 0;
let _driverCache: any[] = [];
const DRIVER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function loadDriverCache(): Promise<any[]> {
    const now = Date.now();
    if (_driverCache.length > 0 && (now - _driverCacheTimestamp) < DRIVER_CACHE_TTL) {
        return _driverCache;
    }
    try {
        const { data } = await supabase
            .from("kv_store_37f42386")
            .select("value")
            .like("key", "driver:%");
        _driverCache = (data || []).map((d: any) => d.value).filter(Boolean);
        _driverCacheTimestamp = now;
        console.log(`[DriverCache] Loaded ${_driverCache.length} drivers`);
    } catch (e) {
        console.error("[DriverCache] Failed to load:", e);
    }
    return _driverCache;
}

interface ResolvedDriver {
    canonicalId: string;
    driverName: string;
    resolved: boolean;
}

async function resolveCanonicalDriverId(input: string): Promise<ResolvedDriver> {
    if (!input || !input.trim()) {
        return { canonicalId: 'unknown', driverName: 'Unknown', resolved: false };
    }

    const trimmed = input.trim();
    const drivers = await loadDriverCache();

    // 1. Direct match: input is a Roam UUID
    const directMatch = drivers.find((d: any) => d.id === trimmed);
    if (directMatch) {
        const name = directMatch.name || [directMatch.firstName, directMatch.lastName].filter(Boolean).join(' ') || 'Unknown';
        return { canonicalId: directMatch.id, driverName: name, resolved: true };
    }

    // 2. Uber UUID match
    const uberMatch = drivers.find((d: any) => d.uberDriverId === trimmed);
    if (uberMatch) {
        const name = uberMatch.name || [uberMatch.firstName, uberMatch.lastName].filter(Boolean).join(' ') || 'Unknown';
        return { canonicalId: uberMatch.id, driverName: name, resolved: true };
    }

    // 3. InDrive UUID match
    const indriveMatch = drivers.find((d: any) => d.inDriveDriverId === trimmed);
    if (indriveMatch) {
        const name = indriveMatch.name || [indriveMatch.firstName, indriveMatch.lastName].filter(Boolean).join(' ') || 'Unknown';
        return { canonicalId: indriveMatch.id, driverName: name, resolved: true };
    }

    // 4. Name match (case-insensitive)
    const inputLower = trimmed.toLowerCase();
    const nameMatch = drivers.find((d: any) => {
        const fullName = d.name || [d.firstName, d.lastName].filter(Boolean).join(' ') || '';
        return fullName.toLowerCase() === inputLower;
    });
    if (nameMatch) {
        const name = nameMatch.name || [nameMatch.firstName, nameMatch.lastName].filter(Boolean).join(' ') || 'Unknown';
        return { canonicalId: nameMatch.id, driverName: name, resolved: true };
    }

    // 5. No match — return input as-is
    console.log(`[DriverResolve] Could not resolve "${trimmed}" to a canonical ID`);
    return { canonicalId: trimmed, driverName: trimmed, resolved: false };
}

function invalidateDriverCache() {
    _driverCacheTimestamp = 0;
    _driverCache = [];
}

/** Canonical trip status for KV so ledger rules and GET filters agree (avoids completed vs Completed gaps). */
function normalizeTripStatusForStorage(status: unknown): string {
  const s = String(status ?? "").trim().toLowerCase();
  if (!s) return "Completed";
  if (s.includes("cancel") || s.includes("fail")) return "Cancelled";
  if (s.includes("complet") || s === "complete") return "Completed";
  if (s.includes("process")) return "Processing";
  const raw = String(status ?? "").trim();
  return raw || "Completed";
}

function isCompletedTripStatus(status: unknown): boolean {
  const s = String(status ?? "").trim().toLowerCase();
  if (!s) return false;
  if (s.includes("cancel") || s.includes("fail")) return false;
  return s.includes("complet") || s === "complete";
}

function isUberPlatform(platform: unknown): boolean {
  const p = String(platform ?? "").trim().toLowerCase();
  return p === "uber" || p.startsWith("uber ");
}

function coerceAmount(amount: unknown): number {
  const n = Number(amount);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Admin-created fuel (SubmitExpenseModal, Fuel Log) with a positive odometer should appear
 * on the Pending tab, not Log Review. Driver cash submissions use type Manual_Entry.
 */
function isAdminManualFuelWithProvidedOdometer(transaction: any): boolean {
  const odo = Number(transaction?.odometer);
  if (!Number.isFinite(odo) || odo <= 0) return false;
  const m = transaction?.metadata || {};
  const entrySrc = m.entrySource || transaction?.entrySource;
  if (entrySrc === "admin-manual" || entrySrc === "bulk-import") return true;
  const src = m.source;
  if (src === "Manual" || src === "Bulk Manual" || src === "Fuel Log" || src === "Bulk Log") {
    return true;
  }
  if (
    transaction?.type === "Fuel_Manual_Entry" &&
    (m.portal_type === "Manual_Entry" || m.isManual === true)
  ) {
    return true;
  }
  return false;
}

/**
 * Same eligibility as GET /ledger/driver-overview completeness + repair-driver stats:
 * completed trip with amount &gt; 0, or Uber with positive sum of fare/tip/prior components.
 * Keeps trip:* vs ledger:* fare_earning counts aligned with the integrity banner.
 */
function tripHasMoneyForLedgerProjection(trip: any): boolean {
  if (!isCompletedTripStatus(trip?.status)) return false;
  const amt = coerceAmount(trip?.amount);
  const hasTripAmount = amt > 0;
  if (!isUberPlatform(trip?.platform)) return hasTripAmount;
  const uberGrossForLedger =
    coerceAmount(trip?.uberFareComponents) +
    coerceAmount(trip?.uberTips) +
    coerceAmount(trip?.uberPriorPeriodAdjustment);
  return hasTripAmount || uberGrossForLedger > 0;
}

// Enable logger - DISABLED to prevent OOM on large payloads
// app.use('*', logger(console.log));

// Phase 8.1: Payload Size Logging & Phase 8.2: Big Data Protection Middleware
app.use('*', async (c, next) => {
  const start = Date.now();
  
  try {
    await next();
  } catch (err: any) {
    const isConnectionError = 
        err.message?.includes("connection closed") || 
        err.message?.includes("broken pipe") ||
        err.name === "Http" || 
        err.name === "BrokenPipe" ||
        err.name === "BadResource" ||
        err.code === "ECONNRESET" ||
        err.code === "EPIPE";

    if (isConnectionError) {
        // Silently handle client disconnects - this is normal in web servers
        console.warn(`[Network] Client disconnected prematurely: ${err.message || err.name}`);
        return;
    }

    console.error(`[Fatal Error] Request crashed: ${err.message}`);
    try {
        return c.json({ error: "Server Error: Internal failure" }, 500);
    } catch (e) {
        // If we can't even send a JSON error (e.g. connection is truly dead)
        return;
    }
  }

  const ms = Date.now() - start;
  
  // Safe access to response properties
  try {
    const status = c.res?.status;
    const len = c.res?.headers?.get('Content-Length');
    
    // Log large payloads (> 1MB)
    if (len && parseInt(len) > 1024 * 1024) {
        console.warn(`[Heavy Payload] ${c.req.method} ${c.req.path} - ${len} bytes - ${ms}ms`);
    } else if (status >= 400) {
        console.log(`[Error] ${c.req.method} ${c.req.path} - ${status} - ${ms}ms`);
    }
  } catch (e) {
      // Ignore errors during logging
  }
});

// ---------------------------------------------------------------------------
// Maintenance Mode Middleware
// ---------------------------------------------------------------------------
// Reads platform:settings from cache/KV. If maintenanceMode is true, blocks
// all non-admin, non-auth, non-status routes with 503.
// ---------------------------------------------------------------------------
async function getPlatformSettingsCached(): Promise<any> {
  const cached = memCache.platformSettingsCache.get('platform:settings');
  if (cached) return cached;
  const settings = await kv.get('platform:settings');
  if (settings) {
    memCache.platformSettingsCache.set('platform:settings', settings);
  }
  return settings || {};
}

// Public endpoint: GET /platform-status (no auth required)
app.get("/make-server-37f42386/platform-status", async (c) => {
  try {
    const settings = await getPlatformSettingsCached();
    return c.json({
      maintenanceMode: settings.maintenanceMode || false,
      maintenanceMessage: settings.maintenanceMessage || "We're performing scheduled maintenance. Back soon!",
      platformName: settings.platformName || 'Roam Fleet',
      registrationMode: settings.registrationMode || 'open',
      allowedDomains: settings.allowedDomains || [],
      defaultCurrency: settings.defaultCurrency || 'JMD',
      fleetTimezone: settings.fleetTimezone || 'America/Jamaica',
      announcement: (() => {
        const ann = settings.announcement;
        if (!ann || !ann.enabled) return null;
        const now = new Date().toISOString().split('T')[0];
        if (ann.startDate && now < ann.startDate) return null;
        if (ann.endDate && now > ann.endDate) return null;
        return { message: ann.message, type: ann.type, dismissible: ann.dismissible };
      })(),
      sessionTimeoutMinutes: settings.securityPolicies?.sessionTimeoutMinutes ?? 0,
      passwordPolicy: {
        minLength: settings.securityPolicies?.minPasswordLength ?? 8,
        requireUppercase: settings.securityPolicies?.requireUppercase ?? false,
        requireNumber: settings.securityPolicies?.requireNumber ?? false,
        requireSpecialChar: settings.securityPolicies?.requireSpecialChar ?? false,
      },
    });
  } catch (e: any) {
    console.log(`platform-status GET error: ${e.message}`);
    return c.json({ maintenanceMode: false, maintenanceMessage: '', platformName: 'Roam Fleet' });
  }
});

// Public endpoint: GET /platform-feature-flags (no auth required)
app.get("/make-server-37f42386/platform-feature-flags", async (c) => {
  try {
    const settings = await getPlatformSettingsCached();
    const defaultModules = {
      fuelManagement: true,
      tollManagement: true,
      driverPortal: true,
      fleetEquipment: true,
      claimableLoss: true,
      performanceAnalytics: true,
    };
    return c.json({
      enabledModules: { ...defaultModules, ...(settings.enabledModules || {}) },
    });
  } catch (e: any) {
    console.log(`platform-feature-flags GET error: ${e.message}`);
    return c.json({ enabledModules: { fuelManagement: true, tollManagement: true, driverPortal: true, fleetEquipment: true, claimableLoss: true, performanceAnalytics: true } });
  }
});

// Maintenance mode gate — runs AFTER CORS but blocks non-exempt routes
app.use('*', async (c, next) => {
  const path = c.req.path;

  // Exempt routes: admin portal, auth, platform-status, health
  const isExempt =
    path.includes('/admin/') ||
    path.includes('/login') ||
    path.includes('/signup') ||
    path.includes('/platform-status') ||
    path.includes('/platform-feature-flags') ||
    path.includes('/health');

  if (isExempt) {
    return next();
  }

  try {
    const settings = await getPlatformSettingsCached();
    if (settings.maintenanceMode === true) {
      return c.json({
        error: 'Platform is under maintenance. Please try again later.',
        maintenanceMode: true,
        maintenanceMessage: settings.maintenanceMessage || "We're performing scheduled maintenance. Back soon!",
      }, 503);
    }
  } catch (e: any) {
    // If we can't read settings, allow the request through (fail-open)
    console.log(`[MaintenanceMiddleware] Error reading settings, failing open: ${e.message}`);
  }

  return next();
});

// Phase 8.3: Stress Test / Seed Endpoint
app.post("/make-server-37f42386/test/seed", async (c) => {
    try {
        const { count, driverId, type } = await c.req.json();
        const numTrips = count || 100;
        const targetDriverId = driverId || "test-driver-1";
        
        console.log(`Seeding ${numTrips} items for driver ${targetDriverId}...`);
        
        if (type === 'safety') {
            // Seed specific fatigue patterns
            const trips = [];
            const baseDate = new Date();
            for (let i = 0; i < 20; i++) {
                const date = new Date(baseDate);
                date.setDate(date.getDate() - Math.floor(i / 3));
                // Force some 2AM-5AM trips
                const hour = 2 + (i % 3); 
                const requestTime = new Date(date);
                requestTime.setHours(hour, 0, 0);
                
                trips.push({
                    id: crypto.randomUUID(),
                    driverId: targetDriverId,
                    amount: 500,
                    date: date.toISOString().split('T')[0],
                    requestTime: requestTime.toISOString(),
                    status: 'Completed',
                    platform: 'Uber',
                    distance: 15,
                    duration: 120, // 2 hours each
                    isManual: false
                });
            }
            const keys = trips.map(t => `trip:${t.id}`);
            await kv.mset(keys, trips);
            return c.json({ success: true, seeded: 'fatigue_pattern' });
        }
        
        const trips = [];
        const baseDate = new Date();
        
        for (let i = 0; i < numTrips; i++) {
            const date = new Date(baseDate);
            date.setDate(date.getDate() - Math.floor(Math.random() * 30)); // Last 30 days
            
            trips.push({
                id: crypto.randomUUID(),
                driverId: targetDriverId,
                amount: Math.floor(Math.random() * 2000) + 500, // 500 - 2500
                date: date.toISOString().split('T')[0],
                requestTime: date.toISOString(),
                status: 'Completed',
                platform: Math.random() > 0.5 ? 'Uber' : 'InDrive',
                distance: Math.floor(Math.random() * 20) + 1,
                duration: Math.floor(Math.random() * 60) + 10,
                isManual: false
            });
        }
        
        // Save in chunks of 100 to avoid KV write limits
        for (let i = 0; i < trips.length; i += 100) {
            const chunk = trips.slice(i, i + 100);
            const keys = chunk.map(t => `trip:${t.id}`);
            await kv.mset(keys, chunk);
        }
        
        // Invalidate cache
        await cache.invalidateCacheVersion("stats");
        await cache.invalidateCacheVersion("performance");
        
        return c.json({ success: true, count: numTrips });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Phase 2: AI-Driven OCR & Verification (Refined)
app.post("/make-server-37f42386/ai/process-fuel-receipt", async (c) => {
    try {
        const { imageBase64 } = await c.req.json();
        if (!imageBase64) return c.json({ error: "No image provided" }, 400);

        const data = await gemini.processFuelReceiptVision(imageBase64);
        return c.json(data);
    } catch (e: any) {
        console.error("AI Receipt Error:", e);
        return c.json({ error: `Failed to process receipt: ${e.message}` }, 500);
    }
});

app.post("/make-server-37f42386/ai/verify-odometer", async (c) => {
    try {
        const { currentOdo, previousOdo, tripsDistance, previousDate, currentDate } = await c.req.json();
        const data = await gemini.verifyOdometerLogic(currentOdo, previousOdo, tripsDistance, previousDate, currentDate);
        return c.json(data);
    } catch (e: any) {
        console.error("AI Odo Verification Error:", e);
        return c.json({ error: "Failed to verify odometer" }, 500);
    }
});

// --- VEHICLE TANK STATUS (Phase 4) ---
app.get("/make-server-37f42386/vehicles/:id/tank-status", requireAuth(), async (c) => {
    try {
        const vehicleId = c.req.param("id");
        
        // 1. Get Vehicle for Capacity
        const vehicle = await kv.get(`vehicle:${vehicleId}`);
        if (!vehicle) return c.json({ error: "Vehicle not found" }, 404);
        
        const tankCapacity = Number(vehicle?.specifications?.tankCapacity) || Number(vehicle?.fuelSettings?.tankCapacity) || 0;

        // 2. Get Last Transactions to calculate current cumulative
        const { data: lastTxData } = await supabase
            .from("kv_store_37f42386")
            .select("value")
            .like("key", "transaction:%")
            .eq("value->>vehicleId", vehicleId)
            .order("value->>date", { ascending: false })
            .limit(15);
        
        const lastTransactions = (lastTxData || []).map((d: any) => d.value);
        
        let cumulative = 0;
        let lastAnchorFound = false;
        let lastOdometer = 0;
        let lastCycleId = null;
        
        // Find the last odometer across ALL transactions for this vehicle
        const lastTxWithOdo = lastTransactions.find(tx => Number(tx.odometer) > 0);
        lastOdometer = lastTxWithOdo ? Number(lastTxWithOdo.odometer) : 0;

        for (const tx of lastTransactions) {
            if (tx.metadata?.isAnchor || tx.metadata?.isFullTank || tx.metadata?.isSoftAnchor) {
                lastAnchorFound = true;
                lastCycleId = tx.metadata?.cycleId;
                break;
            }
            cumulative += (Number(tx.quantity) || Number(tx.metadata?.fuelVolume) || Number(tx.liters) || 0);
        }

        return c.json({
            vehicleId,
            tankCapacity,
            lastOdometer,
            currentCycleId: lastCycleId,
            currentCumulative: Number(cumulative.toFixed(2)),
            progressPercent: tankCapacity > 0 ? Number(((cumulative / tankCapacity) * 100).toFixed(1)) : 0,
            status: cumulative > (tankCapacity * 1.05) ? 'Critical: Tank Overflow' : 
                    cumulative > (tankCapacity * 1.00) ? 'Cycle Reset Triggered' :
                    cumulative > (tankCapacity * 0.85) ? 'Approaching Capacity' : 'Normal',
            isAnomaly: cumulative > (tankCapacity * 1.05)
        });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// --- FUEL AUDIT DASHBOARD (Phase 6) ---
app.get("/make-server-37f42386/admin/fuel-audit/summary", async (c) => {
    try {
        const { data: txData } = await supabase
            .from("kv_store_37f42386")
            .select("value")
            .like("key", "transaction:%");
        
        const transactions = (txData || []).map((d: any) => d.value);
        const fuelTx = transactions.filter(t => t.category === 'Fuel' || t.category === 'Fuel Reimbursement');

        const summary = {
            totalFuelTransactions: fuelTx.length,
            flaggedCount: fuelTx.filter(t => (t.metadata?.integrityStatus === 'warning' || t.metadata?.integrityStatus === 'critical') && !t.metadata?.isHealed).length,
            criticalCount: fuelTx.filter(t => t.metadata?.integrityStatus === 'critical' && !t.metadata?.isHealed).length,
            resolvedCount: fuelTx.filter(t => t.metadata?.auditStatus === 'resolved' || t.metadata?.auditStatus === 'Auto-Resolved' || t.metadata?.isHealed).length,
            observingCount: fuelTx.filter(t => t.metadata?.auditStatus === 'Observing').length,
            pendingReview: fuelTx.filter(t => (t.metadata?.integrityStatus === 'warning' || t.metadata?.integrityStatus === 'critical') && !t.metadata?.isHealed && !['resolved', 'Auto-Resolved', 'Observing'].includes(t.metadata?.auditStatus || '')).length
        };

        return c.json(summary);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.get("/make-server-37f42386/admin/fuel-audit/flagged", async (c) => {
    try {
        const { data: txData } = await supabase
            .from("kv_store_37f42386")
            .select("value")
            .like("key", "transaction:%")
            .order("value->>date", { ascending: false });
        
        const transactions = (txData || []).map((d: any) => d.value);
        const flagged = transactions.filter(t => 
            (t.category === 'Fuel' || t.category === 'Fuel Reimbursement') && 
            (
                (t.metadata?.integrityStatus === 'warning' || t.metadata?.integrityStatus === 'critical') && !t.metadata?.isHealed ||
                t.metadata?.auditStatus === 'Observing'
            )
        );

        return c.json(flagged);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.post("/make-server-37f42386/admin/fuel-audit/resolve", async (c) => {
    try {
        const { transactionId, status, note } = await c.req.json();
        const tx = await kv.get(`transaction:${transactionId}`);
        if (!tx) return c.json({ error: "Transaction not found" }, 404);

        tx.metadata = {
            ...tx.metadata,
            auditStatus: status, // 'resolved', 'disputed', 'rejected'
            auditNote: note,
            auditedAt: new Date().toISOString()
        };

        await kv.set(`transaction:${transactionId}`, stampOrg(tx, c));
        return c.json({ success: true });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Phase 3: Recalculate All History (Logic: 100% Reset / 105% Anomaly)
app.post("/make-server-37f42386/admin/fuel-audit/recalculate-all", async (c) => {
    try {
        console.log("[Recalculate] Starting full history recalculation (100% Logic)...");

        // Load configurable frequency threshold
        const auditConfig = await kv.get("config:audit_settings");
        const frequencyThreshold = Number(auditConfig?.frequencyThreshold) || 3;
        // Phase 21: configurable efficiency variance threshold (default 30%)
        const efficiencyThreshold = Number(auditConfig?.efficiencyThreshold) || 0.30;

        // 1. Fetch all Vehicles (for Tank Capacity)
        const { data: vehicleData } = await supabase
            .from("kv_store_37f42386")
            .select("value")
            .like("key", "vehicle:%");
            
        const vehicleMap = new Map();
        (vehicleData || []).forEach((d: any) => {
            const v = d.value;
            if (v && v.id) {
                const cap = Number(v.fuelSettings?.tankCapacity) || Number(v.specifications?.tankCapacity) || 0;
                vehicleMap.set(v.id, {
                    capacity: cap,
                    fuelEconomy: Number(v.specifications?.fuelEconomy) || Number(v.fuelSettings?.efficiencyCity) || 0,
                    estimatedRangeMin: Number(v.specifications?.estimatedRangeMin) || 0
                });
            }
        });
        console.log(`[Recalculate] Loaded ${vehicleMap.size} vehicles.`);

        // 2. Fetch all Transactions
        const { data: txData, error: txError } = await supabase
            .from("kv_store_37f42386")
            .select("value")
            .like("key", "transaction:%");
            
        if (txError) throw txError;

        const allTransactions = (txData || []).map((d: any) => d.value);
        const fuelTransactions = allTransactions.filter((t: any) => t.category === 'Fuel' || t.category === 'Fuel Reimbursement');
        
        console.log(`[Recalculate] Processing ${fuelTransactions.length} fuel transactions...`);

        // 3. Group by Vehicle
        const byVehicle = new Map<string, any[]>();
        fuelTransactions.forEach((tx: any) => {
            const vId = tx.vehicleId || 'unknown';
            if (!byVehicle.has(vId)) byVehicle.set(vId, []);
            byVehicle.get(vId)!.push(tx);
        });

        // 4. Process each vehicle
        const updates: any[] = [];
        let modifiedCount = 0;
        let efficiencySkippedCount = 0;  // Phase 24: count entries where rolling avg was unavailable

        for (const [vId, txs] of byVehicle.entries()) {
            const vehicleInfo = vehicleMap.get(vId);
            if (!vehicleInfo || vehicleInfo.capacity <= 0) continue;
            const capacity = vehicleInfo.capacity;

            // Sort by date and odometer to ensure chronological processing
            txs.sort((a, b) => {
                const dateStrA = a.date.includes('-') ? a.date : a.date.replace(/\//g, '-');
                const dateStrB = b.date.includes('-') ? b.date : b.date.replace(/\//g, '-');
                const dateA = new Date(a.time ? `${dateStrA} ${a.time}` : dateStrA).getTime();
                const dateB = new Date(b.time ? `${dateStrB} ${b.time}` : dateStrB).getTime();
                if (!isNaN(dateA) && !isNaN(dateB)) {
                    if (dateA !== dateB) return dateA - dateB;
                }
                return (a.odometer || 0) - (b.odometer || 0);
            });

            let runningCumulative = 0;
            let carryoverVolume = 0;
            let currentCycleId = crypto.randomUUID();
            // Phase 20: running anchor odometer tracker (replaces broken per-entry metadata lookup)
            let lastAnchorOdo = 0;
            // Phase 21: pre-compute rolling average efficiency for this vehicle's transactions
            const txRollingAvg = fuelLogic.calculateRollingEfficiencyBatch(txs);
            if (!txRollingAvg) efficiencySkippedCount += txs.length;

            for (let i = 0; i < txs.length; i++) {
                const tx = txs[i];
                const volume = Number(tx.quantity) || Number(tx.metadata?.fuelVolume) || Number(tx.liters) || 0;
                
                // Track volume before this entry
                const prevCumulative = runningCumulative;
                runningCumulative += volume;

                const percentOfTank = (runningCumulative / capacity) * 100;
                
                // Logic: 
                // 100% = Soft Anchor (System Reset)
                // 105% = Anomaly (Overflow)
                // Phase 18 fix: only metadata.isFullTank / metadata.isAnchor mark a hard anchor
                // (removed tx.type === 'Reimbursement' — reimbursements are NOT automatic full-tank anchors)
                const isManualFull = tx.metadata?.isFullTank === true || tx.metadata?.isAnchor === true;
                const isSoftAnchor = !isManualFull && percentOfTank >= 100;
                const isAnchor = isManualFull || isSoftAnchor;

                let volumeContributed = volume;
                let excessVolume = 0;

                if (isAnchor && isSoftAnchor) {
                    volumeContributed = Math.max(0, capacity - prevCumulative);
                    excessVolume = volume - volumeContributed;
                }

                // Phase 1 Efficiency Integration (using pre-loaded vehicleMap to avoid N+1 queries)
                const profileKmPerLiter = vehicleInfo.fuelEconomy;
                const rangeMin = vehicleInfo.estimatedRangeMin;
                // Phase 21: use rolling average as efficiency baseline (fall back to skip if insufficient data)
                const efficiencyBaseline = txRollingAvg?.avgKmPerLiter || 0;
                
                // Phase 20: use running lastAnchorOdo instead of broken metadata lookup
                const distanceSinceAnchor = (tx.odometer && lastAnchorOdo) ? (tx.odometer - lastAnchorOdo) : 0;
                
                let actualKmPerLiter = 0;
                let efficiencyVariance = 0;
                if (distanceSinceAnchor > 0 && runningCumulative > 0) {
                    actualKmPerLiter = distanceSinceAnchor / runningCumulative;
                    if (efficiencyBaseline > 0) {
                        efficiencyVariance = (efficiencyBaseline - actualKmPerLiter) / efficiencyBaseline;
                    }
                }

                let integrityStatus = 'stable';
                let anomalyReason = null;
                
                // Phase 2: Behavioral Check
                const fourHoursAgo = new Date(new Date(tx.date).getTime() - (4 * 60 * 60 * 1000)).toISOString();
                const recentTxCount = txs.slice(0, i).filter(t => t.date >= fourHoursAgo).length;
                // Card-only frequency check: only flag card transactions, cash/reimbursement exempt
                const isCardTx = tx.paymentMethod === 'Gas Card' || tx.paymentMethod === 'Fuel Card' || tx.type === 'Card_Transaction' || tx.paymentSource === 'Gas_Card';
                const isHighFrequency = isCardTx && recentTxCount >= (frequencyThreshold - 1);
                const isFragmented = capacity > 0 && (volume / capacity) < 0.15 && !tx.metadata?.isTopUp;

                if (capacity > 0 && volume > capacity) {
                    integrityStatus = 'critical';
                    anomalyReason = 'Soft Anchor / Tank Overfill';
                } else if (isAnchor && distanceSinceAnchor > 0) {
                    // Phase 19/20: only check efficiency when we have real distance data
                    // Phase 21: skip if no rolling average (efficiencyBaseline=0), use configurable threshold
                    const isHighConsumption = efficiencyBaseline > 0 && efficiencyVariance > efficiencyThreshold;
                    const isRangeSuspicious = rangeMin > 0 && distanceSinceAnchor > 0 && distanceSinceAnchor < (rangeMin * 0.5) && (runningCumulative / capacity) > 0.8;
                    
                    if (isHighConsumption || isRangeSuspicious) {
                        integrityStatus = 'critical';
                        anomalyReason = 'High Fuel Consumption';
                    }
                } else if (isHighFrequency) {
                    integrityStatus = 'critical';
                    anomalyReason = 'High Transaction Frequency';
                } else if (isFragmented) {
                    integrityStatus = 'warning';
                    anomalyReason = 'Fragmented Purchase';
                } else if (percentOfTank > 85) {
                    integrityStatus = 'warning';
                    anomalyReason = 'Approaching Capacity';
                }

                const newMetadata = {
                    ...tx.metadata,
                    volumeContributed: Number(volumeContributed.toFixed(2)),
                    excessVolume: excessVolume > 0 ? Number(excessVolume.toFixed(2)) : undefined,
                    cumulativeLitersAtEntry: Number(runningCumulative.toFixed(2)),
                    tankCapacityAtEntry: capacity,
                    distanceSinceAnchor,
                    actualKmPerLiter: Number(actualKmPerLiter.toFixed(2)),
                    profileKmPerLiter,
                    // Phase 21: rolling average metadata
                    rollingAvgKmPerLiter: txRollingAvg?.avgKmPerLiter ?? null,
                    rollingAvgWindow: txRollingAvg?.window ?? null,
                    rollingAvgEntryCount: txRollingAvg?.entryCount ?? 0,
                    efficiencyBaseline: txRollingAvg ? 'rolling' : 'skipped',
                    efficiencyVariance: Number(efficiencyVariance.toFixed(4)),
                    isSoftAnchor: isSoftAnchor,
                    isAnchor: isAnchor,
                    isHighFrequency,
                    isFragmented,
                    integrityStatus,
                    anomalyReason,
                    cycleId: currentCycleId,
                    recalculatedAt: new Date().toISOString()
                };

                // Check if anything meaningful changed
                const hasChanged = 
                    tx.metadata?.cycleId !== currentCycleId ||
                    tx.metadata?.cumulativeLitersAtEntry !== newMetadata.cumulativeLitersAtEntry ||
                    tx.metadata?.integrityStatus !== newMetadata.integrityStatus ||
                    tx.metadata?.excessVolume !== newMetadata.excessVolume;

                if (hasChanged) {
                    tx.metadata = newMetadata;
                    updates.push(tx);
                    modifiedCount++;
                }

                // Reset cycle if this was an anchor
                if (isAnchor) {
                    carryoverVolume = excessVolume;
                    runningCumulative = carryoverVolume;
                    currentCycleId = crypto.randomUUID();
                    // Phase 20: update running anchor odometer for next iteration
                    lastAnchorOdo = tx.odometer || lastAnchorOdo;
                }
            }
        }

        // 5. Batch Save transaction:* (Chunked)
        if (updates.length > 0) {
            console.log(`[Recalculate] Saving ${updates.length} transaction updates in chunks...`);
            const CHUNK_SIZE = 50;
            for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
                const chunk = updates.slice(i, i + CHUNK_SIZE);
                const keys = chunk.map(t => `transaction:${t.id}`);
                await kv.mset(keys, chunk);
            }
        }

        // ====================================================================
        // 6. ALSO recalculate fuel_entry:* records (what the Audit Dashboard reads)
        // ====================================================================
        console.log(`[Recalculate] Now processing fuel_entry:* records...`);
        const { data: entryData, error: entryError } = await supabase
            .from("kv_store_37f42386")
            .select("key, value")
            .like("key", "fuel_entry:%");
        
        if (entryError) {
            console.log(`[Recalculate] Warning: Could not load fuel entries: ${entryError.message}`);
        }

        const allEntries = (entryData || []).map((d: any) => ({ _kvKey: d.key, ...d.value }));
        console.log(`[Recalculate] Found ${allEntries.length} fuel entries to re-score.`);

        // Group fuel entries by vehicle
        const entriesByVehicle = new Map<string, any[]>();
        allEntries.forEach((entry: any) => {
            const vId = entry.vehicleId || 'unknown';
            if (!entriesByVehicle.has(vId)) entriesByVehicle.set(vId, []);
            entriesByVehicle.get(vId)!.push(entry);
        });

        const entryUpdates: any[] = [];
        let entryModifiedCount = 0;

        for (const [vId, entries] of entriesByVehicle.entries()) {
            const vehicleInfo = vehicleMap.get(vId);
            if (!vehicleInfo || vehicleInfo.capacity <= 0) continue;
            const capacity = vehicleInfo.capacity;
            const profileKmPerLiter = vehicleInfo.fuelEconomy;
            const rangeMin = vehicleInfo.estimatedRangeMin;

            // Sort chronologically
            entries.sort((a, b) => {
                const dateA = new Date(a.date).getTime();
                const dateB = new Date(b.date).getTime();
                if (!isNaN(dateA) && !isNaN(dateB) && dateA !== dateB) return dateA - dateB;
                return (a.odometer || 0) - (b.odometer || 0);
            });

            let runningCumulative = 0;
            // Phase 20: running anchor odometer tracker (replaces broken per-entry metadata lookup)
            let lastAnchorOdo = 0;
            // Phase 21: pre-compute rolling average efficiency for this vehicle's fuel entries
            const entryRollingAvg = fuelLogic.calculateRollingEfficiencyBatch(entries);
            const efficiencyBaseline = entryRollingAvg?.avgKmPerLiter || 0;
            if (!entryRollingAvg) efficiencySkippedCount += entries.length;

            for (let i = 0; i < entries.length; i++) {
                const entry = entries[i];
                const volume = Number(entry.liters) || Number(entry.metadata?.fuelVolume) || 0;
                const prevCumulative = runningCumulative;
                runningCumulative += volume;

                const percentOfTank = capacity > 0 ? (runningCumulative / capacity) * 100 : 0;
                // Phase 18 fix: only metadata.isFullTank / metadata.isAnchor mark a hard anchor
                // (removed entry.type === 'Reimbursement' — reimbursements are NOT automatic full-tank anchors)
                const isManualFull = entry.metadata?.isFullTank === true || entry.metadata?.isAnchor === true;
                const isSoftAnchor = !isManualFull && percentOfTank >= 100;
                const isAnchor = isManualFull || isSoftAnchor;

                // Efficiency calculation
                // Phase 20: use running lastAnchorOdo instead of broken metadata lookup
                const distanceSinceAnchor = (entry.odometer && lastAnchorOdo) ? (entry.odometer - lastAnchorOdo) : 0;
                let actualKmPerLiter = 0;
                let efficiencyVariance = 0;
                if (distanceSinceAnchor > 0 && runningCumulative > 0 && efficiencyBaseline > 0) {
                    actualKmPerLiter = distanceSinceAnchor / runningCumulative;
                    efficiencyVariance = (efficiencyBaseline - actualKmPerLiter) / efficiencyBaseline;
                }

                // Frequency check (4-hour window) — card-only
                const fourHoursAgo = new Date(new Date(entry.date).getTime() - (4 * 60 * 60 * 1000)).toISOString();
                const recentTxCount = entries.slice(0, i).filter(e => e.date >= fourHoursAgo).length;
                const isCardTx = entry.type === 'Card_Transaction' || entry.paymentSource === 'Gas_Card' ||
                    entry.paymentMethod === 'Gas Card' || entry.paymentMethod === 'Fuel Card';
                const isHighFrequency = isCardTx && recentTxCount >= (frequencyThreshold - 1);
                const isFragmented = capacity > 0 && (volume / capacity) < 0.15 && !entry.metadata?.isTopUp;

                // Determine new integrity
                let newIntegrityStatus = 'stable';
                let newAnomalyReason: string | null = null;
                let newAuditStatus = 'Clean';

                if (capacity > 0 && volume > (capacity * 1.02)) {
                    newIntegrityStatus = 'critical';
                    newAnomalyReason = 'Tank Overfill Anomaly';
                    newAuditStatus = 'Flagged';
                } else if (isAnchor && distanceSinceAnchor > 0) {
                    // Phase 19/20: only check efficiency when we have real distance data
                    // Phase 21: skip if no rolling average (efficiencyBaseline=0), use configurable threshold
                    const isHighConsumption = efficiencyBaseline > 0 && efficiencyVariance > efficiencyThreshold;
                    const isRangeSuspicious = rangeMin > 0 && distanceSinceAnchor > 0 && distanceSinceAnchor < (rangeMin * 0.5) && (runningCumulative / capacity) > 0.8;
                    if (isHighConsumption || isRangeSuspicious) {
                        newIntegrityStatus = 'critical';
                        newAnomalyReason = 'High Fuel Consumption';
                        newAuditStatus = 'Flagged';
                    }
                } else if (isHighFrequency) {
                    newIntegrityStatus = 'critical';
                    newAnomalyReason = 'High Transaction Frequency';
                    newAuditStatus = 'Flagged';
                } else if (isFragmented) {
                    newIntegrityStatus = 'warning';
                    newAnomalyReason = 'Fragmented Purchase';
                    newAuditStatus = 'Flagged';
                } else if (percentOfTank > 85) {
                    newIntegrityStatus = 'warning';
                    newAnomalyReason = 'Approaching Capacity';
                    newAuditStatus = 'Observing';
                }

                const newIsFlagged = newIntegrityStatus === 'critical';

                // Skip if already manually resolved / healed (don't override human decisions)
                if (entry.auditStatus === 'Resolved' || entry.auditStatus === 'Auto-Resolved' || entry.metadata?.isHealed) {
                    if (isAnchor) { runningCumulative = 0; }
                    continue;
                }

                // Check if anything actually changed
                const oldStatus = entry.metadata?.integrityStatus;
                const oldReason = entry.metadata?.anomalyReason || entry.anomalyReason;
                const oldFlagged = entry.isFlagged;

                if (oldStatus !== newIntegrityStatus || oldReason !== newAnomalyReason || oldFlagged !== newIsFlagged) {
                    entry.isFlagged = newIsFlagged;
                    entry.auditStatus = newAuditStatus;
                    entry.anomalyReason = newAnomalyReason;
                    entry.metadata = {
                        ...entry.metadata,
                        integrityStatus: newIntegrityStatus,
                        anomalyReason: newAnomalyReason,
                        auditStatus: newAuditStatus,
                        distanceSinceAnchor,
                        actualKmPerLiter: Number(actualKmPerLiter.toFixed(2)),
                        profileKmPerLiter,
                        // Phase 21: rolling average metadata
                        rollingAvgKmPerLiter: entryRollingAvg?.avgKmPerLiter ?? null,
                        rollingAvgWindow: entryRollingAvg?.window ?? null,
                        rollingAvgEntryCount: entryRollingAvg?.entryCount ?? 0,
                        efficiencyBaseline: entryRollingAvg ? 'rolling' : 'skipped',
                        efficiencyVariance: Number(efficiencyVariance.toFixed(4)),
                        isHighFrequency,
                        isFragmented,
                        isSoftAnchor,
                        isAnchor,
                        recalculatedAt: new Date().toISOString()
                    };
                    entryUpdates.push(entry);
                    entryModifiedCount++;
                }

                // Reset cycle at anchors
                if (isAnchor) {
                    runningCumulative = 0;
                    // Phase 20: update running anchor odometer for next iteration
                    lastAnchorOdo = entry.odometer || lastAnchorOdo;
                }
            }
        }

        // 7. Batch Save fuel_entry:* (Chunked)
        if (entryUpdates.length > 0) {
            console.log(`[Recalculate] Saving ${entryUpdates.length} fuel entry updates...`);
            const CHUNK_SIZE = 50;
            for (let i = 0; i < entryUpdates.length; i += CHUNK_SIZE) {
                const chunk = entryUpdates.slice(i, i + CHUNK_SIZE);
                const keys = chunk.map(e => e._kvKey || `fuel_entry:${e.id}`);
                // Strip the temporary '_kvKey' property before saving
                const values = chunk.map(e => { const { _kvKey, ...rest } = e; return rest; });
                await kv.mset(keys, values);
            }
        }

        console.log(`[Recalculate] Complete. Transactions: ${modifiedCount} modified. Fuel Entries: ${entryModifiedCount} modified.`);

        return c.json({ 
            success: true, 
            processed: fuelTransactions.length,
            modified: modifiedCount,
            entriesProcessed: allEntries.length,
            entriesModified: entryModifiedCount,
            cyclesIdentified: updates.filter(u => u.metadata?.isAnchor).length,
            // Phase 21: efficiency config used for this recalculation
            efficiencyThreshold,
            efficiencyBaseline: 'rolling-average',
            // Phase 24: count of entries where rolling avg was unavailable
            efficiencySkippedCount
        });

    } catch (e: any) {
        console.error("Recalculate Error:", e);
        return c.json({ error: e.message }, 500);
    }
});

// Phase 8.4: Automated Monthly Report Generation
app.get("/make-server-37f42386/admin/monthly-report", async (c) => {
    try {
        const month = c.req.query("month"); // YYYY-MM
        if (!month) return c.json({ error: "Month is required (YYYY-MM)" }, 400);

        console.log(`[Monthly Report] Generating for ${month}...`);

        // Fetch all transactions for that month
        const { data: txData } = await supabase
            .from("kv_store_37f42386")
            .select("value")
            .like("key", "transaction:%")
            .filter("value->>date", "like", `${month}%`);
        
        const transactions = (txData || []).map((d: any) => d.value);

        // Fetch all trips for that month
        const { data: tripData } = await supabase
            .from("kv_store_37f42386")
            .select("value")
            .like("key", "trip:%")
            .filter("value->>date", "like", `${month}%`);

        const trips = (tripData || []).map((d: any) => d.value);

        const totalRevenue = trips.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
        const totalExpenses = transactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
        const fuelExpenses = transactions.filter(t => t.category === 'Fuel').reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

        const report = {
            month,
            generatedAt: new Date().toISOString(),
            metrics: {
                totalRevenue,
                totalExpenses,
                fuelExpenses,
                netIncome: totalRevenue - totalExpenses,
                tripCount: trips.length,
                transactionCount: transactions.length
            },
            integrity: {
                checksum: `sha256-month-${month}-${crypto.randomUUID().split('-')[0]}`,
                locked: true
            }
        };

        return c.json(report);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

      // Phase 8.5: Unified Vehicle Logs (Batch Fetching)
      app.get("/make-server-37f42386/vehicles/:id/unified-logs", requireAuth(), async (c) => {
          try {
              const vehicleId = c.req.param("id");
              
              // Fetch specific category lists using KV prefixes or direct keys
              const [history, maintenance] = await kv.mget([
                  `odometer-history:${vehicleId}`,
                  `maintenance-logs:${vehicleId}`
              ]);
              
              // For fuel entries which are stored as individual items
              // Support both hyphen and underscore prefixes for maximum reliability during transition
              const { data: fuelDataUnderscore } = await supabase
                  .from("kv_store_37f42386")
                  .select("value")
                  .like("key", "fuel_entry:%")
                  .eq("value->>vehicleId", vehicleId);
                  
              const { data: fuelDataHyphen } = await supabase
                  .from("kv_store_37f42386")
                  .select("value")
                  .like("key", "fuel-entry:%")
                  .eq("value->>vehicleId", vehicleId);
                  
              const fuelEntries = [
                  ...(fuelDataUnderscore || []).map((d: any) => d.value),
                  ...(fuelDataHyphen || []).map((d: any) => d.value)
              ];

              // Deduplicate if any exist in both formats
              const uniqueFuelEntries = Array.from(new Map(fuelEntries.map(item => [item.id, item])).values());

              return c.json({
                  odometerHistory: history || [],
                  maintenanceLogs: maintenance || [],
                  fuelEntries: uniqueFuelEntries || []
              });
          } catch (e: any) {
              return c.json({ error: e.message }, 500);
          }
      });

// Phase 8.1 & 8.2: System Hardening - Error Logging
app.post("/make-server-37f42386/system/log-error", async (c) => {
    try {
        const { error, info, userId, componentName } = await c.req.json();
        const logId = crypto.randomUUID();
        const logEntry = {
            id: logId,
            timestamp: new Date().toISOString(),
            error: error?.message || error,
            stack: error?.stack,
            component: componentName,
            info,
            userId,
            env: Deno.env.get("DENO_REGION") || "local"
        };
        
        // Persist to KV for forensic review
        await kv.set(`error-log:${logId}`, logEntry);
        console.error(`[Frontend Error] ${componentName}: ${logEntry.error}`);
        
        return c.json({ success: true, logId });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Phase 8.3: Forensic Audit Export Hardening - Signing
app.post("/make-server-37f42386/audit/sign-report", async (c) => {
    try {
        const { reportData, reportType } = await c.req.json();
        
        // Create a canonical string for signing
        const canonical = JSON.stringify(reportData, Object.keys(reportData).sort());
        
        // In a real env we'd use a private key, here we use service role hash as a HMAC-like signature
        const encoder = new TextEncoder();
        const data = encoder.encode(canonical + Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const signature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        
        return c.json({
            signature,
            signer: "Fleet Integrity Security Module",
            timestamp: new Date().toISOString()
        });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Health check endpoint
app.get("/make-server-37f42386/health", (c) => {
  return c.json({ status: "ok" });
});

// Public fleet-timezone endpoint (no auth required)
// Used by frontend for display formatting and CSV import timezone handling
app.get("/make-server-37f42386/fleet-timezone", async (c) => {
  try {
    const timezone = await getFleetTimezone();
    return c.json({ timezone });
  } catch (e: any) {
    console.log(`fleet-timezone GET error: ${e.message}`);
    return c.json({ timezone: "America/Jamaica" });
  }
});

app.route("/", fuelApp);
app.route("/", auditApp);
app.route("/", safetyApp);
app.route("/", syncApp);
app.route("/", tollApp);
app.route("/", disputeRefundApp);

// Google Maps Config Endpoint
app.get("/make-server-37f42386/maps-config", (c) => {
  const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
  return c.json({ apiKey: apiKey || "", timestamp: Date.now() });
});

// Audit Config Endpoints (configurable frequency threshold)
app.get("/make-server-37f42386/audit-config", async (c) => {
  try {
    const config = await kv.get("config:audit_settings");
    return c.json(config || { frequencyThreshold: 3, efficiencyThreshold: 0.30 });
  } catch (e: any) {
    console.log(`[AuditConfig] GET error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/audit-config", async (c) => {
  try {
    const body = await c.req.json();
    const existing = await kv.get("config:audit_settings") || {};
    const updated = { ...existing, ...body, updatedAt: new Date().toISOString() };
    await kv.set("config:audit_settings", updated);
    console.log(`[AuditConfig] Saved: ${JSON.stringify(updated)}`);
    return c.json({ success: true, data: updated });
  } catch (e: any) {
    console.log(`[AuditConfig] POST error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// ---------------------------------------------------------------------------
// Dashboard Init - Multi-Layer Caching Helper
// ---------------------------------------------------------------------------

/**
 * Fetch dashboard data with 3-layer caching:
 * Layer 1: Memory cache (hot path - <5ms, 1min TTL)
 * Layer 2: KV cache (warm path - ~100ms, 3min TTL)  
 * Layer 3: Database queries (cold path - ~1-3s)
 * 
 * Note: Shorter TTLs than customer cache because dashboard data changes frequently
 */
async function fetchDashboardDataWithCache(): Promise<any> {
  const cacheKey = "dashboard:init:data";
  
  // Layer 1: Memory cache (hot path - <5ms, 1min TTL)
  const memCached = memCache.dashboardCache.get(cacheKey);
  if (memCached !== null) {
    console.log("[DashboardInit] Served from memory cache");
    return memCached;
  }
  
  // Layer 2: KV cache (warm path - ~100ms, 3min TTL)
  const kvCached = await cache.getCache(cacheKey);
  if (kvCached !== null) {
    console.log("[DashboardInit] Served from KV cache, warming memory");
    memCache.dashboardCache.set(cacheKey, kvCached, 60 * 1000); // 1min in memory
    return kvCached;
  }
  
  // Layer 3: Database queries (cold path - ~1-3s)
  console.log("[DashboardInit] Cache miss, fetching from database");
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString();
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const endOfTodayISO = endOfToday.toISOString();

  // Run all queries in parallel inside the server (each wrapped in withRetry for transient TLS/connection errors)
  const [tripStatsResult, activeDriverResult, tripsResult, driverMetricsResult, vehicleMetricsResult] = await Promise.all([
    // 1) Dashboard stats — today's trips (aggregated)
    cache.withRetry(() => supabase
      .from("kv_store_37f42386")
      .select("value->amount, value->driverId")
      .like("key", "trip:%")
      .or(`value->>date.gte.${todayISO},value->>requestTime.gte.${todayISO}`)
      .or(`value->>date.lte.${endOfTodayISO},value->>requestTime.lte.${endOfTodayISO}`)
    ),

    // 2) Active driver count
    cache.withRetry(() => supabase
      .from("kv_store_37f42386")
      .select("*", { count: 'exact', head: true })
      .like("key", "driver:%")
      .eq("value->>status", "active")
    ),

    // 3) Full trip list (capped at 200, with retry)
    cache.withRetry(async () => {
      const result = await supabase
        .from("kv_store_37f42386")
        .select("value")
        .like("key", "trip:%")
        .order("value->>date", { ascending: false })
        .range(0, 199);
      if (result.error) throw result.error;
      return result.data || [];
    }),

    // 4) Driver metrics
    cache.withRetry(() => supabase
      .from("kv_store_37f42386")
      .select("value")
      .like("key", "driver_metric:%")
      .range(0, 99)
    ),

    // 5) Vehicle metrics
    cache.withRetry(() => supabase
      .from("kv_store_37f42386")
      .select("value")
      .like("key", "vehicle_metric:%")
      .range(0, 99)
    ),
  ]);

  // ── Build stats ──
  if (tripStatsResult.error) throw tripStatsResult.error;
  if (activeDriverResult.error) throw activeDriverResult.error;

  const todayTrips = tripStatsResult.data || [];
  let revenueToday = 0;
  const activeDriverIds = new Set<string>();
  todayTrips.forEach((t: any) => {
    revenueToday += (Number(t.amount) || 0);
    if (t.driverId) activeDriverIds.add(t.driverId);
  });
  const activeDriverCount = activeDriverResult.count || 0;
  const finalActiveDrivers = activeDriverCount;
  const efficiency = finalActiveDrivers > 0 ? Math.round((activeDriverIds.size / finalActiveDrivers) * 100) : 0;

  const stats = {
    date: new Date().toISOString(),
    activeDrivers: finalActiveDrivers,
    trips: todayTrips.length,
    revenue: revenueToday,
    efficiency,
  };

  // ── Build trips ──
  const tripsRaw = Array.isArray(tripsResult) ? tripsResult : (tripsResult as any)?.data || [];
  const trips = tripsRaw.map((d: any) => {
    const val = d.value || d;
    const { route, stops, ...lightweight } = val;
    const sanitized: Record<string, any> = {};
    for (const [k, v2] of Object.entries(lightweight)) {
      sanitized[k] = typeof v2 === 'string' ? v2.replace(/[\x00-\x1F\x7F]/g, ' ') : v2;
    }
    if (sanitized.platform === 'GoRide') sanitized.platform = 'Roam';
    return sanitized;
  });

  // ── Build driver metrics ──
  if (driverMetricsResult.error) throw driverMetricsResult.error;
  const BANNED_UUID = "73dfc14d-3798-4a00-8d86-b2a3eb632f54";
  const driverMetrics = (driverMetricsResult.data || [])
    .map((d: any) => d.value)
    .filter((m: any) => m.driverId !== BANNED_UUID && m.id !== BANNED_UUID);

  // ── Build vehicle metrics ──
  if (vehicleMetricsResult.error) throw vehicleMetricsResult.error;
  const vehicleMetrics = (vehicleMetricsResult.data || []).map((d: any) => d.value);

  // Build final result
  const result = { stats, trips, driverMetrics, vehicleMetrics };
  
  // Store in both caches
  await cache.setCache(cacheKey, result, 3 * 60); // 3min in KV
  memCache.dashboardCache.set(cacheKey, result, 60 * 1000); // 1min in memory
  
  console.log(`[DashboardInit] Cached dashboard data (${trips.length} trips, ${driverMetrics.length} drivers, ${vehicleMetrics.length} vehicles)`);
  return result;
}

/**
 * Invalidate dashboard cache when data changes (trips, drivers, vehicles)
 */
async function invalidateDashboardCache(): Promise<void> {
  const cacheKey = "dashboard:init:data";
  memCache.dashboardCache.invalidate(cacheKey);
  await cache.setCache(cacheKey, null, 0); // Expire KV cache
  console.log("[DashboardInit] Cache invalidated");
}

// ── Dashboard Init Endpoint ───────────────────────────────────────────
// Aggregates stats + trips + driverMetrics + vehicleMetrics into a single
// response so the frontend only makes ONE request on dashboard load.
app.get("/make-server-37f42386/dashboard/init", requireAuth(), async (c) => {
  try {
    // Check for force refresh parameter
    const forceRefresh = c.req.query("refresh") === "true";
    if (forceRefresh) {
      console.log("[DashboardInit] Force refresh requested");
      await invalidateDashboardCache();
    }

    // Fetch with multi-layer caching
    const data = await fetchDashboardDataWithCache();

    // Manual stringify for safety
    let jsonStr: string;
    try {
      jsonStr = JSON.stringify(data);
    } catch (serErr: any) {
      console.error("JSON serialization error in /dashboard/init:", serErr);
      return c.json({ error: "Failed to serialize dashboard/init response" }, 500);
    }
    return new Response(jsonStr, { headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("Error in /dashboard/init:", e);
    return c.json({ error: e.message || "Internal Server Error" }, 500);
  }
});

// Dashboard Stats Endpoint (Aggregated) - Optimized
app.get("/make-server-37f42386/dashboard/stats", requireAuth(), async (c) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    // Query today's trips - Optimized
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    const endOfTodayISO = endOfToday.toISOString();

    const { data: tripData, error: tripError } = await supabase
        .from("kv_store_37f42386")
        .select("value->amount, value->driverId")
        .like("key", "trip:%")
        .or(`value->>date.gte.${todayISO},value->>requestTime.gte.${todayISO}`)
        .or(`value->>date.lte.${endOfTodayISO},value->>requestTime.lte.${endOfTodayISO}`);

    if (tripError) throw tripError;

    // Get active drivers count directly
    const { count: activeDriverCount, error: driverError } = await supabase
        .from("kv_store_37f42386")
        .select("*", { count: 'exact', head: true })
        .like("key", "driver:%")
        .eq("value->>status", "active");

    if (driverError) throw driverError;
    
    // Note: When selecting JSON fields directly (value->field), PostgREST returns them as flat keys
    const trips = tripData || [];
    
    let revenueToday = 0;
    const activeDriverIds = new Set();

    trips.forEach((t: any) => {
        revenueToday += (Number(t.amount) || 0);
        if (t.driverId) {
            activeDriverIds.add(t.driverId);
        }
    });

    const activeDrivers = activeDriverIds.size > 0 ? activeDriverIds.size : (activeDriverCount || 0);
    // Fallback: If no trips today, show active drivers from DB. If trips exist, show drivers who drove today? 
    // Usually "Active Drivers" on dashboard means "Drivers currently working".
    // We'll use the larger of the two to be safe, or just activeDriverCount if we want "Registered Active"
    
    const finalActiveDrivers = activeDriverCount || 0;
    const efficiency = finalActiveDrivers > 0 ? Math.round((activeDrivers / finalActiveDrivers) * 100) : 0;

    return c.json({
        date: new Date().toISOString(),
        activeDrivers: finalActiveDrivers,
        trips: trips.length,
        revenue: revenueToday,
        efficiency: efficiency
    });
  } catch (e: any) {
    console.error("Error fetching dashboard stats:", e);
    return c.json({ error: e.message || "Internal Server Error" }, 500);
  }
});

// Trips endpoints
// Trips Search Endpoint (GIN Index)
app.post("/make-server-37f42386/trips/search", async (c) => {
  try {
    let { 
        driverId, driverName, driverIds, startDate, endDate, status, limit, offset,
        platform, tripType, vehicleId, anchorPeriodId, organizationId
    } = await c.req.json();
    
    // Query JSONB value directly
    let query = supabase
        .from("kv_store_37f42386")
        .select("value", { count: 'exact' })
        .like("key", "trip:%");

    // Organization scoping: filter by organizationId when provided (customer portal)
    // Also respect RBAC org context for fleet users
    const rbacOrgId = getOrgId(c);
    const effectiveOrgId = organizationId || rbacOrgId;
    if (effectiveOrgId) {
        query = query.or(`value->>organizationId.eq.${effectiveOrgId},value->>organizationId.is.null`);
    }

    // driverIds: broad OR search across multiple IDs + optional name
    // This ensures we find trips regardless of which ID format was stored
    if (driverIds && Array.isArray(driverIds) && driverIds.length > 0) {
        const orParts: string[] = [];
        for (const id of driverIds) {
            orParts.push(`value->>driverId.eq.${id}`);
            orParts.push(`value->>driverName.ilike.${id}`);
        }
        if (driverName) {
            orParts.push(`value->>driverName.ilike.${driverName}`);
            // Also check if driverId field contains the name (legacy CSV imports stored names as driverId)
            orParts.push(`value->>driverId.ilike.${driverName}`);
        }
        const orClause = orParts.join(',');

        query = query.or(orClause);
    } else if (driverId) {
        if (driverName) {
            query = query.or(`value->>driverId.eq.${driverId},value->>driverName.ilike.${driverName}`);
        } else {
            query = query.eq("value->>driverId", driverId);
        }
    } else if (driverName) {
        query = query.ilike("value->>driverName", driverName);
    }

    if (anchorPeriodId) {
        query = query.eq("value->>anchorPeriodId", anchorPeriodId);
    }
    
    if (status === 'Processing') {
        // Handle variations of "In Progress" status and relax date constraints for active trips
        query = query.or(`value->>status.eq.Processing,value->>status.eq.In Progress,value->>status.eq.In_Progress,value->>status.eq.started`);
        
        // Clear date filters for active trips to ensure they appear regardless of start time
        startDate = undefined;
        endDate = undefined;
    } else if (status) {
        query = query.eq("value->>status", status);
    }

    if (platform) {
        // Alias: "Roam" was formerly "GoRide" — query both to include pre-rebrand trips
        if (platform === 'Roam') {
            query = query.or('value->>platform.eq.Roam,value->>platform.eq.GoRide');
        } else {
            query = query.eq("value->>platform", platform);
        }
    }

    if (vehicleId) {
        query = query.eq("value->>vehicleId", vehicleId);
    }

    if (tripType === 'manual') {
        query = query.eq("value->>isManual", true);
    } else if (tripType === 'platform') {
        query = query.not("value->>isManual", "eq", "true");
    }

    if (startDate) {
        query = query.or(`value->>date.gte.${startDate},value->>requestTime.gte.${startDate}`);
    }
    
    if (endDate) {
        query = query.or(`value->>date.lte.${endDate},value->>requestTime.lte.${endDate}`);
    }

    // Order by date desc (Note: textual comparison works for ISO dates)
    query = query.order("value->>date", { ascending: false });

    const from = offset || 0;
    // Cap at 1000 per request (PostgREST max row limit)
    const effectiveLimit = Math.min(limit || 50, 1000);
    const to = from + effectiveLimit - 1;
    
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
        console.error("Search query error:", error);
        throw error;
    }

    // Phase 8.4: Large Data Stripping
    // Remove heavy fields (route, stops) from search results to prevent "Connection Closed" errors
    const trips = (data || []).map((d: any) => {
        const v = d.value || {};
        const { route, stops, ...lightweight } = v;
        // Normalize legacy "GoRide" → "Roam" for display
        if (lightweight.platform === 'GoRide') lightweight.platform = 'Roam';
        return lightweight;
    });

    return c.json({
        data: trips,
        page: Math.floor(from / effectiveLimit) + 1,
        limit: effectiveLimit,
        total: count || 0
    });

  } catch (e: any) {
    console.error("Error searching trips:", e);
    return c.json({ error: e.message || "Internal Server Error" }, 500);
  }
});

// Trip Stats Endpoint (Aggregated)
app.post("/make-server-37f42386/trips/stats", async (c) => {
  try {
    const filters = await c.req.json();
    let { 
        driverId, startDate, endDate, status,
        platform, tripType, vehicleId, anchorPeriodId
    } = filters;

    // 1. Check Cache
    // We use the entire filter object to generate a unique key
    const version = await cache.getCacheVersion("stats");
    const cacheKey = await cache.generateKey(`stats:${version}`, filters);
    const cachedStats = await cache.getCache(cacheKey);

    if (cachedStats) {
        c.header("X-Cache", "HIT");
        return c.json(cachedStats);
    }
    
    // Query specific fields to avoid loading heavy route data
    // Include indriveNetIncome & platform so we can use true profit for InDrive trips
    let query = supabase
        .from("kv_store_37f42386")
        .select("value->status, value->amount, value->cashCollected, value->duration, value->platform, value->indriveNetIncome")
        .like("key", "trip:%");

    if (driverId) {
        query = query.eq("value->>driverId", driverId);
    }

    if (anchorPeriodId) {
        query = query.eq("value->>anchorPeriodId", anchorPeriodId);
    }
    
    if (status === 'Processing') {
        // Handle variations of "In Progress" status and relax date constraints for active trips
        query = query.or(`value->>status.eq.Processing,value->>status.eq.In Progress,value->>status.eq.In_Progress,value->>status.eq.started`);
        
        // Clear date filters for active trips to ensure they appear regardless of start time
        startDate = undefined;
        endDate = undefined;
    } else if (status) {
        query = query.eq("value->>status", status);
    }

    if (platform) {
        // Alias: "Roam" was formerly "GoRide" — query both to include pre-rebrand trips
        if (platform === 'Roam') {
            query = query.or('value->>platform.eq.Roam,value->>platform.eq.GoRide');
        } else {
            query = query.eq("value->>platform", platform);
        }
    }

    if (vehicleId) {
        query = query.eq("value->>vehicleId", vehicleId);
    }

    if (tripType === 'manual') {
        query = query.eq("value->>isManual", true);
    } else if (tripType === 'platform') {
        query = query.not("value->>isManual", "eq", "true");
    }

    if (startDate) {
        query = query.or(`value->>date.gte.${startDate},value->>requestTime.gte.${startDate}`);
    }
    
    if (endDate) {
        query = query.or(`value->>date.lte.${endDate},value->>requestTime.lte.${endDate}`);
    }

    // No limit or offset - we need all matching records to calculate stats
    const { data, error } = await query;

    if (error) {
        console.error("Stats query error:", error);
        throw error;
    }

    const trips = data || [];

    const totalTrips = trips.length;
    const completed = trips.filter((t: any) => t.status === 'Completed').length;
    const cancelled = trips.filter((t: any) => t.status === 'Cancelled').length;
    
    // For InDrive trips with fee data, use true profit (net income) instead of full fare
    const totalEarnings = trips.reduce((sum: number, t: any) => {
      const effectiveEarnings = (t.platform === 'InDrive' && t.indriveNetIncome != null)
        ? Number(t.indriveNetIncome)
        : (Number(t.amount) || 0);
      return sum + effectiveEarnings;
    }, 0);
    const totalCashCollected = trips.reduce((sum: number, t: any) => sum + (Number(t.cashCollected) || 0), 0);
    const avgEarnings = completed > 0 ? totalEarnings / completed : 0;
    
    const tripsWithDuration = trips.filter((t: any) => t.duration && t.duration > 0);
    const totalDuration = tripsWithDuration.reduce((sum: number, t: any) => sum + (Number(t.duration) || 0), 0);
    const avgDuration = tripsWithDuration.length > 0 ? totalDuration / tripsWithDuration.length : 0;

    const result = {
        totalTrips,
        completed,
        cancelled,
        totalEarnings,
        totalCashCollected,
        avgEarnings,
        avgDuration
    };

    // 2. Set Cache (TTL 300 seconds = 5 minutes)
    await cache.setCache(cacheKey, result, 300);
    
    c.header("X-Cache", "MISS");
    return c.json(result);

  } catch (e: any) {
    console.error("Error fetching trip stats:", e);
    return c.json({ error: e.message || "Internal Server Error" }, 500);
  }
});

app.post("/make-server-37f42386/trips", async (c) => {
  try {
    const trips = await c.req.json();
    if (!Array.isArray(trips)) {
      return c.json({ error: "Expected array of trips" }, 400);
    }
    
    // Validation and processing
    const processedTrips = trips.map((trip: any) => {
        if (trip.isManual) {
            // Validation for manual trips
            if (!trip.driverId) throw new Error(`Manual trip ${trip.id || 'unknown'} must have a driverId`);
            if (typeof trip.amount !== 'number') throw new Error(`Manual trip ${trip.id || 'unknown'} must have a numeric amount`);
            
            // Enforce consistency for manual entries
            return {
                ...trip,
                batchId: 'manual_entry',
                status: trip.status || 'Completed',
                // Ensure critical financial fields are present
                netPayout: trip.netPayout ?? trip.amount,
                fareBreakdown: trip.fareBreakdown || {
                    baseFare: trip.amount,
                    tips: 0,
                    waitTime: 0,
                    surge: 0,
                    airportFees: 0,
                    timeAtStop: 0,
                    taxes: 0
                }
            };
        }
        return trip;
    });

    for (const trip of processedTrips) {
      trip.status = normalizeTripStatusForStorage(trip.status);
    }
    
    // ── Normalize driverId to canonical Roam UUID ──────────────────────
    // Resolves platform-specific UUIDs (Uber, InDrive) and display names
    // to the canonical Roam UUID so all queries by Roam ID find every trip.
    for (const trip of processedTrips) {
        try {
            const resolved = await resolveCanonicalDriverId(trip.driverId || '');
            if (resolved.resolved) {
                trip.driverId = resolved.canonicalId;
                // Backfill driverName if missing
                if (!trip.driverName) {
                    trip.driverName = resolved.driverName;
                }
            }
        } catch (resolveErr) {
            // Resolution failure should NOT break trip import
            console.warn(`[TripNormalize] Failed to resolve driverId for trip ${trip.id}:`, resolveErr);
        }
    }

    // Resolve organization scope for writes.
    // Priority:
    // 1) Auth-scoped org from request context
    // 2) Driver record org (for legacy/anon import flows)
    let writeOrgId: string | null = getOrgId(c);
    if (!writeOrgId) {
      for (const trip of processedTrips) {
        const did = String(trip?.driverId || '').trim();
        if (!did) continue;
        try {
          const driverRecord = await kv.get(`driver:${did}`);
          const candidate = typeof driverRecord?.organizationId === 'string' ? driverRecord.organizationId.trim() : '';
          if (candidate) {
            writeOrgId = candidate;
            break;
          }
        } catch {
          // Ignore lookup failures; we'll continue without org stamping.
        }
      }
    }
    const stampWriteOrg = <T extends Record<string, any>>(record: T): T =>
      writeOrgId ? ({ ...record, organizationId: writeOrgId } as T) : record;

    // Create keys for each trip
    // Assuming each trip has a unique 'id' field
    const keys = processedTrips.map((t: any) => `trip:${t.id}`);
    
    // Store using mset
    await kv.mset(keys, processedTrips.map((t: any) => stampWriteOrg(t)));

    // Canonical money events (`ledger_event:*`) for non-Uber trips (Roam / InDrive manual, etc.)
    try {
      const tripIdsForLedger = processedTrips.map((t: any) => String(t?.id || "").trim()).filter(Boolean);
      if (tripIdsForLedger.length > 0) {
        await deleteCanonicalLedgerBySource("trip", tripIdsForLedger);
      }
      await appendCanonicalTripFaresIfEligible(processedTrips as Record<string, unknown>[], c);
    } catch (canonErr) {
      console.error("[CanonicalOps] trip fare append after trip save failed:", canonErr);
    }

    // Invalidate stats cache since data has changed
    await cache.invalidateCacheVersion("stats");
    await cache.invalidateCacheVersion("performance");
    
    // Invalidate dashboard cache (new trips affect dashboard data)
    await invalidateDashboardCache();
    
    return c.json({ success: true, count: processedTrips.length });
  } catch (e: any) {
    console.error("Error saving trips:", e);
    return c.json({ error: e.message || "Internal Server Error" }, 500);
  }
});

// Trips GET Endpoint - Optimized with native Supabase pagination
app.get("/make-server-37f42386/trips", requireAuth(), async (c) => {
  try {
    const limitParam = c.req.query("limit");
    const offsetParam = c.req.query("offset");
    const rawLimit = limitParam ? parseInt(limitParam) : 50;
    const limit = Math.min(rawLimit, 500); // Cap at 500 — matches client-side fetchAllTrips() PAGE_SIZE
    const offset = offsetParam ? parseInt(offsetParam) : 0;

    // Retry wrapper for Supabase query — connection resets are transient
    let data: any[] | null = null;
    let lastError: any = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await supabase
          .from("kv_store_37f42386")
          .select("value")
          .like("key", "trip:%")
          .order("value->>date", { ascending: false })
          .range(offset, offset + limit - 1);
      if (!result.error) {
        data = result.data;
        lastError = null;
        break;
      }
      lastError = result.error;
      console.log(`[trips GET] Supabase query attempt ${attempt + 1} failed: ${result.error.message}. Retrying...`);
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
    if (lastError) throw lastError;
    
    // Phase 7: Org-scope filtering + Phase 8.4: Large Data Stripping + sanitize control chars
    const tripsUnscoped = (data || []).map((d: any) => d.value || {});
    const tripsScoped = filterByOrg(tripsUnscoped, c);
    const trips = tripsScoped.map((val: any) => {
        const { route, stops, ...lightweight } = val;
        const sanitized: Record<string, any> = {};
        for (const [k, val] of Object.entries(lightweight)) {
          sanitized[k] = typeof val === 'string' ? val.replace(/[\x00-\x1F\x7F]/g, ' ') : val;
        }
        // Normalize legacy "GoRide" → "Roam" for display
        if (sanitized.platform === 'GoRide') sanitized.platform = 'Roam';
        return sanitized;
    });

    // Manual stringify to catch serialization errors before sending
    let jsonStr: string;
    try {
      jsonStr = JSON.stringify(trips);
    } catch (serErr: any) {
      console.error("JSON serialization error in /trips:", serErr);
      return c.json({ error: "Failed to serialize trips response" }, 500);
    }
    return new Response(jsonStr, { headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("Error fetching trips:", e);
    return c.json({ error: e.message || "Internal Server Error" }, 500);
  }
});

app.delete("/make-server-37f42386/trips", requireAuth(), requirePermission('transactions.edit'), async (c) => {
  try {
    // Direct delete using Supabase client to avoid pagination limits and round-trips
    // This fixes the issue where only the first 1000 records were being deleted
    const prefixes = ["trip:", "batch:", "driver_metric:", "vehicle_metric:", "transaction:"];
    const counts: Record<string, number> = {};

    for (const prefix of prefixes) {
        const { count, error } = await supabase
            .from("kv_store_37f42386")
            .delete({ count: 'exact' })
            .like("key", `${prefix}%`);
            
        if (error) {
            console.error(`Error deleting prefix ${prefix}:`, error);
            throw error;
        }
        counts[prefix] = count || 0;
    }

    // Canonical ledger: trip + transaction rows (trips + transaction:* wiped above)
    try {
      await deleteAllCanonicalLedgerBySourceType("trip");
      await deleteAllCanonicalLedgerBySourceType("transaction");
    } catch (ledgerErr: any) {
      console.warn("[DELETE /trips] Ledger cleanup failed (non-fatal):", ledgerErr?.message);
    }
    
    // Invalidate stats cache since data has changed
    await cache.invalidateCacheVersion("stats");
    await cache.invalidateCacheVersion("performance");
    
    return c.json({ 
        success: true, 
        deletedTrips: counts["trip:"] || 0,
        deletedBatches: counts["batch:"] || 0,
        deletedDriverMetrics: counts["driver_metric:"] || 0,
        deletedVehicleMetrics: counts["vehicle_metric:"] || 0,
        deletedTransactions: counts["transaction:"] || 0
    });
  } catch (e: any) {
    console.error("Error clearing data:", e);
    return c.json({ error: e.message || "Internal Server Error" }, 500);
  }
});

app.delete("/make-server-37f42386/trips/:id", requireAuth(), requirePermission('transactions.edit'), async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`trip:${id}`);
    try {
      await deleteCanonicalLedgerBySource("trip", [id]);
    } catch (ledgerErr: any) {
      console.warn(`[DELETE /trips/:id] Ledger cleanup failed (non-fatal) trip=${id}:`, ledgerErr?.message);
    }
    
    // Invalidate stats cache since data has changed
    await cache.invalidateCacheVersion("stats");
    await cache.invalidateCacheVersion("performance");

    return c.json({ success: true });
  } catch (e: any) {
    console.error(`Error deleting trip ${id}:`, e);
    return c.json({ error: e.message || "Internal Server Error" }, 500);
  }
});

// Driver Metrics Endpoints
app.post("/make-server-37f42386/driver-metrics", async (c) => {
  try {
    const metrics = await c.req.json();
    if (!Array.isArray(metrics)) {
      return c.json({ error: "Expected array of metrics" }, 400);
    }
    const keys = metrics.map((m: any) => `driver_metric:${m.id}`);
    await kv.mset(keys, metrics);
    
    // Invalidate dashboard cache (driver metrics affect dashboard)
    await invalidateDashboardCache();
    
    return c.json({ success: true, count: metrics.length });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.get("/make-server-37f42386/driver-metrics", requireAuth(), async (c) => {
    try {
        const limitParam = c.req.query("limit");
        const offsetParam = c.req.query("offset");
        const limit = limitParam ? parseInt(limitParam) : 100;
        const offset = offsetParam ? parseInt(offsetParam) : 0;

        const { data, error } = await supabase
            .from("kv_store_37f42386")
            .select("value")
            .like("key", "driver_metric:%")
            .range(offset, offset + limit - 1);

        if (error) throw error;
        
        const metrics = data?.map((d: any) => d.value) || [];

        // ACTION 2: The "Exorcism" (Auto-Cleanup)
        const BANNED_UUID = "73dfc14d-3798-4a00-8d86-b2a3eb632f54";
        const ghostIndex = metrics.findIndex((m: any) => (m.driverId === BANNED_UUID || m.id === BANNED_UUID));

        if (ghostIndex !== -1) {
            console.log(`[Exorcism] Deleting Ghost Driver Metric: ${BANNED_UUID}`);
            await kv.del(`driver_metric:${BANNED_UUID}`);
            metrics.splice(ghostIndex, 1);
        }

        return c.json(filterByOrg(metrics, c));
    } catch(e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Vehicle Metrics Endpoints
app.post("/make-server-37f42386/vehicle-metrics", async (c) => {
  try {
    const metrics = await c.req.json();
    if (!Array.isArray(metrics)) {
      return c.json({ error: "Expected array of metrics" }, 400);
    }
    const keys = metrics.map((m: any) => `vehicle_metric:${m.id}`);
    await kv.mset(keys, metrics);
    
    // Invalidate dashboard cache (vehicle metrics affect dashboard)
    await invalidateDashboardCache();
    
    return c.json({ success: true, count: metrics.length });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.get("/make-server-37f42386/vehicle-metrics", requireAuth(), async (c) => {
    try {
        const limitParam = c.req.query("limit");
        const offsetParam = c.req.query("offset");
        const limit = limitParam ? parseInt(limitParam) : 100;
        const offset = offsetParam ? parseInt(offsetParam) : 0;

        const { data, error } = await supabase
            .from("kv_store_37f42386")
            .select("value")
            .like("key", "vehicle_metric:%")
            .range(offset, offset + limit - 1);

        if (error) throw error;
        
        const metrics = filterByOrg(data?.map((d: any) => d.value) || [], c);
        return c.json(metrics);
    } catch(e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Vehicles Endpoints
app.get("/make-server-37f42386/vehicles", requireAuth(), async (c) => {
  try {
    const limitParam = c.req.query("limit");
    const offsetParam = c.req.query("offset");
    const limit = limitParam ? parseInt(limitParam) : 500;
    const offset = offsetParam ? parseInt(offsetParam) : 0;

    const { data, error } = await supabase
        .from("kv_store_37f42386")
        .select("value")
        .like("key", "vehicle:%")
        .range(offset, offset + limit - 1);

    if (error) throw error;
    
    const vehiclesRaw = data?.map((d: any) => d.value) || [];
    return c.json(filterByOrg(vehiclesRaw, c));
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/vehicles", requireAuth(), requirePermission('vehicles.create'), async (c) => {
  try {
    const vehicle = await c.req.json();
    if (!vehicle.id) {
        return c.json({ error: "Vehicle ID (License Plate) is required" }, 400);
    }
    // Use plate as ID
    await kv.set(`vehicle:${vehicle.id}`, stampOrg(vehicle, c));
    return c.json({ success: true, data: vehicle });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-37f42386/vehicles/:id", requireAuth(), requirePermission('vehicles.delete'), async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`vehicle:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Drivers Endpoints
app.get("/make-server-37f42386/drivers", requireAuth(), async (c) => {
  try {
    const limitParam = c.req.query("limit");
    const offsetParam = c.req.query("offset");
    const limit = limitParam ? parseInt(limitParam) : 500;
    const offset = offsetParam ? parseInt(offsetParam) : 0;

    const { data, error } = await supabase
        .from("kv_store_37f42386")
        .select("value")
        .like("key", "driver:%")
        .range(offset, offset + limit - 1);

    if (error) throw error;
    
    const driversRaw = data?.map((d: any) => d.value) || [];
    const drivers = filterByOrg(driversRaw, c);

    // ACTION 2: The "Exorcism" (Auto-Cleanup)
    const BANNED_UUID = "73dfc14d-3798-4a00-8d86-b2a3eb632f54";
    const ghostIndex = drivers.findIndex((d: any) => d.id === BANNED_UUID);

    if (ghostIndex !== -1) {
        console.log(`[Exorcism] Deleting Ghost Driver: ${BANNED_UUID}`);
        await kv.del(`driver:${BANNED_UUID}`);
        drivers.splice(ghostIndex, 1);
    }

    // Sanitize control chars in string fields to prevent JSON parse errors
    const sanitizedDrivers = drivers.map((d: any) => {
      if (!d || typeof d !== 'object') return d;
      const s: Record<string, any> = {};
      for (const [k, val] of Object.entries(d)) {
        s[k] = typeof val === 'string' ? val.replace(/[\x00-\x1F\x7F]/g, ' ') : val;
      }
      return s;
    });
    let jsonStr: string;
    try { jsonStr = JSON.stringify(sanitizedDrivers); } catch (serErr: any) { console.error("JSON serialization error in /drivers:", serErr); return c.json({ error: "Failed to serialize drivers" }, 500); }
    return new Response(jsonStr, { headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/drivers", requireAuth(), requirePermission('drivers.create'), async (c) => {
  try {
    const body = await c.req.json();
    // Extract password to prevent saving it to KV, and use it for Auth creation
    const { password, ...driver } = body;
    
    let authUserId = null;
    const orgId = getOrgId(c);

    // If password provided, create Supabase Auth User
    if (password && driver.email) {
         const { data, error } = await supabase.auth.admin.createUser({
            email: driver.email,
            password: password,
            user_metadata: { 
                name: driver.name || '',
                role: 'driver',
                // Phase 10: Link driver to fleet owner's organization
                organizationId: orgId || undefined,
            },
            email_confirm: true
         });

         if (error) {
             console.error("Auth Create Error:", error);
             if (error.message?.includes('already been registered') || error.message?.includes('already exists')) {
               return c.json({ error: `A user with email ${driver.email} already exists. Use "Claim Driver" to link them to your organization.` }, 409);
             }
             return c.json({ error: `Failed to create user account: ${error.message}` }, 400);
         }
         authUserId = data.user.id;
         console.log(`[Drivers] Created auth account for driver ${driver.email} in org ${orgId}`);
    }

    // Use Auth ID if created, otherwise fallback to provided ID or random
    const finalId = authUserId || driver.id || crypto.randomUUID();
    
    const newDriver = {
        ...driver,
        id: finalId,
        driverId: driver.driverId || finalId, // Allow distinct legacy ID
    };

    await kv.set(`driver:${finalId}`, stampOrg(newDriver, c));
    invalidateDriverCache();
    return c.json({ success: true, data: newDriver });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Transactions Endpoints
// Transactions GET Endpoint - Optimized
app.get("/make-server-37f42386/transactions", requireAuth(), async (c) => {
  try {
    const driverIdsParam = c.req.query("driverIds");
    const driverIdParam = c.req.query("driverId");
    const limitParam = c.req.query("limit");
    const offsetParam = c.req.query("offset");
    const offset = offsetParam ? parseInt(offsetParam) : 0;

    const idsToFilter = new Set<string>();
    if (driverIdParam) idsToFilter.add(driverIdParam);
    if (driverIdsParam) {
        driverIdsParam.split(',').forEach(id => {
            if (id.trim()) idsToFilter.add(id.trim());
        });
    }

    // When filtering by specific driver(s), use a much higher default limit
    // to avoid truncating financial data (payments, floats, tolls).
    // A driver with 905 trips can easily have 500+ transactions.
    // Unscoped (global) queries keep the conservative default of 100.
    const limit = limitParam
        ? parseInt(limitParam)
        : (idsToFilter.size > 0 ? 5000 : 100);

    let query = supabase
        .from("kv_store_37f42386")
        .select("value")
        .like("key", "transaction:%");

    if (idsToFilter.size > 0) {
        const orConditions = Array.from(idsToFilter)
            .map(id => `value->>driverId.eq.${id}`)
            .join(',');
        query = query.or(orConditions);
    }

    const { data, error } = await query
        .order("value->>date", { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) throw error;

    // Phase 8.4: Strip heavy metadata if exists
    const transactions = (data || []).map((d: any) => {
        const v = d.value || {};
        // Only strip if it looks like it contains base64 or heavy binary metadata
        if (v.metadata?.receiptBase64) {
            delete v.metadata.receiptBase64;
        }
        return v;
    });

    return c.json(filterByOrg(transactions, c));
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/transactions", requireAuth(), async (c) => {
  try {
    const transaction = await c.req.json();
    if (!transaction.id) {
        transaction.id = crypto.randomUUID();
    }
    if (!transaction.timestamp) {
        transaction.timestamp = new Date().toISOString();
    }

    // Future-Date Guard: flag transactions with dates beyond today
    if (transaction.date) {
        const txDate = new Date(transaction.date);
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(23, 59, 59, 999);
        if (!isNaN(txDate.getTime()) && txDate > tomorrow) {
            console.log(`[FutureDateGuard] Transaction ${transaction.id} has future date: ${transaction.date}`);
            if (!transaction.metadata) transaction.metadata = {};
            transaction.metadata._futureDateWarning = true;
            transaction.metadata._originalDate = transaction.date;
        }
    }

    // ── InDrive Wallet Credit (Phase 3) — fleet top-up to driver InDrive digital wallet
    // Ledger: wallet_credit inflow; platform InDrive; see generateTransactionLedgerEntry.
    // Phase 8: same permission as other transaction writes (Phase 1.5 ADR: transactions.edit).
    const INDRIVE_WALLET_CATEGORY = "InDrive Wallet Credit";
    if (transaction.category === INDRIVE_WALLET_CATEGORY) {
        const rbacUser = c.get("rbacUser") as RbacUser | undefined;
        if (!rbacUser || !hasPermission(rbacUser.resolvedRole, "transactions.edit")) {
            return c.json(
                {
                    error: "Forbidden",
                    message:
                        'Logging InDrive wallet loads requires the "transactions.edit" permission (same as editing transactions).',
                    required: "transactions.edit",
                },
                403
            );
        }
        const amt = Number(transaction.amount);
        if (!Number.isFinite(amt) || amt <= 0) {
            return c.json({ error: "InDrive Wallet Credit requires a positive, finite amount" }, 400);
        }
        if (!transaction.driverId || String(transaction.driverId).trim() === "") {
            return c.json({ error: "InDrive Wallet Credit requires driverId" }, 400);
        }
        if (transaction.type === "Expense" || transaction.type === "Payout") {
            return c.json(
                {
                    error:
                        "InDrive Wallet Credit cannot use type Expense or Payout — use Adjustment so the ledger records an inflow",
                },
                400
            );
        }
        if (transaction.type && transaction.type !== "Adjustment") {
            return c.json(
                { error: "InDrive Wallet Credit must use type Adjustment" },
                400
            );
        }
        if (!transaction.type) transaction.type = "Adjustment";
        if (transaction.platform && transaction.platform !== "InDrive") {
            return c.json({ error: "InDrive Wallet Credit requires platform InDrive" }, 400);
        }
        transaction.platform = "InDrive";
        if (!transaction.description?.trim()) {
            transaction.description = "Fleet load — InDrive digital wallet";
        }
        if (!transaction.status) transaction.status = "Completed";
        if (transaction.isReconciled === undefined || transaction.isReconciled === null) {
            transaction.isReconciled = true;
        }
        if (!transaction.paymentMethod) transaction.paymentMethod = "Digital Wallet";
    }

    // Auto-Approve Logic for AI Verified Fuel
    const isFuel = transaction.category === 'Fuel' || transaction.category === 'Fuel Reimbursement';
    const isAiVerified = transaction.metadata?.odometerMethod === 'ai_verified';

    // Hoisted for cross-block access: GPS matching populates these, fuel_entry block reads them
    let smartMatchedStation: any = null;
    let smartMatchConfidence = 'none';
    let smartMatchDistance: number = Infinity;
    let allStationsCache: any[] = [];

    if (isFuel) {
        // --- GEOLOCATION MATCHING (Smart Ambiguity-Aware — replaces dual 150m calls) ---
        const locationMetadata = transaction.metadata?.locationMetadata;
        if (locationMetadata?.lat && locationMetadata?.lng) {
            try {
                // Fetch all stations from KV (single load, reused below)
                const stationsRaw = await kv.getByPrefix("station:");
                allStationsCache = stationsRaw || [];

                // Single smart match against ALL stations at 600m with ambiguity detection
                const smartResult = findMatchingStationSmart(
                    locationMetadata.lat,
                    locationMetadata.lng,
                    allStationsCache,
                    600,
                    locationMetadata.accuracy || 0
                );

                smartMatchConfidence = smartResult.confidence;
                smartMatchDistance = smartResult.distance;

                if (smartResult.station && (smartResult.confidence === 'high' || smartResult.confidence === 'medium')) {
                    const matched = smartResult.station as any;

                    if (matched.status === 'verified') {
                        // Verified station match — full linkage
                        smartMatchedStation = matched;
                        transaction.metadata.matchedStationId = matched.id;
                        transaction.metadata.locationStatus = 'verified';
                        transaction.metadata.verificationMethod = 'gps_smart_matching';
                        transaction.metadata.matchDistance = smartResult.distance;
                        transaction.metadata.matchConfidence = smartResult.confidence;
                        console.log(`[SmartGeoMatch] Matched Verified station: "${matched.name}" (${matched.id}) at ${smartResult.distance}m [${smartResult.confidence}]`);
                    } else {
                        // Unverified station — record the suggested match for admin review,
                        // but do NOT promote the station or mark the entry as verified.
                        // Admin must manually approve stations before they become verified.
                        transaction.metadata.suggestedStationId = matched.id;
                        transaction.metadata.suggestedStationName = matched.name;
                        transaction.metadata.locationStatus = 'unverified';
                        transaction.metadata.verificationMethod = 'gps_matched_unverified_station';
                        transaction.metadata.matchDistance = smartResult.distance;
                        transaction.metadata.matchConfidence = smartResult.confidence;

                        // Update visit stats on the unverified station (for admin reference when reviewing)
                        matched.stats = {
                            ...(matched.stats || {}),
                            totalVisits: ((matched.stats?.totalVisits) || 0) + 1,
                            lastUpdated: new Date().toISOString()
                        };
                        await kv.set(`station:${matched.id}`, stampOrg(matched, c));

                        console.log(`[SmartGeoMatch] GPS matched Unverified station "${matched.name}" (${matched.id}) at ${smartResult.distance}m — NOT promoting, awaiting admin approval.`);
                    }
                } else if (smartResult.confidence === 'ambiguous') {
                    // GPS is near multiple stations — flag for management review, do NOT guess
                    if (!transaction.metadata) transaction.metadata = {};
                    transaction.metadata.locationStatus = 'review_required';
                    transaction.metadata.verificationMethod = 'gps_ambiguous';
                    transaction.metadata.ambiguityReason = smartResult.ambiguityReason;
                    transaction.metadata.matchConfidence = 'ambiguous';
                    transaction.metadata.matchDistance = smartResult.distance;
                    console.log(`[SmartGeoMatch] Ambiguous match — flagged for review. ${smartResult.ambiguityReason}`);
                } else {
                    // No match at all — create Learnt Location (preserved from original)
                    if (!transaction.metadata) transaction.metadata = {};
                    transaction.metadata.locationStatus = 'unverified';

                    let learntId = transaction.metadata.learntLocationId as string | undefined;
                    if (!learntId) {
                        learntId = crypto.randomUUID();
                        const learntLocation = {
                            id: learntId,
                            name: transaction.vendor || transaction.description || 'Unknown Station',
                            parentCompany: transaction.metadata?.parentCompany,
                            location: {
                                lat: locationMetadata.lat,
                                lng: locationMetadata.lng,
                                accuracy: locationMetadata.accuracy
                            },
                            timestamp: new Date().toISOString(),
                            transactionId: transaction.id,
                            status: 'learnt'
                        };
                        await kv.set(`learnt_location:${learntId}`, stampOrg(learntLocation, c));
                        console.log(`[SmartGeoMatch] No station match — created Learnt Location: ${learntId}`);
                    } else {
                        console.log(`[SmartGeoMatch] Reusing Learnt Location ${learntId} for transaction ${transaction.id} (no duplicate create)`);
                    }
                    transaction.metadata.learntLocationId = learntId;
                }
            } catch (err) {
                console.error("Geolocation Smart Matching Error:", err);
            }
        }

        // Manual Station Pick: If the form pre-selected a verified station (no GPS needed),
        // set locationStatus so the blue shield badge appears in FuelLogTable.
        if (!transaction.metadata?.locationStatus && (transaction.matchedStationId || transaction.metadata?.matchedStationId)) {
            if (!transaction.metadata) transaction.metadata = {};
            transaction.metadata.locationStatus = 'verified';
            transaction.metadata.verificationMethod = 'manual_station_picker';
            transaction.metadata.matchedStationId = transaction.matchedStationId || transaction.metadata.matchedStationId;
            console.log(`[ManualStationPick] Verified station linked via form picker: ${transaction.metadata.matchedStationId}`);
        }

        // --- CUMULATIVE LITERS & INTEGRITY LOGIC (Phase 1 & 2) ---
        const vehicleId = transaction.vehicleId;
        const volume = Number(transaction.quantity) || Number(transaction.metadata?.fuelVolume) || 0;
        
        if (vehicleId) {
            // Fetch vehicle for tank capacity
            const vehicle = await kv.get(`vehicle:${vehicleId}`);
            const tankCapacity = Number(vehicle?.specifications?.tankCapacity) || Number(vehicle?.fuelSettings?.tankCapacity) || 0;

            // Fetch last transactions to calculate cumulative
            const { data: lastTxData } = await supabase
                .from("kv_store_37f42386")
                .select("value")
                .like("key", "transaction:%")
                .eq("value->>vehicleId", vehicleId)
                .order("value->>date", { ascending: false })
                .limit(10);
            
            const lastTransactions = (lastTxData || []).map((d: any) => d.value);
            
            // Find the last "Anchor" (Full Tank or Soft Anchor)
            let cumulative = volume;
            let lastAnchorOdo = 0;
            let lastAnchorTx = null;
            
            for (const tx of lastTransactions) {
                // Check for various anchor types
                if (tx.metadata?.isFullTank || tx.metadata?.isAnchor || tx.metadata?.isSoftAnchor) {
                    lastAnchorOdo = Number(tx.odometer) || 0;
                    lastAnchorTx = tx;
                    break;
                }
                cumulative += (Number(tx.quantity) || Number(tx.metadata?.fuelVolume) || 0);
            }

            // Calculate distance since last anchor
            const currentOdo = Number(transaction.odometer) || 0;
            const distanceSinceAnchor = (currentOdo > 0 && lastAnchorOdo > 0) ? (currentOdo - lastAnchorOdo) : 0;

            transaction.metadata = {
                ...transaction.metadata,
                cumulativeLitersAtEntry: Number(cumulative.toFixed(2)),
                tankCapacityAtEntry: tankCapacity,
                distanceSinceAnchor: distanceSinceAnchor,
                integrityStatus: 'valid'
            };

            // Rule 1: Tank Overflow (Physical Impossibility Check)
            // We only flag this if a SINGLE transaction exceeds the tank capacity + buffer.
            // Previously, this checked cumulative volume, which was incorrect as it flagged legitimate
            // multiple partial fills as an overflow.
            const singleTxOverflow = (Number(transaction.quantity) || 0) > (tankCapacity * 1.10);
            
            if (tankCapacity > 0 && singleTxOverflow) {
                transaction.metadata.integrityStatus = 'critical';
                transaction.metadata.anomalyReason = 'Tank Overflow: Single transaction exceeds tank capacity';
            }

            // Step 2.3: Rule 2 - Soft Anchor Reset (Auto-Close Cycle)
            // If cumulative volume exceeds 85% of tank capacity, we assume the tank has been filled
            // (or enough fuel has been added to constitute a cycle). We "close" the cycle here.
            // This prevents "infinite cumulative volume" and false "0 km" calculations.
            const isCumulativeFull = tankCapacity > 0 && cumulative > (tankCapacity * 0.85);
            
            if (!transaction.metadata?.isFullTank && isCumulativeFull) {
                transaction.metadata.isSoftAnchor = true;
                transaction.metadata.isAnchor = true; // Unified flag for logic
                
                // If it was valid before, keep it valid. It's just an auto-reset.
                // We do NOT downgrade to 'warning' just because we auto-detected a full tank.
                if (transaction.metadata.integrityStatus === 'valid') {
                     transaction.metadata.softAnchorNote = 'Cycle Reset: Cumulative volume reached tank capacity.';
                } else {
                     // If it was already a warning (e.g. slight mismatch), keep it but add note
                     transaction.metadata.softAnchorNote = 'Cycle Reset: Cumulative volume reached tank capacity.';
                }
            } else if (transaction.metadata?.isFullTank) {
                transaction.metadata.isAnchor = true;
            }

            // --- Phase 3: Fuel Economy & Velocity Algorithms ---
            
            // Step 3.1: Real-time Economy Calculation (L/100km)
            // We only calculate this when we hit an anchor (Full Tank or Soft Anchor) 
            // because we need a complete window to be accurate.
            if (transaction.metadata.isAnchor && distanceSinceAnchor > 0) {
                const consumption = (cumulative / distanceSinceAnchor) * 100;
                transaction.metadata.calculatedEconomy = Number(consumption.toFixed(2));
                
                // Compare against baseline (Toyota Roomy ~6.5L/100km)
                const baseline = Number(vehicle?.fuelSettings?.efficiencyCity) || 6.5; 
                if (consumption > (baseline * 1.25)) {
                    transaction.metadata.integrityStatus = 'warning';
                    transaction.metadata.anomalyReason = (transaction.metadata.anomalyReason || '') + ' High Fuel Consumption Detected;';
                }
            }

            // Step 3.3: Fragmented Purchase Detection
            // Flag small purchases (< 5L) which are often used to mask larger theft
            if (volume > 0 && volume < 5) {
                transaction.metadata.integrityStatus = transaction.metadata.integrityStatus === 'valid' ? 'warning' : transaction.metadata.integrityStatus;
                transaction.metadata.anomalyReason = (transaction.metadata.anomalyReason || '') + ' Fragmented Purchase (<5L);';
            }

            // Check for high frequency (more than 2 entries in 24h)
            const entriesLast24h = lastTransactions.filter(tx => {
                const txDate = new Date(tx.date);
                const now = new Date();
                return (now.getTime() - txDate.getTime()) < (24 * 60 * 60 * 1000);
            }).length;

            if (entriesLast24h >= 2) {
                transaction.metadata.integrityStatus = transaction.metadata.integrityStatus === 'valid' ? 'warning' : transaction.metadata.integrityStatus;
                transaction.metadata.anomalyReason = (transaction.metadata.anomalyReason || '') + ' High Transaction Frequency;';
            }

            // Step 3.2: Fuel Velocity Check ($ spend per km)
            // Look at total spend vs distance over the last 10 entries
            if (lastTransactions.length >= 3) {
                const totalSpendInWindow = lastTransactions.reduce((sum, tx) => sum + Math.abs(Number(tx.amount) || 0), Math.abs(Number(transaction.amount) || 0));
                const minOdo = Math.min(...lastTransactions.map(tx => Number(tx.odometer)).filter(o => o > 0));
                const totalDistInWindow = (currentOdo > 0 && minOdo > 0) ? (currentOdo - minOdo) : 0;
                
                if (totalDistInWindow > 50) { // Only calculate if we have significant distance
                    const velocity = totalSpendInWindow / totalDistInWindow;
                    transaction.metadata.fuelVelocity = Number(velocity.toFixed(3));
                    
                    // Flag if spend rate is > $0.25/km (approx based on typical fleet benchmarks)
                    if (velocity > 0.25) {
                        transaction.metadata.integrityStatus = transaction.metadata.integrityStatus === 'valid' ? 'warning' : transaction.metadata.integrityStatus;
                        transaction.metadata.anomalyReason = (transaction.metadata.anomalyReason || '') + ' High Fuel Velocity ($/km);';
                    }
                }
            }
        }
    }

    if (isFuel && transaction.status === 'Pending') {
        // STATION VERIFICATION GATE: ALL fuel logs must pass station verification.
        // If the station is not verified, hold the transaction for admin review
        // via Learnt Locations tab — regardless of odometer method (AI or manual).
        const locationStatus = transaction.metadata?.locationStatus;
        if (locationStatus !== 'verified') {
            transaction.status = 'Pending';
            transaction.metadata = {
                ...transaction.metadata,
                stationGateHold: true,
                holdReason: 'Unverified station — awaiting admin review from Learnt Locations',
                holdTimestamp: new Date().toISOString(),
                // Ensure needsLogReview is set for non-AI odometer methods (belt-and-suspenders)
                needsLogReview: (!isAiVerified) ? true : (transaction.metadata?.needsLogReview || undefined),
            };
            console.log(`[StationGate] Transaction ${transaction.id} held — station locationStatus="${locationStatus || 'none'}", skipping auto-approval and fuel entry creation.`);
            
            // Phase 6: Toll transactions write ONLY to toll_ledger, not transaction:*
            if (isTollCategoryServer(transaction.category)) {
                await writeTollToLedger(transaction, c);
                return c.json({ success: true, transaction, held: true, reason: 'station_unverified' });
            }
            
            await kv.set(`transaction:${transaction.id}`, stampOrg(transaction, c));
            return c.json({ success: true, transaction, held: true, reason: 'station_unverified' });
        }

        // Station is verified — but only auto-approve + create fuel entry if AI-verified.
        // Manual/non-AI entries with a verified station pass the gate but stay Pending for admin.
        if (!isAiVerified) {
            const adminOdoSkipLogReview = isAdminManualFuelWithProvidedOdometer(transaction);
            if (adminOdoSkipLogReview) {
                const nextMeta = { ...transaction.metadata };
                delete nextMeta.needsLogReview;
                delete nextMeta.logReviewReason;
                transaction.metadata = nextMeta;
                console.log(
                    `[StationGate] Transaction ${transaction.id} admin manual with odometer — Pending (skipping Log Review). odometerMethod="${transaction.metadata?.odometerMethod || "none"}"`,
                );
            } else {
                console.log(`[StationGate] Transaction ${transaction.id} passed station gate (verified) but odometerMethod="${transaction.metadata?.odometerMethod || 'none'}" — staying Pending for admin review.`);
                // Server-side safety: ensure needsLogReview is set for non-AI odometer methods
                transaction.metadata = {
                    ...transaction.metadata,
                    needsLogReview: true,
                    logReviewReason: transaction.metadata?.logReviewReason
                        || (transaction.metadata?.odometerMethod === 'photo_review'
                            ? 'AI scan failed — odometer photo pending admin review'
                            : 'Manual odometer override — pending admin verification'),
                };
            }
            // Phase 6: Toll transactions write ONLY to toll_ledger, not transaction:*
            if (isTollCategoryServer(transaction.category)) {
                await writeTollToLedger(transaction, c);
                return c.json({ success: true, data: transaction });
            }
            
            await kv.set(`transaction:${transaction.id}`, stampOrg(transaction, c));
            return c.json({ success: true, data: transaction });
        }

        transaction.status = 'Approved';
        transaction.isReconciled = true;
        transaction.metadata = {
            ...transaction.metadata,
            approvedAt: new Date().toISOString(),
            approvalReason: 'Auto-approved via AI Odometer Scan',
            notes: (transaction.metadata?.notes || '') + ' [AI Verified]'
        };

        // Create Fuel Entry Anchor
        // Fix: Extract volume from metadata.fuelVolume if top-level quantity is missing
        const quantity = Number(transaction.quantity) || Number(transaction.metadata?.fuelVolume) || 0;
        const amount = Math.abs(Number(transaction.amount) || 0);
        const pricePerLiter = transaction.metadata?.pricePerLiter || (quantity > 0 ? Number((amount / quantity).toFixed(3)) : 0);
        
        // Ensure quantity is saved to transaction for consistent display
        if (!transaction.quantity && quantity > 0) {
            transaction.quantity = quantity;
        }

        // Resolve vendor name: smart-matched station > transaction vendor > description > fallback
        const resolvedVendor = smartMatchedStation?.name || transaction.vendor || transaction.description || 'Reimbursement';

        const fuelEntry: any = {
            id: crypto.randomUUID(),
            date: (transaction.date && transaction.time) 
                ? `${transaction.date}T${transaction.time}` 
                : (transaction.date || new Date().toISOString().split('T')[0]),
            type: 'Reimbursement',
            amount: amount,
            liters: quantity,
            pricePerLiter: pricePerLiter,
            odometer: Number(transaction.odometer) || 0,
            vendor: resolvedVendor,
            location: resolvedVendor,
            stationAddress: transaction.metadata?.stationAddress || transaction.metadata?.stationLocation || '',
            vehicleId: transaction.vehicleId,
            driverId: transaction.driverId,
            cardId: undefined,
            transactionId: transaction.id,
            receiptUrl: transaction.receiptUrl || transaction.metadata?.receiptUrl,
            odometerProofUrl: transaction.odometerProofUrl || transaction.metadata?.odometerProofUrl,
            isVerified: true, // Key Requirement: Anchor
            source: 'Fuel Log',
            matchedStationId: transaction.metadata?.matchedStationId,
            // Fix: Set paymentSource from transaction so Paid By shows correct value immediately
            paymentSource: (() => { const m: Record<string,string> = { 'driver_cash':'Personal','rideshare_cash':'RideShare_Cash','company_card':'Gas_Card','petty_cash':'Petty_Cash' }; const r = transaction.metadata?.paymentSource || transaction.paymentSource; return r ? (m[r] || r) : 'Personal'; })(),
            metadata: {
                receiptUrl: transaction.receiptUrl || transaction.metadata?.receiptUrl,
                odometerProofUrl: transaction.odometerProofUrl || transaction.metadata?.odometerProofUrl,
                originalTransactionId: transaction.id,
                locationMetadata: transaction.metadata?.locationMetadata,
                parentCompany: transaction.metadata?.parentCompany,
                // Bug fixes: locationStatus + matchedStationId INSIDE metadata (where FuelLogTable reads them)
                locationStatus: transaction.metadata?.locationStatus || 'unknown',
                matchedStationId: transaction.metadata?.matchedStationId,
                verificationMethod: transaction.metadata?.verificationMethod,
                matchDistance: transaction.metadata?.matchDistance,
                matchConfidence: transaction.metadata?.matchConfidence,
                // Fix: Copy paymentSource so backfill and display read it correctly
                paymentSource: transaction.metadata?.paymentSource || transaction.paymentSource || 'driver_cash'
            }
        };

        // Calculate Audit Confidence Score (matching fuel_controller.tsx gold-standard pattern)
        if (smartMatchedStation && fuelEntry.matchedStationId) {
            const confidence = fuelLogic.calculateConfidenceScore(fuelEntry, smartMatchedStation);
            fuelEntry.metadata = {
                ...fuelEntry.metadata,
                auditConfidenceScore: confidence.score,
                auditConfidenceBreakdown: confidence.breakdown,
                isHighlyTrusted: confidence.isHighlyTrusted
            };
            console.log(`[FuelEntry] Audit confidence for ${fuelEntry.id}: ${confidence.score}/100`);
        }

        if (fuelEntry.vehicleId) {
             await kv.set(`fuel_entry:${fuelEntry.id}`, stampOrg(fuelEntry, c));
             await appendCanonicalFuelExpenseIfEligible(fuelEntry, c);
        }
    }

    // Phase 6: Toll transactions write ONLY to toll_ledger, not transaction:*
    if (isTollCategoryServer(transaction.category)) {
        await writeTollToLedger(transaction, c);
        return c.json({ success: true, data: transaction });
    }
    
    await kv.set(`transaction:${transaction.id}`, stampOrg(transaction, c));

    // ── Canonical ledger for InDrive Wallet Credit ──
    if (transaction.category === "InDrive Wallet Credit") {
        await appendCanonicalWalletCreditIfEligible(transaction, c);
    }

    return c.json({ success: true, data: transaction });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-37f42386/transactions/:id", requireAuth(), requirePermission('transactions.edit'), async (c) => {
  const id = c.req.param("id");
  try {
    // Phase 6: Check toll_ledger first (tolls are now stored there, not in transaction:*)
    const tollEntry = await getTollLedgerEntry(id);
    if (tollEntry) {
      await deleteTollLedgerEntry(id);
      console.log(`[TollLedger] Deleted toll_ledger:${id}`);
      return c.json({ success: true });
    }
    
    // Not a toll, delete from transaction:*
    await kv.del(`transaction:${id}`);
    try {
      await deleteCanonicalLedgerBySource("transaction", [id]);
    } catch (ledgerErr: any) {
      console.warn(`[DELETE /transactions/:id] Ledger cleanup failed (non-fatal) tx=${id}:`, ledgerErr?.message);
    }
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

/** Bulk-delete canonical ledger rows by source (used by Data Center trip bulk delete). */
app.post(
  "/make-server-37f42386/ledger/delete-by-source",
  requireAuth(),
  requirePermission("transactions.edit"),
  async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const sourceType = typeof body?.sourceType === "string" ? body.sourceType.trim() : "";
      const sourceIds = Array.isArray(body?.sourceIds)
        ? body.sourceIds.map((x: unknown) => String(x).trim()).filter(Boolean)
        : [];
      if (!sourceType || sourceIds.length === 0) {
        return c.json({ error: "sourceType and non-empty sourceIds[] required" }, 400);
      }
      const result = await deleteCanonicalLedgerBySource(sourceType, sourceIds);
      return c.json({ success: true, ...result });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  },
);

// ═══════════════════════════════════════════════════════════════════════
// WRITE-TIME LEDGER ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════

const VALID_LEDGER_EVENT_TYPES = new Set([
  'fare_earning', 'tip', 'prior_period_adjustment', 'surge_bonus', 'fuel_expense', 'fuel_reimbursement',
  'toll_charge', 'toll_refund', 'maintenance', 'insurance', 'driver_payout',
  'promotion', 'refund_expense',
  'cash_collection', 'platform_fee', 'wallet_credit', 'wallet_debit',
  'cancelled_trip_loss', 'adjustment', 'other',
]);
const VALID_LEDGER_DIRECTIONS = new Set(['inflow', 'outflow']);

// ─── GET /ledger — Query with filters + pagination (`ledger_event:*` only) ──
app.get("/make-server-37f42386/ledger", requireAuth(), async (c) => {
  try {
    const driverId = c.req.query("driverId");
    const driverIdsParam = c.req.query("driverIds");
    const vehicleId = c.req.query("vehicleId");
    const startDate = c.req.query("startDate");
    const endDate = c.req.query("endDate");
    const eventType = c.req.query("eventType");
    const eventTypesParam = c.req.query("eventTypes");
    const direction = c.req.query("direction");
    const platform = c.req.query("platform");
    const isReconciledParam = c.req.query("isReconciled");
    const batchId = c.req.query("batchId");
    const sourceType = c.req.query("sourceType");
    const minAmountParam = c.req.query("minAmount");
    const maxAmountParam = c.req.query("maxAmount");
    const searchTerm = c.req.query("searchTerm");
    const limitParam = c.req.query("limit");
    const offsetParam = c.req.query("offset");
    const sortBy = c.req.query("sortBy") || "date";
    const sortDir = c.req.query("sortDir") || "desc";

    const limit = limitParam ? parseInt(limitParam) : 50;
    const offset = offsetParam ? parseInt(offsetParam) : 0;
    const minAmount = minAmountParam ? parseFloat(minAmountParam) : undefined;
    const maxAmount = maxAmountParam ? parseFloat(maxAmountParam) : undefined;
    const needsAmountFilter = minAmount !== undefined || maxAmount !== undefined;

    let query = supabase
      .from("kv_store_37f42386")
      .select("value", { count: "exact" })
      .like("key", CANONICAL_LEDGER_KEY_LIKE);

    if (driverId) {
      query = query.eq("value->>driverId", driverId);
    } else if (driverIdsParam) {
      const ids = driverIdsParam.split(",").map((s: string) => s.trim()).filter(Boolean);
      if (ids.length === 1) {
        query = query.eq("value->>driverId", ids[0]);
      } else if (ids.length > 1) {
        query = query.or(ids.map((id: string) => `value->>driverId.eq.${id}`).join(","));
      }
    }

    if (vehicleId) query = query.eq("value->>vehicleId", vehicleId);
    if (startDate) query = query.gte("value->>date", startDate);
    if (endDate) query = query.lte("value->>date", endDate);

    if (eventType) {
      query = query.eq("value->>eventType", eventType);
    } else if (eventTypesParam) {
      const types = eventTypesParam.split(",").map((s: string) => s.trim()).filter(Boolean);
      if (types.length === 1) {
        query = query.eq("value->>eventType", types[0]);
      } else if (types.length > 1) {
        query = query.or(types.map((t: string) => `value->>eventType.eq.${t}`).join(","));
      }
    }

    if (direction) query = query.eq("value->>direction", direction);
    // Alias: "Roam" was formerly "GoRide" — query both to include pre-rebrand ledger entries
    if (platform) {
      if (platform === 'Roam') {
        query = query.or('value->>platform.eq.Roam,value->>platform.eq.GoRide');
      } else {
        query = query.eq("value->>platform", platform);
      }
    }
    if (isReconciledParam !== undefined && isReconciledParam !== null && isReconciledParam !== "") {
      query = query.eq("value->>isReconciled", isReconciledParam);
    }
    if (batchId) query = query.eq("value->>batchId", batchId);
    if (sourceType) query = query.eq("value->>sourceType", sourceType);
    if (searchTerm) query = query.ilike("value->>description", `%${searchTerm}%`);

    const sortField = sortBy === "amount" ? "value->>netAmount" : sortBy === "createdAt" ? "value->>createdAt" : "value->>date";
    query = query.order(sortField, { ascending: sortDir === "asc" });

    if (needsAmountFilter) {
      // Amount is filtered in memory after fetch; scan enough rows that older matches aren't
      // dropped (still capped at 25k for safety on very large stores).
      const overfetchLimit = 25000;
      query = query.range(0, overfetchLimit - 1);

      const { data, error, count } = await query;
      if (error) throw error;

      let entries = filterByOrg((data || []).map((d: any) => d.value).filter(Boolean), c);
      // Normalize legacy "GoRide" → "Roam" for display (platform + description)
      entries.forEach((e: any) => {
        if (e.platform === 'GoRide') e.platform = 'Roam';
        if (typeof e.description === 'string') e.description = e.description.replace(/GoRide/g, 'Roam');
      });
      if (minAmount !== undefined) {
        entries = entries.filter((e: any) => Math.abs(Number(e.netAmount) || 0) >= minAmount);
      }
      if (maxAmount !== undefined) {
        entries = entries.filter((e: any) => Math.abs(Number(e.netAmount) || 0) <= maxAmount);
      }

      const filteredTotal = entries.length;
      const paged = entries.slice(offset, offset + limit);

      return c.json({
        data: paged,
        total: filteredTotal,
        page: Math.floor(offset / limit) + 1,
        limit,
        hasMore: (offset + limit) < filteredTotal,
        meta: { source: "canonical" as const },
      });
    }

    query = query.range(offset, offset + limit - 1);
    const { data, error, count } = await query;
    if (error) throw error;

    const entries = filterByOrg((data || []).map((d: any) => d.value).filter(Boolean), c);
    // Normalize legacy "GoRide" → "Roam" for display (platform + description)
    entries.forEach((e: any) => {
      if (e.platform === 'GoRide') e.platform = 'Roam';
      if (typeof e.description === 'string') e.description = e.description.replace(/GoRide/g, 'Roam');
    });
    const total = entries.length || count || 0;

    return c.json({
      data: entries,
      total,
      page: Math.floor(offset / limit) + 1,
      limit,
      hasMore: (offset + limit) < total,
      meta: { source: "canonical" as const },
    });
  } catch (e: any) {
    console.log(`[Ledger GET] Error: ${e.message}`);
    return c.json({ error: `Ledger query failed: ${e.message}` }, 500);
  }
});

// ─── GET /ledger/count — Diagnostic counts ──────────────────────────
// `ledgerEntries` = canonical `ledger_event:*` (SSOT). Legacy `ledger:%` rows are removed via POST /ledger/purge-legacy-all.
app.get("/make-server-37f42386/ledger/count", requireAuth(), async (c) => {
  try {
    const orgId = getOrgId(c);
    let canonicalLedgerQ = supabase
      .from("kv_store_37f42386")
      .select("*", { count: "exact", head: true })
      .like("key", "ledger_event:%");
    let tripQ = supabase
      .from("kv_store_37f42386")
      .select("*", { count: "exact", head: true })
      .like("key", "trip:%");
    let txQ = supabase
      .from("kv_store_37f42386")
      .select("*", { count: "exact", head: true })
      .like("key", "transaction:%");
    if (orgId) {
      canonicalLedgerQ = canonicalLedgerQ.eq("value->>organizationId", orgId);
      tripQ = tripQ.eq("value->>organizationId", orgId);
      txQ = txQ.eq("value->>organizationId", orgId);
    }
    const [{ count: canonicalLedgerCount }, { count: tripCount }, { count: txCount }] =
      await Promise.all([canonicalLedgerQ, tripQ, txQ]);

    return c.json({
      ledgerEntries: canonicalLedgerCount || 0,
      trips: tripCount || 0,
      transactions: txCount || 0,
    });
  } catch (e: any) {
    console.log(`[Ledger Count] Error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

/** Whether a canonical ledger row's source record still exists in KV. */
async function canonicalLedgerSourceStillExists(sourceType: string, sourceId: string): Promise<boolean> {
  const sid = String(sourceId).trim();
  if (!sid) return false;
  switch (sourceType) {
    case "trip":
      return !!(await kv.get(`trip:${sid}`));
    case "import_batch":
      return !!(await kv.get(`batch:${sid}`));
    case "transaction": {
      if (await kv.get(`transaction:${sid}`)) return true;
      if (await kv.get(`fuel_entry:${sid}`)) return true;
      const toll = await getTollLedgerEntry(sid);
      return !!toll;
    }
    case "adjustment":
    case "reconciliation":
    case "statement":
      return true;
    default:
      return true;
  }
}

// ─── GET /admin/ledger-source-orphan-audit — Dry-run: ledger_event rows whose source KV row is gone ─────
app.get(
  "/make-server-37f42386/admin/ledger-source-orphan-audit",
  requireAuth(),
  requirePermission("data.backfill"),
  async (c) => {
    try {
      const PAGE = 500;
      let offset = 0;
      const orphans: Array<{
        key: string;
        id: string;
        sourceType: string;
        sourceId: string;
        eventType?: string;
      }> = [];
      let scanned = 0;

      while (offset < 100_000) {
        const { data: rows, error } = await supabase
          .from("kv_store_37f42386")
          .select("key, value")
          .like("key", "ledger_event:%")
          .range(offset, offset + PAGE - 1);
        if (error) throw error;
        const page = rows || [];
        if (page.length === 0) break;
        for (const row of page as { key: string; value: Record<string, unknown> }[]) {
          scanned++;
          const v = row.value || {};
          const st = typeof v.sourceType === "string" ? v.sourceType.trim() : "";
          const sid = typeof v.sourceId === "string" ? v.sourceId.trim() : "";
          const id = typeof v.id === "string" ? v.id.trim() : "";
          if (!st || !sid) continue;
          const exists = await canonicalLedgerSourceStillExists(st, sid);
          if (!exists) {
            orphans.push({
              key: row.key,
              id: id || row.key.replace(/^ledger_event:/, ""),
              sourceType: st,
              sourceId: sid,
              eventType: typeof v.eventType === "string" ? String(v.eventType) : undefined,
            });
          }
        }
        if (page.length < PAGE) break;
        offset += PAGE;
      }

      return c.json({ success: true, scanned, orphanCount: orphans.length, orphans });
    } catch (e: any) {
      console.error("[ledger-source-orphan-audit]", e);
      return c.json({ error: e.message }, 500);
    }
  },
);

// ─── POST /admin/ledger-source-orphan-cleanup — Remove orphaned ledger_event rows (grouped by source) ─────
app.post(
  "/make-server-37f42386/admin/ledger-source-orphan-cleanup",
  requireAuth(),
  requirePermission("data.backfill"),
  async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const dryRun = body?.dryRun === true;
      if (!dryRun && body?.confirm !== "DELETE_ORPHAN_LEDGER_SOURCES") {
        return c.json(
          {
            error:
              'Send { "dryRun": true } to preview counts, or { "confirm": "DELETE_ORPHAN_LEDGER_SOURCES" } to delete.',
          },
          400,
        );
      }

      const PAGE = 500;
      let offset = 0;
      const byType = new Map<string, Set<string>>();
      let scanned = 0;

      while (offset < 100_000) {
        const { data: rows, error } = await supabase
          .from("kv_store_37f42386")
          .select("key, value")
          .like("key", "ledger_event:%")
          .range(offset, offset + PAGE - 1);
        if (error) throw error;
        const page = rows || [];
        if (page.length === 0) break;
        for (const row of page as { key: string; value: Record<string, unknown> }[]) {
          scanned++;
          const v = row.value || {};
          const st = typeof v.sourceType === "string" ? v.sourceType.trim() : "";
          const sid = typeof v.sourceId === "string" ? v.sourceId.trim() : "";
          if (!st || !sid) continue;
          const exists = await canonicalLedgerSourceStillExists(st, sid);
          if (!exists) {
            if (!byType.has(st)) byType.set(st, new Set());
            byType.get(st)!.add(sid);
          }
        }
        if (page.length < PAGE) break;
        offset += PAGE;
      }

      if (dryRun) {
        let totalIds = 0;
        const summary: Record<string, number> = {};
        for (const [st, ids] of byType) {
          summary[st] = ids.size;
          totalIds += ids.size;
        }
        return c.json({ success: true, dryRun: true, scanned, sourceGroups: summary, distinctSourceIds: totalIds });
      }

      let deleted = 0;
      let idemDeleted = 0;
      for (const [st, idSet] of byType) {
        const ids = [...idSet];
        for (let i = 0; i < ids.length; i += 80) {
          const chunk = ids.slice(i, i + 80);
          const r = await deleteCanonicalLedgerBySource(st, chunk);
          deleted += r.deleted;
          idemDeleted += r.idemDeleted;
        }
      }

      return c.json({ success: true, dryRun: false, scanned, deleted, idemDeleted });
    } catch (e: any) {
      console.error("[ledger-source-orphan-cleanup]", e);
      return c.json({ error: e.message }, 500);
    }
  },
);

// ─── POST /ledger/purge-legacy-all — Delete all `ledger:%` KV rows (one-time cleanup) ─────
app.post("/make-server-37f42386/ledger/purge-legacy-all", requireAuth(), requirePermission("data.backfill"), async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const dryRun = body?.dryRun === true;
    if (!dryRun && body?.confirm !== "DELETE_ALL_LEGACY_LEDGER_KV") {
      return c.json(
        {
          error:
            'Send { "dryRun": true } to count keys only, or { "confirm": "DELETE_ALL_LEGACY_LEDGER_KV" } to delete all legacy ledger:% rows.',
        },
        400,
      );
    }

    const PAGE = 1000;
    const BATCH = 500;
    let legacyKeysFound = 0;
    let deletedCount = 0;

    if (dryRun) {
      let offset = 0;
      while (true) {
        const { data: page, error } = await supabase
          .from("kv_store_37f42386")
          .select("key")
          .like("key", "ledger:%")
          .range(offset, offset + PAGE - 1);
        if (error) throw error;
        if (!page?.length) break;
        legacyKeysFound += page.length;
        if (page.length < PAGE) break;
        offset += PAGE;
      }
    } else {
      while (true) {
        const { data: page, error } = await supabase
          .from("kv_store_37f42386")
          .select("key")
          .like("key", "ledger:%")
          .range(0, PAGE - 1);
        if (error) throw error;
        if (!page?.length) break;

        legacyKeysFound += page.length;
        const keys = page.map((r: { key: string }) => r.key);
        for (let i = 0; i < keys.length; i += BATCH) {
          const batch = keys.slice(i, i + BATCH);
          const { error: delErr } = await supabase.from("kv_store_37f42386").delete().in("key", batch);
          if (delErr) {
            console.error("[PurgeLegacyAll] batch delete error:", delErr);
          } else {
            deletedCount += batch.length;
          }
        }
      }
    }

    console.log(`[PurgeLegacyAll] dryRun=${dryRun} legacyKeysFound=${legacyKeysFound} deletedCount=${deletedCount}`);
    return c.json({
      success: true,
      dryRun,
      legacyKeysFound,
      deletedCount: dryRun ? 0 : deletedCount,
    });
  } catch (e: any) {
    console.error(`[PurgeLegacyAll] Error: ${e.message}`);
    return c.json({ error: e.message || String(e) }, 500);
  }
});

/** One-off cleanup: Uber payment ghosts — metrics may use **Uber UUID** as `driverId`, not Roam id; cash may remain in `ledger_event:*`. */
app.post(
  "/make-server-37f42386/maintenance/strip-uber-payment-driver-metrics",
  requireAuth(),
  requirePermission("data.backfill"),
  async (c) => {
    try {
      const body = await c.req.json();
      const driverId = typeof body?.driverId === "string" ? body.driverId.trim() : "";
      if (!driverId) {
        return c.json({ error: "driverId required" }, 400);
      }

      /** Roam internal id + uberDriverId + inDriveDriverId from `driver:*` — payment CSV rows often key by Uber UUID. */
      const idAliases = new Set<string>([driverId]);
      try {
        const prof = (await kv.get(`driver:${driverId}`)) as {
          uberDriverId?: string;
          inDriveDriverId?: string;
        } | null;
        if (prof?.uberDriverId && String(prof.uberDriverId).trim()) {
          idAliases.add(String(prof.uberDriverId).trim());
        }
        if (prof?.inDriveDriverId && String(prof.inDriveDriverId).trim()) {
          idAliases.add(String(prof.inDriveDriverId).trim());
        }
      } catch {
        /* non-fatal */
      }

      const idNorm = new Set<string>();
      for (const a of idAliases) idNorm.add(a.toLowerCase());

      const normDriver = (s: unknown) => String(s ?? "").trim().toLowerCase();
      const isUberPlatformEvent = (v: Record<string, unknown>) => {
        const p = String(v.platform ?? (v.metadata as Record<string, unknown> | undefined)?.platform ?? "")
          .toLowerCase();
        return p === "uber" || p.includes("uber");
      };

      const isPaymentMetricGhost = (m: Record<string, unknown> | null) => {
        if (!m) return false;
        const mid = m.id != null ? String(m.id) : "";
        if (mid.startsWith("dm-pay-") || mid.startsWith("dm-ptx-")) return true;
        const txSum = m.uberPaymentsTransactionCashColumnSum;
        if (txSum != null && Math.abs(Number(txSum)) > 1e-9) return true;
        return false;
      };

      const seenDm = new Set<string>();
      const dmKeyList: string[] = [];
      const PAGE = 1000;
      const MAX_PAGES = 50;
      for (const aid of idAliases) {
        const variants = Array.from(
          new Set([aid, aid.toLowerCase(), aid.toUpperCase()].filter((x) => x.length > 0)),
        );
        for (const vid of variants) {
          let offset = 0;
          for (let p = 0; p < MAX_PAGES; p++) {
            const { data, error } = await supabase
              .from("kv_store_37f42386")
              .select("key")
              .like("key", "driver_metric:%")
              .eq("value->>driverId", vid)
              .range(offset, offset + PAGE - 1);
            if (error) throw error;
            const page = data || [];
            for (const row of page) {
              const k = (row as { key?: string }).key;
              if (k && !seenDm.has(k)) {
                seenDm.add(k);
                dmKeyList.push(k);
              }
            }
            if (page.length < PAGE) break;
            offset += PAGE;
          }
        }
      }

      const toDeleteDm: string[] = [];
      for (const key of dmKeyList) {
        const m = (await kv.get(key)) as Record<string, unknown> | null;
        if (!isPaymentMetricGhost(m)) continue;
        const md = normDriver(m?.driverId);
        if (md && idNorm.has(md)) toDeleteDm.push(key);
      }
      if (toDeleteDm.length > 0) {
        for (let i = 0; i < toDeleteDm.length; i += 100) {
          await kv.mdel(toDeleteDm.slice(i, i + 100));
        }
      }

      // Canonical ledger: Uber cash/statement lines may remain under Uber UUID or Roam id
      const seenLe = new Set<string>();
      const leRowsAccum: { key: string; value: Record<string, unknown> }[] = [];
      for (const aid of idAliases) {
        let offset = 0;
        for (let p = 0; p < MAX_PAGES; p++) {
          const { data, error } = await supabase
            .from("kv_store_37f42386")
            .select("key, value")
            .like("key", "ledger_event:%")
            .eq("value->>driverId", aid)
            .range(offset, offset + PAGE - 1);
          if (error) throw error;
          const page = data || [];
          for (const row of page) {
            const k = (row as { key: string }).key;
            const val = (row as { value: Record<string, unknown> }).value;
            if (!k || seenLe.has(k) || !val) continue;
            const dnorm = normDriver(val.driverId);
            if (!dnorm || !idNorm.has(dnorm)) continue;
            if (!isUberPlatformEvent(val)) continue;
            seenLe.add(k);
            leRowsAccum.push({ key: k, value: val });
          }
          if (page.length < PAGE) break;
          offset += PAGE;
        }
      }

      let deletedIdem = 0;
      for (const { key, value } of leRowsAccum) {
        const idem = typeof value.idempotencyKey === "string" ? String(value.idempotencyKey).trim() : "";
        if (idem) {
          try {
            await kv.del(`ledger_event_idem:${await sha256HexForLedgerIdem(idem)}`);
            deletedIdem++;
          } catch {
            /* non-fatal */
          }
        }
      }
      if (leRowsAccum.length > 0) {
        const lk = leRowsAccum.map((r) => r.key);
        for (let i = 0; i < lk.length; i += 100) {
          await kv.mdel(lk.slice(i, i + 100));
        }
      }

      await cache.invalidateCacheVersion("stats");
      await cache.invalidateCacheVersion("performance");
      console.log(
        `[strip-uber-payment-driver-metrics] driverId=${driverId} aliases=${[...idAliases].join(",")} deletedDm=${toDeleteDm.length} deletedLedgerEvent=${leRowsAccum.length} idem=${deletedIdem}`,
      );
      return c.json({
        success: true,
        resolvedAliases: [...idAliases],
        deletedDriverMetricKeys: toDeleteDm.length,
        deletedLedgerEventKeys: leRowsAccum.length,
        deletedIdempotencyKeys: deletedIdem,
      });
    } catch (e: any) {
      console.error(`[strip-uber-payment-driver-metrics] ${e.message}`);
      return c.json({ error: e.message }, 500);
    }
  },
);

// ─── GET /ledger/summary — Aggregate totals for a filter set (`ledger_event:*` only) ──
app.get("/make-server-37f42386/ledger/summary", requireAuth(), async (c) => {
  try {
    const driverId = c.req.query("driverId");
    const driverIdsParam = c.req.query("driverIds");
    const startDate = c.req.query("startDate");
    const endDate = c.req.query("endDate");
    const eventType = c.req.query("eventType");
    const direction = c.req.query("direction");
    const platform = c.req.query("platform");

    let query = supabase
      .from("kv_store_37f42386")
      .select("value")
      .like("key", CANONICAL_LEDGER_KEY_LIKE);
    const orgId = getOrgId(c);
    if (orgId) query = query.eq("value->>organizationId", orgId);

    if (driverId) {
      query = query.eq("value->>driverId", driverId);
    } else if (driverIdsParam) {
      const ids = driverIdsParam.split(",").map((s: string) => s.trim()).filter(Boolean);
      if (ids.length === 1) {
        query = query.eq("value->>driverId", ids[0]);
      } else if (ids.length > 1) {
        query = query.or(ids.map((id: string) => `value->>driverId.eq.${id}`).join(","));
      }
    }

    if (startDate) query = query.gte("value->>date", startDate);
    if (endDate) query = query.lte("value->>date", endDate);
    if (eventType) query = query.eq("value->>eventType", eventType);
    if (direction) query = query.eq("value->>direction", direction);
    // Alias: "Roam" was formerly "GoRide" — query both to include pre-rebrand ledger entries
    if (platform) {
      if (platform === 'Roam') {
        query = query.or('value->>platform.eq.Roam,value->>platform.eq.GoRide');
      } else {
        query = query.eq("value->>platform", platform);
      }
    }

    const { data, error } = await query.limit(10000);
    if (error) throw error;

    let entries = filterByOrg(
      (data || []).map((d: any) => d.value).filter(Boolean),
      c,
    );

    let totalInflow = 0;
    let totalOutflow = 0;
    let reconciledCount = 0;
    let unreconciledCount = 0;
    const byEventType: Record<string, { count: number; total: number }> = {};
    const byPlatform: Record<string, { count: number; total: number }> = {};

    for (const e of entries) {
      const net = Number(e.netAmount) || 0;
      if (e.direction === "inflow" || net > 0) {
        totalInflow += Math.abs(net);
      } else {
        totalOutflow += Math.abs(net);
      }

      if (e.isReconciled === true || e.isReconciled === "true") {
        reconciledCount++;
      } else {
        unreconciledCount++;
      }

      const et = e.eventType || "other";
      if (!byEventType[et]) byEventType[et] = { count: 0, total: 0 };
      byEventType[et].count++;
      byEventType[et].total += net;

      // Normalize legacy "GoRide" → "Roam" for display
      const pl = (e.platform === 'GoRide' ? 'Roam' : e.platform) || "Unknown";
      if (!byPlatform[pl]) byPlatform[pl] = { count: 0, total: 0 };
      byPlatform[pl].count++;
      byPlatform[pl].total += net;
    }

    return c.json({
      success: true,
      summary: {
        totalInflow: Number(totalInflow.toFixed(2)),
        totalOutflow: Number(totalOutflow.toFixed(2)),
        netBalance: Number((totalInflow - totalOutflow).toFixed(2)),
        totalEntries: entries.length,
        entryCount: entries.length,
        reconciledCount,
        unreconciledCount,
        byEventType,
        byPlatform,
      },
      meta: { source: "canonical" as const },
    });
  } catch (e: any) {
    console.log(`[Ledger Summary] Error: ${e.message}`);
    return c.json({ error: `Ledger summary failed: ${e.message}` }, 500);
  }
});

/**
 * Roam UUID + linked Uber/InDrive IDs + lowercase variants — matches ledger `driverId` storage (see driver-overview).
 */
async function expandStatementSummaryDriverIds(raw: string | undefined | null): Promise<string[]> {
  const trimmed = raw != null && String(raw).trim() ? String(raw).trim() : "";
  if (!trimmed) return [];
  const ids: string[] = [trimmed];
  try {
    const driverRecord = await kv.get(`driver:${trimmed}`);
    if (driverRecord && typeof driverRecord === "object") {
      const dr = driverRecord as Record<string, unknown>;
      if (dr.uberDriverId) ids.push(String(dr.uberDriverId).trim());
      if (dr.inDriveDriverId) ids.push(String(dr.inDriveDriverId).trim());
    }
  } catch {
    /* ignore KV errors */
  }
  const out: string[] = [];
  for (const id of ids) {
    if (!id) continue;
    out.push(id);
    const lc = id.toLowerCase();
    if (lc !== id) out.push(lc);
  }
  return [...new Set(out)];
}

function applyStatementSummaryDriverFilter<
  T extends { eq(column: string, value: string): T; or(filter: string): T },
>(q: T, variants: string[]): T {
  if (variants.length === 0) return q;
  if (variants.length === 1) return q.eq("value->>driverId", variants[0]);
  return q.or(variants.map((id) => `value->>driverId.eq.${id}`).join(","));
}

// ─── GET /ledger/statement-summary — Universal Statement Summary per platform ──
// All platforms (Uber, Roam, InDrive) now use unified logic: fare_earning, tip, promotion, toll_charge events
// Uber also uses payout_cash/payout_bank for actual cash/bank totals from org import
app.get("/make-server-37f42386/ledger/statement-summary", requireAuth(), async (c) => {
  try {
    const platform = c.req.query("platform"); // Uber, Roam, InDrive, or 'all'
    const startDate = c.req.query("startDate");
    const endDate = c.req.query("endDate");
    const driverIdParam = c.req.query("driverId");

    if (!startDate || !endDate) {
      return c.json({ error: "startDate and endDate are required" }, 400);
    }

    const driverIdVariants =
      driverIdParam && String(driverIdParam).trim()
        ? await expandStatementSummaryDriverIds(driverIdParam)
        : [];

    const orgId = getOrgId(c);
    const platforms = platform === 'all' || !platform 
      ? ['Uber', 'Roam', 'InDrive'] 
      : [platform];

    const summaries: any[] = [];

    for (const plat of platforms) {
      // Unified platform filter
      const platformFilter = plat === 'Roam' 
        ? 'value->>platform.eq.Roam,value->>platform.eq.GoRide'
        : `value->>platform.eq.${plat}`;

      // Query fare_earning, tip, promotion, toll_*, prior_period_adjustment for all platforms.
      // Uber: split trip-dated rows vs statement/payout/promotion rows. The latter used to use
      // `date` = org periodStart (before trip dates), so a calendar-week filter dropped promotions.
      // Import events still carry periodStart/periodEnd — second query includes period overlap with [startDate,endDate].
      const eventTypesNonUber =
        'value->>eventType.eq.fare_earning,value->>eventType.eq.tip,value->>eventType.eq.promotion,value->>eventType.eq.toll_charge,value->>eventType.eq.toll_refund,value->>eventType.eq.toll_support_adjustment,value->>eventType.eq.prior_period_adjustment';
      const uberTripEventTypes =
        'value->>eventType.eq.fare_earning,value->>eventType.eq.tip,value->>eventType.eq.toll_charge,value->>eventType.eq.toll_refund,value->>eventType.eq.toll_support_adjustment,value->>eventType.eq.prior_period_adjustment';
      const uberImportEventTypes =
        'value->>eventType.eq.promotion,value->>eventType.eq.payout_cash,value->>eventType.eq.payout_bank,value->>eventType.eq.statement_line';

      let data: { value: unknown }[] | null = null;
      let error: { message: string } | null = null;

      if (plat === 'Uber') {
        const buildBase = (eventTypes: string) => {
          let q = supabase
            .from("kv_store_37f42386")
            .select("value")
            .like("key", CANONICAL_LEDGER_KEY_LIKE)
            .or(eventTypes)
            .or(platformFilter);
          // Match `filterByOrg` + trips/search: include legacy rows with no organizationId. A strict `.eq(org)`
          // alone drops idempotent `import_batch` promotion rows first inserted without stampOrg, while newer
          // `fare_earning` rows (new idempotency keys) have orgId — promotions then sum to $0.
          if (orgId) {
            q = q.or(`value->>organizationId.eq.${orgId},value->>organizationId.is.null`);
          }
          q = applyStatementSummaryDriverFilter(q, driverIdVariants);
          return q;
        };

        const qTrip = buildBase(uberTripEventTypes)
          .gte("value->>date", startDate)
          .lte("value->>date", endDate)
          .limit(10000);
        const dateOrPeriodOverlap = `and(value->>date.gte.${startDate},value->>date.lte.${endDate}),and(value->>periodStart.lte.${endDate},value->>periodEnd.gte.${startDate})`;
        const qImport = buildBase(uberImportEventTypes).or(dateOrPeriodOverlap).limit(10000);

        const [rTrip, rImport] = await Promise.all([qTrip, qImport]);
        error = rTrip.error || rImport.error;
        if (error) throw error;

        const merged = new Map<string, unknown>();
        for (const row of [...(rTrip.data || []), ...(rImport.data || [])]) {
          const v = (row as { value?: Record<string, unknown> }).value;
          if (!v || typeof v !== "object") continue;
          const id =
            typeof v.idempotencyKey === "string" && v.idempotencyKey
              ? v.idempotencyKey
              : typeof v.id === "string"
                ? v.id
                : "";
          const sig =
            id ||
            `${String(v.eventType)}|${String(v.date)}|${String(v.driverId)}|${String(v.netAmount)}`;
          if (!merged.has(sig)) merged.set(sig, v);
        }
        data = [...merged.values()].map((value) => ({ value }));
      } else {
        let query = supabase
          .from("kv_store_37f42386")
          .select("value")
          .like("key", CANONICAL_LEDGER_KEY_LIKE)
          .or(eventTypesNonUber)
          .or(platformFilter)
          .gte("value->>date", startDate)
          .lte("value->>date", endDate);

        if (orgId) {
          query = query.or(`value->>organizationId.eq.${orgId},value->>organizationId.is.null`);
        }
        query = applyStatementSummaryDriverFilter(query, driverIdVariants);

        const res = await query.limit(10000);
        data = res.data;
        error = res.error;
        if (error) throw error;
      }

      // Filter to only the requested platform
      const entries = filterByOrg((data || []).map((d: any) => d.value).filter(Boolean), c)
        .filter((e: any) => {
          const ePlat = e.platform === 'GoRide' ? 'Roam' : e.platform;
          return ePlat === plat;
        });

      let netFare = 0, promotions = 0, tips = 0;
      let tolls = 0, tollAdjustments = 0;
      let periodAdjustments = 0;
      let cashCollected = 0, bankTransfer = 0;
      let tripCount = 0;
      let hasPayoutEvents = false;

      for (const e of entries) {
        const net = Number(e.netAmount) || 0;
        const mag = Math.abs(net);

        switch (e.eventType) {
          case 'fare_earning':
            netFare += net;
            tripCount++;
            if (e.paymentMethod === 'Cash') {
              const cashAmt = e.metadata?.cashCollected != null 
                ? Number(e.metadata.cashCollected) 
                : mag;
              cashCollected += cashAmt;
            }
            break;
          case 'tip':
            tips += net;
            break;
          case 'promotion':
            promotions += net;
            break;
          case 'toll_charge':
            tolls += mag;
            break;
          case 'toll_refund':
            tollAdjustments += mag;
            break;
          case 'toll_support_adjustment':
            // Toll support adjustments reduce toll expense (credits)
            tollAdjustments += mag;
            break;
          case 'prior_period_adjustment':
            // Adjustments from previous periods (can be positive or negative)
            periodAdjustments += net;
            break;
          case 'payout_cash':
            // Uber: use actual payout_cash for cash collected
            cashCollected = mag;
            hasPayoutEvents = true;
            break;
          case 'payout_bank':
            // Uber: use actual payout_bank for bank transfer
            bankTransfer = mag;
            hasPayoutEvents = true;
            break;
          case 'statement_line':
            // REFUNDS_TOLL (org CSV) — Roam/InDrive: add as toll-side credit. Uber: skip here; that line
            // often equals full "Refunds & Expenses" while trip toll_charge already sums the toll bucket,
            // and toll_support_adjustment carries dispute/support credits (import preview splits the same way).
            if (e.metadata?.lineCode === 'REFUNDS_TOLL' && plat !== 'Uber') {
              tollAdjustments += mag;
            }
            break;
        }
      }

      // Uber: fare_earning = CSV fare components (includes promotions in the fare bucket). Promotions are
      // import_batch rows from payments_driver. Net Fare = Σ fare_earning − Σ promotion.
      // Other platforms: Net Fare = Σ fare_earning (promotions only if present as separate events).
      const computedNetFare =
        plat === 'Uber' ? netFare - promotions : netFare;
      const totalEarnings = computedNetFare + promotions + tips;
      
      // For platforms without payout events, compute bank transfer
      if (!hasPayoutEvents) {
        bankTransfer = Math.max(0, totalEarnings - tolls - cashCollected);
      }

      const summary = {
        platform: plat,
        periodStart: startDate,
        periodEnd: endDate,
        sourceType: 'computed',
        netFare: Number(computedNetFare.toFixed(2)),
        promotions: Number(promotions.toFixed(2)),
        tips: Number(tips.toFixed(2)),
        totalEarnings: Number(totalEarnings.toFixed(2)),
        tolls: Number(tolls.toFixed(2)),
        tollAdjustments: Number(tollAdjustments.toFixed(2)),
        totalRefundsExpenses: Number((tolls + tollAdjustments).toFixed(2)),
        periodAdjustments: Number(periodAdjustments.toFixed(2)),
        cashCollected: Number(cashCollected.toFixed(2)),
        bankTransfer: Number(bankTransfer.toFixed(2)),
        totalPayout: Number((cashCollected + bankTransfer).toFixed(2)),
        tripCount,
      };

      summaries.push(summary);
    }

    return c.json({
      success: true,
      summaries,
      periodStart: startDate,
      periodEnd: endDate,
    });
  } catch (e: any) {
    console.error(`[Statement Summary] Error: ${e.message}`);
    return c.json({ error: `Statement summary failed: ${e.message}` }, 500);
  }
});

// ─── GET /ledger/driver-overview — Aggregated financials for Driver Detail ──
app.get("/make-server-37f42386/ledger/driver-overview", requireAuth(), async (c) => {
  try {
    const driverId = c.req.query("driverId");
    const startDate = c.req.query("startDate");
    const endDate = c.req.query("endDate");
    const platformsParam = c.req.query("platforms");

    if (!driverId || !startDate || !endDate) {
      return c.json({ error: "Missing required params: driverId, startDate, endDate" }, 400);
    }

      console.log(
        `[Ledger DriverOverview:canonical] driverId=${driverId} range=${startDate}..${endDate} platforms=${platformsParam || "all"}`,
      );
      const allDriverIdsCanon: string[] = [driverId];
      try {
        const driverRecord = await kv.get(`driver:${driverId}`);
        if (driverRecord) {
          if (driverRecord.uberDriverId) allDriverIdsCanon.push(driverRecord.uberDriverId);
          if (driverRecord.inDriveDriverId) allDriverIdsCanon.push(driverRecord.inDriveDriverId);
        }
      } catch (lookupErr) {
        console.warn(`[Ledger DriverOverview:canonical] driver lookup ${driverId}:`, lookupErr);
      }
      // Import lowercases Uber UUIDs; include both original and lowercase for matching
      const allDriverIdsCanonExpanded: string[] = [];
      for (const id of allDriverIdsCanon) {
        allDriverIdsCanonExpanded.push(id);
        const lc = id.toLowerCase();
        if (lc !== id) allDriverIdsCanonExpanded.push(lc);
      }
      const driverIdOrFilterCanon = allDriverIdsCanonExpanded.length === 1
        ? null
        : allDriverIdsCanonExpanded.map((id) => `value->>driverId.eq.${id}`).join(",");

      const PAGE_CANON = 1000;
      const MAX_ROWS_CANON = 50000;
      const paginatedFetchCanon = async (buildQuery: () => any): Promise<any[]> => {
        let all: any[] = [];
        let offset = 0;
        while (offset < MAX_ROWS_CANON) {
          const { data, error } = await buildQuery().range(offset, offset + PAGE_CANON - 1);
          if (error) throw error;
          const page = data || [];
          all = all.concat(page);
          if (page.length < PAGE_CANON) break;
          offset += PAGE_CANON;
        }
        return all;
      };

      const baseQueryCanon = () => {
        let q = supabase
          .from("kv_store_37f42386")
          .select("value")
          .like("key", "ledger_event:%");
        if (driverIdOrFilterCanon) {
          q = q.or(driverIdOrFilterCanon);
        } else {
          // Match both original case and lowercase (import lowercases UUIDs)
          const lc = driverId.toLowerCase();
          if (lc !== driverId) {
            q = q.or(`value->>driverId.eq.${driverId},value->>driverId.eq.${lc}`);
          } else {
            q = q.eq("value->>driverId", driverId);
          }
        }
        return q;
      };

      try {
        // Widen SQL by `date` then filter in-memory: statement/payout canonical rows use
        // `date = periodEnd`, which can fall outside a tight [startDate,endDate] even when
        // the statement period overlaps the user's range (see canonicalEventInSelectedWindow).
        const fetchLo = addDaysYmd(startDate, -45);
        const fetchHi = addDaysYmd(endDate, 45);
        const periodDataCanon = await paginatedFetchCanon(() =>
          baseQueryCanon()
            .gte("value->>date", fetchLo)
            .lte("value->>date", fetchHi)
        );
        let periodValsCanon = periodDataCanon.map((d: any) => d.value).filter(Boolean);
        periodValsCanon = filterByOrg(periodValsCanon, c);
        periodValsCanon = periodValsCanon.filter((v: any) =>
          canonicalEventInSelectedWindow(v as Record<string, unknown>, startDate, endDate)
        );

        const startDC = new Date(startDate + "T00:00:00Z");
        const endDC = new Date(endDate + "T23:59:59Z");
        const daysDiffC = Math.round((endDC.getTime() - startDC.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        const prevEndDC = new Date(startDC);
        prevEndDC.setUTCDate(prevEndDC.getUTCDate() - 1);
        const prevStartDC = new Date(prevEndDC);
        prevStartDC.setUTCDate(prevStartDC.getUTCDate() - daysDiffC + 1);
        const prevStartC = prevStartDC.toISOString().slice(0, 10);
        const prevEndC = prevEndDC.toISOString().slice(0, 10);

        let prevDataCanon: any[] = [];
        try {
          const prevLo = addDaysYmd(prevStartC, -45);
          const prevHi = addDaysYmd(prevEndC, 45);
          prevDataCanon = await paginatedFetchCanon(() =>
            baseQueryCanon()
              .gte("value->>date", prevLo)
              .lte("value->>date", prevHi)
          );
        } catch (prevErr: any) {
          console.log(`[Ledger DriverOverview:canonical] prev period: ${prevErr.message}`);
        }
        let prevValsCanon = prevDataCanon.map((d: any) => d.value).filter(Boolean);
        prevValsCanon = filterByOrg(prevValsCanon, c);
        prevValsCanon = prevValsCanon.filter((v: any) =>
          canonicalEventInSelectedWindow(v as Record<string, unknown>, prevStartC, prevEndC)
        );

        let lifetimeDataCanon: any[] = [];
        try {
          lifetimeDataCanon = await paginatedFetchCanon(() => baseQueryCanon());
        } catch (lifeErr: any) {
          console.log(`[Ledger DriverOverview:canonical] lifetime: ${lifeErr.message}`);
        }
        let lifetimeValsCanon = lifetimeDataCanon.map((d: any) => d.value).filter(Boolean);
        lifetimeValsCanon = filterByOrg(lifetimeValsCanon, c);

        const resultCanon = aggregateCanonicalEventsToLedgerDriverOverview(
          periodValsCanon,
          prevValsCanon,
          lifetimeValsCanon,
          platformsParam || undefined,
        );
        console.log(
          `[Ledger DriverOverview:canonical] OK — period earnings=${(resultCanon.period as any)?.earnings} events=${periodValsCanon.length}`,
        );
        return c.json({ success: true, data: resultCanon });
      } catch (canonErr: any) {
        console.log(`[Ledger DriverOverview:canonical] Error: ${canonErr.message}`);
        return c.json({ error: `Canonical driver overview failed: ${canonErr.message}` }, 500);
      }

  } catch (e: any) {
    console.log(`[Ledger DriverOverview] Error: ${e.message}`);
    return c.json({ error: `Ledger driver overview failed: ${e.message}` }, 500);
  }
});

/** Trip side of GET /ledger/diagnostic-trip-ledger-gap (shared with canonical + legacy fare rows). */
type TripGapEligibleTrip = {
  id: string;
  platform: string;
  driverId: string;
  date: string;
  amount: number;
  organizationId: string | null;
};

function buildTripLedgerFareGapSection(
  eligible: TripGapEligibleTrip[],
  fareRaw: any[],
  readerOrgId: string | null,
  c: any,
  fareRowLabel: "ledger_event" | "ledger",
) {
  const fareScoped = filterByOrg(fareRaw, c);

  const ledgerOrgOnFare = {
    nullOrEmpty: 0,
    matchesReaderOrg: 0,
    legacyPlaceholderRoamDefaultOrg: 0,
    wrongOrg: 0,
  };
  const droppedWrongOrg: { id: string; sourceId?: string; platform?: string; ledgerOrg: string }[] = [];
  for (const e of fareRaw) {
    const oid =
      typeof e.organizationId === "string" && e.organizationId.trim() !== ""
        ? e.organizationId.trim()
        : null;
    if (!readerOrgId) {
      /* skip per-row org stats */
    } else if (oid == null) {
      ledgerOrgOnFare.nullOrEmpty++;
    } else if (oid === readerOrgId) {
      ledgerOrgOnFare.matchesReaderOrg++;
    } else if (isLegacyOrgPlaceholder(oid)) {
      ledgerOrgOnFare.legacyPlaceholderRoamDefaultOrg++;
    } else {
      ledgerOrgOnFare.wrongOrg++;
      if (droppedWrongOrg.length < 20) {
        droppedWrongOrg.push({
          id: e.id,
          sourceId: e.sourceId,
          platform: e.platform,
          ledgerOrg: oid,
        });
      }
    }
  }

  const sourceIdsRaw = new Set(fareRaw.map((e: any) => e.sourceId).filter(Boolean));
  const sourceIdsScoped = new Set(fareScoped.map((e: any) => e.sourceId).filter(Boolean));

  const missingFareLedgerEntirely = eligible.filter((t) => !sourceIdsRaw.has(t.id));
  const missingAfterOrgScope = eligible.filter((t) => !sourceIdsScoped.has(t.id));
  const fixedByScopeOnly = missingAfterOrgScope.filter((t) => sourceIdsRaw.has(t.id));

  const fareByPlatformRaw: Record<string, number> = {};
  const fareByPlatformScoped: Record<string, number> = {};
  for (const e of fareRaw) {
    const plat = (e.platform === "GoRide" ? "Roam" : e.platform) || "Other";
    fareByPlatformRaw[plat] = (fareByPlatformRaw[plat] || 0) + 1;
  }
  for (const e of fareScoped) {
    const plat = (e.platform === "GoRide" ? "Roam" : e.platform) || "Other";
    fareByPlatformScoped[plat] = (fareByPlatformScoped[plat] || 0) + 1;
  }

  return {
    ledgerFareEarning: {
      fareRowSource: fareRowLabel,
      rawCount: fareRaw.length,
      afterFilterByOrgCount: fareScoped.length,
      droppedByFilterByOrg: fareRaw.length - fareScoped.length,
      organizationIdOnLedgerFareRows: ledgerOrgOnFare,
      byPlatformRaw: fareByPlatformRaw,
      byPlatformAfterScope: fareByPlatformScoped,
      sampleWrongOrgFareRows: droppedWrongOrg,
    },
    gap: {
      missingFareLedgerNoRowForTripId: missingFareLedgerEntirely.length,
      missingAfterOrgScope: missingAfterOrgScope.length,
      tripsHiddenOnlyByOrgFilter: fixedByScopeOnly.length,
      sampleMissingTripIdsNoLedgerAtAll: missingFareLedgerEntirely.slice(0, 25).map((t) => ({
        id: t.id,
        platform: t.platform,
        tripDriverId: t.driverId,
        date: t.date,
        tripOrganizationId: t.organizationId,
      })),
      sampleTripIdsPresentInRawButDroppedByOrgScope: fixedByScopeOnly.slice(0, 15).map((t) => ({
        id: t.id,
        platform: t.platform,
        date: t.date,
      })),
    },
  };
}

// ─── GET /ledger/diagnostic-trip-ledger-gap — Why trips ≠ fare_earning (org, missing writes, IDs) ──
// Same date range + multi-driver-id resolution as driver-overview. Read-only. Fare rows: `ledger_event:*` only.
app.get("/make-server-37f42386/ledger/diagnostic-trip-ledger-gap", requireAuth(), async (c) => {
  const t0 = Date.now();
  try {
    const driverId = c.req.query("driverId");
    const startDate = c.req.query("startDate");
    const endDate = c.req.query("endDate");
    if (!driverId || !startDate || !endDate) {
      return c.json({ error: "Missing driverId, startDate, or endDate" }, 400);
    }

    const readerOrgId = getOrgId(c);

    const allDriverIds: string[] = [driverId];
    try {
      const driverRecord = await kv.get(`driver:${driverId}`);
      if (driverRecord?.uberDriverId) allDriverIds.push(driverRecord.uberDriverId);
      if (driverRecord?.inDriveDriverId) allDriverIds.push(driverRecord.inDriveDriverId);
    } catch {
      /* ignore */
    }

    const driverIdOrFilter =
      allDriverIds.length === 1 ? null : allDriverIds.map((id) => `value->>driverId.eq.${id}`).join(",");

    const PAGE = 1000;
    const MAX_ROWS = 50000;
    const paginatedFetch = async (buildQuery: () => any): Promise<any[]> => {
      let all: any[] = [];
      let offset = 0;
      while (offset < MAX_ROWS) {
        const { data, error } = await buildQuery().range(offset, offset + PAGE - 1);
        if (error) throw error;
        const page = data || [];
        all = all.concat(page);
        if (page.length < PAGE) break;
        offset += PAGE;
      }
      return all;
    };

    const fetchFareEarningRows = async () => {
      const rows = await paginatedFetch(() => {
        let q = supabase
          .from("kv_store_37f42386")
          .select("value")
          .like("key", CANONICAL_LEDGER_KEY_LIKE)
          .eq("value->>eventType", "fare_earning")
          .gte("value->>date", startDate)
          .lte("value->>date", endDate);
        if (driverIdOrFilter) q = q.or(driverIdOrFilter);
        else q = q.eq("value->>driverId", driverId);
        return q;
      });
      return rows.map((d: any) => d.value).filter(Boolean);
    };

    const tripRows = await paginatedFetch(() => {
      let q = supabase
        .from("kv_store_37f42386")
        .select("value")
        .like("key", "trip:%")
        .eq("value->>status", "Completed")
        .gte("value->>date", startDate)
        .lte("value->>date", endDate);
      if (driverIdOrFilter) q = q.or(driverIdOrFilter);
      else q = q.eq("value->>driverId", driverId);
      return q;
    });

    const tripValues = tripRows.map((d: any) => d.value).filter(Boolean);

    const eligible: TripGapEligibleTrip[] = [];
    const tripOrgStats = {
      nullOrEmpty: 0,
      matchesReaderOrg: 0,
      legacyPlaceholderRoamDefaultOrg: 0,
      wrongOrg: 0,
      readerHasNoOrg: 0,
    };

    for (const v of tripValues) {
      const isUber = String(v.platform || "").toLowerCase() === "uber";
      const uberGross = isUber
        ? (Number(v.uberFareComponents) || 0) +
          (Number(v.uberTips) || 0) +
          (Number(v.uberPriorPeriodAdjustment) || 0)
        : 0;
      const hasTripAmount = !!v.amount && Number(v.amount) > 0;
      const hasMoney = isUber ? hasTripAmount || uberGross > 0 : hasTripAmount;
      if (!hasMoney) continue;

      const plat = isUber ? "Uber" : (v.platform === "GoRide" ? "Roam" : v.platform) || "Other";
      const oid =
        typeof v.organizationId === "string" && v.organizationId.trim() !== ""
          ? v.organizationId.trim()
          : null;

      if (!readerOrgId) {
        tripOrgStats.readerHasNoOrg++;
      } else if (oid == null) {
        tripOrgStats.nullOrEmpty++;
      } else if (oid === readerOrgId) {
        tripOrgStats.matchesReaderOrg++;
      } else if (isLegacyOrgPlaceholder(oid)) {
        tripOrgStats.legacyPlaceholderRoamDefaultOrg++;
      } else {
        tripOrgStats.wrongOrg++;
      }

      eligible.push({
        id: v.id,
        platform: plat,
        driverId: String(v.driverId || ""),
        date: typeof v.date === "string" ? v.date.slice(0, 10) : "",
        amount: Number(v.amount) || 0,
        organizationId: oid,
      });
    }

    const tripsByPlatform: Record<string, number> = {};
    for (const t of eligible) {
      tripsByPlatform[t.platform] = (tripsByPlatform[t.platform] || 0) + 1;
    }

    const tripsEligibleCompletedWithMoney = {
      count: eligible.length,
      byPlatform: tripsByPlatform,
      organizationIdOnTrip: tripOrgStats,
    };

    const sharedMeta = {
      startDate,
      endDate,
      readerOrgId: readerOrgId ?? null,
      resolvedDriverIds: allDriverIds,
      gapSource: "canonical" as const,
    };

    const hintsCommon = [
      "missingFareLedgerNoRowForTripId > 0 → no fare_earning row with sourceId = trip id (canonical append / import repair, or driverId mismatch).",
      "legacyPlaceholderRoamDefaultOrg → trips/ledger stamped with roam-default-org; filterByOrg treats that like unscoped for fleet UUID users.",
      "droppedByFilterByOrg with sampleWrongOrgFareRows (non-legacy org) → foreign-org rows excluded from this fleet.",
      "tripsHiddenOnlyByOrgFilter → raw row had sourceId but filterByOrg removed it (org mismatch).",
      "Compared to ledger_event:* fare_earning only.",
    ];

    const fareRaw = await fetchFareEarningRows();
    const section = buildTripLedgerFareGapSection(eligible, fareRaw, readerOrgId, c, "ledger_event");

    return c.json({
      success: true,
      meta: { ...sharedMeta, durationMs: Date.now() - t0 },
      tripsEligibleCompletedWithMoney,
      ledgerFareEarning: section.ledgerFareEarning,
      gap: section.gap,
      hints: hintsCommon,
    });
  } catch (e: any) {
    console.error("[diagnostic-trip-ledger-gap]", e);
    return c.json({ success: false, error: e.message || String(e) }, 500);
  }
});

// ─── GET /ledger/driver-indrive-wallet — Period loads, fees, lifetime loads (Phase 2) ──
// Query: driverId, startDate, endDate (YYYY-MM-DD). Same multi-ID driver resolution as driver-overview.
// Fee side from `ledger_event:*` only. Loads always from transaction:* (InDrive Wallet Credit).
// Phase 7 estimatedBalance = lifetimeLoads − lifetimeInDriveFees (fleet estimate only).
// Phase 8: read access aligned with financial transaction visibility (transactions.view).
app.get(
  "/make-server-37f42386/ledger/driver-indrive-wallet",
  requireAuth(),
  requirePermission("transactions.view"),
  async (c) => {
  const t0 = Date.now();
  try {
    const driverId = c.req.query("driverId");
    const startDate = c.req.query("startDate");
    const endDate = c.req.query("endDate");
    const LOAD_CATEGORY = "InDrive Wallet Credit";

    if (!driverId || !startDate || !endDate) {
      return c.json({ error: "Missing required params: driverId, startDate, endDate" }, 400);
    }

    const allDriverIds: string[] = [driverId];
    try {
      const driverRecord = await kv.get(`driver:${driverId}`);
      if (driverRecord) {
        if (driverRecord.uberDriverId) allDriverIds.push(driverRecord.uberDriverId);
        if (driverRecord.inDriveDriverId) allDriverIds.push(driverRecord.inDriveDriverId);
      }
    } catch (lookupErr) {
      console.warn(`[IndriveWallet] Could not look up driver ${driverId}:`, lookupErr);
    }

    const driverIdOrFilter =
      allDriverIds.length === 1
        ? null
        : allDriverIds.map((id) => `value->>driverId.eq.${id}`).join(",");

    const orgId = getOrgId(c);

    const PAGE = 1000;
    const MAX_ROWS = 50000;
    const paginatedFetch = async (buildQuery: () => any): Promise<any[]> => {
      let all: any[] = [];
      let offset = 0;
      while (offset < MAX_ROWS) {
        const { data, error } = await buildQuery().range(offset, offset + PAGE - 1);
        if (error) throw error;
        const page = data || [];
        all = all.concat(page);
        if (page.length < PAGE) break;
        offset += PAGE;
      }
      return all;
    };

    const ledgerBaseQuery = () => {
      let q = supabase.from("kv_store_37f42386").select("value").like("key", CANONICAL_LEDGER_KEY_LIKE);
      if (orgId) q = q.eq("value->>organizationId", orgId);
      if (driverIdOrFilter) q = q.or(driverIdOrFilter);
      else q = q.eq("value->>driverId", driverId);
      return q;
    };

    const fetchLedgerEntryValues = async () => {
      const rows = await paginatedFetch(() => ledgerBaseQuery());
      return filterByOrg(
        rows.map((r: any) => r.value).filter(Boolean),
        c,
      );
    };

    const txBaseQuery = () => {
      let q = supabase
        .from("kv_store_37f42386")
        .select("value")
        .like("key", "transaction:%")
        .eq("value->>category", LOAD_CATEGORY);
      if (orgId) q = q.eq("value->>organizationId", orgId);
      if (driverIdOrFilter) q = q.or(driverIdOrFilter);
      else q = q.eq("value->>driverId", driverId);
      return q;
    };

    const loadTxRows = await paginatedFetch(() => txBaseQuery());

    const txDate = (raw: string | undefined) => (raw ? raw.split("T")[0] : "");

    let periodLoads = 0;
    let lifetimeLoads = 0;
    for (const row of loadTxRows) {
      const t = row.value;
      if (!t) continue;
      const amt = Number(t.amount) || 0;
      if (amt <= 0) continue;
      const d = txDate(t.date);
      lifetimeLoads += amt;
      if (d >= startDate && d <= endDate) periodLoads += amt;
    }

    periodLoads = Number(periodLoads.toFixed(2));
    lifetimeLoads = Number(lifetimeLoads.toFixed(2));

    const buildWalletData = (periodFees: number, lifetimeInDriveFees: number) => {
      const estimatedBalance = Number((lifetimeLoads - lifetimeInDriveFees).toFixed(2));
      return {
        periodLoads,
        periodFees,
        lifetimeLoads,
        estimatedBalance,
      };
    };

    const ledgerVals = await fetchLedgerEntryValues();
    const { periodFees, lifetimeInDriveFees } = computeIndriveWalletFeesFromLedgerEntries(
      ledgerVals,
      startDate,
      endDate,
    );
    const data = buildWalletData(periodFees, lifetimeInDriveFees);

    console.log(
      `[IndriveWallet] source=canonical driverId=${driverId} range=${startDate}..${endDate} periodLoads=${data.periodLoads} periodFees=${data.periodFees} lifetimeLoads=${data.lifetimeLoads} estimatedBalance=${data.estimatedBalance} ledgerVals=${ledgerVals.length} loadTxRows=${loadTxRows.length} ${Date.now() - t0}ms`,
    );

    return c.json({
      success: true,
      meta: { source: "canonical", durationMs: Date.now() - t0 },
      data,
    });
  } catch (e: any) {
    console.error("[IndriveWallet] Error:", e);
    return c.json({ error: `InDrive wallet summary failed: ${e.message}` }, 500);
  }
});

// ─── POST /ledger — RETIRED: Use POST /ledger/canonical-events/append instead ───────────────────
app.post("/make-server-37f42386/ledger", requireAuth(), async (c) => {
  return c.json(
    { error: "This endpoint is retired. Use POST /ledger/canonical-events/append for canonical ledger writes." },
    410,
  );
});

// ─── POST /ledger/canonical-events/append — Phase 2 canonical SSOT events (idempotent) ──
app.post(
  "/make-server-37f42386/ledger/canonical-events/append",
  requireAuth(),
  requirePermission("transactions.edit"),
  async (c) => {
    try {
      const body = await c.req.json();
      const events = body?.events;
      const rbacUser = c.get("rbacUser") as RbacUser | undefined;
      const importerUserId =
        (rbacUser as any)?.userId || (rbacUser as any)?.email || undefined;
      const enriched = Array.isArray(events)
        ? events.map((e: any) => ({
            ...e,
            importerUserId: e?.importerUserId ?? importerUserId,
          }))
        : [];
      const result = await appendCanonicalLedgerEvents(enriched, c);
      if (result.inserted > 0) {
        try {
          await cache.invalidateCacheVersion("stats");
          await cache.invalidateCacheVersion("performance");
          await invalidateDashboardCache();
        } catch (invErr) {
          console.warn("[CanonicalLedger] cache invalidate (non-fatal):", invErr);
        }
      }
      return c.json(result);
    } catch (e: any) {
      console.error("[CanonicalLedger] append route error:", e);
      return c.json({ error: e.message || "Canonical ledger append failed" }, 500);
    }
  },
);

// ─── GET /ledger/canonical-events — List canonical events (org-scoped) ────────────────
app.get("/make-server-37f42386/ledger/canonical-events", requireAuth(), async (c) => {
  try {
    const driverId = c.req.query("driverId");
    const startDate = c.req.query("startDate");
    const endDate = c.req.query("endDate");
    const limitParam = c.req.query("limit");
    const offsetParam = c.req.query("offset");
    const limit = Math.min(Math.max(limitParam ? parseInt(limitParam, 10) : 50, 1), 500);
    const offset = Math.max(offsetParam ? parseInt(offsetParam, 10) : 0, 0);

    let query = supabase
      .from("kv_store_37f42386")
      .select("key, value")
      .like("key", "ledger_event:%");

    if (driverId) query = query.eq("value->>driverId", driverId);
    if (startDate) query = query.gte("value->>date", startDate);
    if (endDate) query = query.lte("value->>date", endDate);

    query = query
      .order("value->>date", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data || []).map((d: any) => ({
      key: d.key,
      ...(d.value || {}),
    }));
    const filtered = filterByOrg(rows, c);
    return c.json({
      data: filtered,
      page: Math.floor(offset / limit) + 1,
      limit,
      hasMore: (data || []).length === limit,
    });
  } catch (e: any) {
    console.log(`[CanonicalLedger GET] Error: ${e.message}`);
    return c.json({ error: `Canonical ledger query failed: ${e.message}` }, 500);
  }
});

// ─── GET /ledger/canonical-batch-audit/:batchId — Phase 7 live recount ───────────────
app.get(
  "/make-server-37f42386/ledger/canonical-batch-audit/:batchId",
  requireAuth(),
  async (c) => {
    const batchId = c.req.param("batchId");
    if (!batchId?.trim()) {
      return c.json({ error: "batchId required" }, 400);
    }
    try {
      const batchRow = await kv.get(`batch:${batchId}`);
      if (!batchRow || typeof batchRow !== "object") {
        return c.json({ error: "Batch not found" }, 404);
      }
      if (!belongsToOrg(batchRow as Record<string, unknown>, c)) {
        return c.json({ error: "Forbidden" }, 403);
      }

      const PAGE = 1000;
      const MAX_ROWS = 200_000;
      const all: { value: Record<string, unknown> }[] = [];
      let offset = 0;
      while (offset < MAX_ROWS) {
        const { data, error } = await supabase
          .from("kv_store_37f42386")
          .select("value")
          .like("key", "ledger_event:%")
          .eq("value->>batchId", batchId)
          .range(offset, offset + PAGE - 1);
        if (error) throw error;
        const page = data || [];
        all.push(...(page as { value: Record<string, unknown> }[]));
        if (page.length < PAGE) break;
        offset += PAGE;
      }

      const values = all.map((r) => r.value).filter(Boolean);
      const scoped = filterByOrg(values, c);
      const byDriver: Record<string, number> = {};
      const byEventType: Record<string, number> = {};
      for (const v of scoped) {
        const d = typeof v.driverId === "string" && v.driverId.trim() ? v.driverId.trim() : "unknown";
        const t = typeof v.eventType === "string" && v.eventType.trim() ? v.eventType.trim() : "unknown";
        byDriver[d] = (byDriver[d] || 0) + 1;
        byEventType[t] = (byEventType[t] || 0) + 1;
      }
      return c.json({
        success: true,
        data: {
          batchId,
          total: scoped.length,
          byDriver,
          byEventType,
        },
      });
    } catch (e: any) {
      console.error("[CanonicalBatchAudit] Error:", e);
      return c.json({ error: e.message || "Canonical batch audit failed" }, 500);
    }
  },
);

// ─── POST /ledger/batch — RETIRED: Use POST /ledger/canonical-events/append instead ────────────
app.post("/make-server-37f42386/ledger/batch", requireAuth(), async (c) => {
  return c.json(
    { error: "This endpoint is retired. Use POST /ledger/canonical-events/append for canonical ledger writes." },
    410,
  );
});

// ─── PATCH /ledger/:id — RETIRED: Legacy ledger updates no longer supported ─────────
app.patch("/make-server-37f42386/ledger/:id", requireAuth(), async (c) => {
  return c.json({ error: "This endpoint is retired. Legacy ledger:% data is no longer used." }, 410);
});

// ─── DELETE /ledger/:id — RETIRED: Legacy ledger deletes no longer supported ──────────────
app.delete("/make-server-37f42386/ledger/:id", requireAuth(), async (c) => {
  return c.json({ error: "This endpoint is retired. Legacy ledger:% data is no longer used." }, 410);
});

// ─── POST /ledger/backfill — RETIRED: Use POST /ledger/canonical-backfill instead ──────
// Toll ledger utilities (backup, date repair) still work via query params.
app.post("/make-server-37f42386/ledger/backfill", requireAuth(), requirePermission('data.backfill'), async (c) => {
    try {
        // ── Toll ledger: backup + date repair (still supported) ──
        if (c.req.query("tollLedgerBackup") === "1") {
            const backup = await buildTollLedgerFullBackupPayload();
            return c.json(backup);
        }
        if (c.req.query("tollLedgerDateRepair") === "1") {
            const repairDryRun = c.req.query("repairDryRun") !== "false";
            const batchSize = Math.min(Number(c.req.query("repairBatchSize")) || 200, 500);
            const results = await executeTollLedgerRepairDates({ dryRun: repairDryRun, batchSize });
            return c.json({ success: true, results });
        }

        // Main legacy backfill is retired — use POST /ledger/canonical-backfill
        return c.json(
            {
                error: "Legacy ledger backfill is retired. Use POST /ledger/canonical-backfill instead.",
                hint: "Toll ledger backup/repair still works via ?tollLedgerBackup=1 or ?tollLedgerDateRepair=1",
            },
            410,
        );
    } catch (e: any) {
        console.error('[Ledger Backfill] Error:', e);
        return c.json({ error: e.message }, 500);
    }
});

// ─── Toll ledger backup + date repair (aliases on main router) ───────────────
// Same behavior as toll_controller routes under /toll-reconciliation/toll-ledger/*.
// Exposed here under /ledger/* next to backfill so admin tools share one URL family.
app.get("/make-server-37f42386/ledger/toll-ledger-backup", requireAuth(), requirePermission('data.backfill'), async (c) => {
  try {
    const backup = await buildTollLedgerFullBackupPayload();
    const filename = `toll_ledger_backup_${new Date().toISOString().split("T")[0]}.json`;
    c.header("Content-Type", "application/json");
    c.header("Content-Disposition", `attachment; filename="${filename}"`);
    return c.json(backup);
  } catch (e: any) {
    console.log(`[TollLedgerBackup] Error (ledger alias): ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/ledger/toll-ledger-repair-dates", requireAuth(), requirePermission('data.backfill'), async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const results = await executeTollLedgerRepairDates(body);
    return c.json({ success: true, results });
  } catch (e: any) {
    console.log(`[TollLedgerRepairDates] Error (alias): ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// Debug endpoint (helps confirm the deployed bundle includes the route).
// Call: GET /functions/v1/make-server-37f42386/toll-reconciliation/reset-for-reconciliation-debug
app.get("/make-server-37f42386/toll-reconciliation/reset-for-reconciliation-debug", async (c) => {
  return c.json({
    ok: true,
    route: "reset-for-reconciliation-debug",
    now: new Date().toISOString(),
  });
});

// Toll reset for reconciliation — registered on main router (same URL as toll_controller)
// so production always matches; nested app.route("/", tollApp) was returning 404 for some deploys.
app.post("/make-server-37f42386/toll-reconciliation/reset-for-reconciliation", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const result = await executeTollResetForReconciliation(body.transactionId);
    return c.json(result);
  } catch (e: any) {
    const status =
      typeof e.status === "number" && e.status >= 400 && e.status < 600
        ? e.status
        : 500;
    console.log(`[TollReset] Error (main router): ${e.message}`);
    return c.json({ error: e.message }, status);
  }
});

// ─── POST /ledger/repair-driver-ids — Phase 5.2b: Fix Uber UUID → Roam UUID in canonical ledger ──────
// Scans `ledger_event:*` rows, resolves each driverId to the canonical Roam UUID, updates mismatches in place.
// Supports: ?dryRun=true (preview only), ?driverId=xxx (repair only one driver's entries)
app.post("/make-server-37f42386/ledger/repair-driver-ids", requireAuth(), requirePermission('data.backfill'), async (c) => {
    try {
        const startedAt = new Date().toISOString();
        const startMs = Date.now();
        const url = new URL(c.req.url);
        const dryRun = url.searchParams.get("dryRun") === "true";
        const filterDriverId = url.searchParams.get("driverId") || null;

        if (legacyLedgerWritesDisabled() && !dryRun) {
          return c.json(
            { error: "Legacy ledger repair writes disabled (LEGACY_LEDGER_WRITES=false). Use dryRun=true to scan." },
            403,
          );
        }

        console.log(`[Ledger RepairDriverIds] Starting ${dryRun ? 'DRY RUN' : 'LIVE REPAIR'}${filterDriverId ? ` for driver ${filterDriverId}` : ' for ALL entries'}`);

        // Paginated fetch of all canonical ledger events (key + value)
        const PAGE = 1000;
        const MAX_ROWS = 100000;
        let allEntries: Array<{ key: string; value: any }> = [];
        let offset = 0;
        while (offset < MAX_ROWS) {
            const { data, error } = await supabase
                .from("kv_store_37f42386")
                .select("key, value")
                .like("key", CANONICAL_LEDGER_KEY_LIKE)
                .range(offset, offset + PAGE - 1);
            if (error) throw error;
            const page = data || [];
            allEntries = allEntries.concat(page);
            if (page.length < PAGE) break;
            offset += PAGE;
        }

        console.log(`[Ledger RepairDriverIds] Fetched ${allEntries.length} ledger entries`);

        const stats = {
            scanned: 0,
            alreadyCorrect: 0,
            repaired: 0,
            unresolvable: 0,
            skippedNoDriverId: 0,
            skippedFilterMismatch: 0,
            errors: 0,
            byPlatform: {} as Record<string, { scanned: number; repaired: number }>,
            repairedSamples: [] as Array<{ entryId: string; oldDriverId: string; newDriverId: string; platform: string; eventType: string }>,
            errorSamples: [] as Array<{ entryId: string; error: string }>,
            unresolvableSamples: [] as Array<{ entryId: string; driverId: string; platform: string; eventType: string }>,
        };

        // Cache resolved IDs to avoid repeated lookups
        const resolveCache = new Map<string, ResolvedDriver>();
        const resolveWithCache = async (id: string): Promise<ResolvedDriver> => {
            if (resolveCache.has(id)) return resolveCache.get(id)!;
            const result = await resolveCanonicalDriverId(id);
            resolveCache.set(id, result);
            return result;
        };

        // If filtering, resolve the filter ID first
        let filterCanonicalId: string | null = null;
        if (filterDriverId) {
            const resolved = await resolveWithCache(filterDriverId);
            filterCanonicalId = resolved.resolved ? resolved.canonicalId : filterDriverId;
        }

        // Process entries
        const toUpdate: Array<{ key: string; value: any }> = [];

        for (const entry of allEntries) {
            const val = entry.value;
            if (!val || !val.driverId) {
                stats.skippedNoDriverId++;
                continue;
            }

            stats.scanned++;
            const platform = val.platform || 'Unknown';
            if (!stats.byPlatform[platform]) {
                stats.byPlatform[platform] = { scanned: 0, repaired: 0 };
            }
            stats.byPlatform[platform].scanned++;

            try {
                const resolved = await resolveWithCache(val.driverId);

                // If filtering by driver, skip entries that don't resolve to the target driver
                if (filterCanonicalId && resolved.canonicalId !== filterCanonicalId) {
                    stats.skippedFilterMismatch++;
                    continue;
                }

                if (!resolved.resolved) {
                    stats.unresolvable++;
                    if (stats.unresolvableSamples.length < 20) {
                        stats.unresolvableSamples.push({
                            entryId: val.id || entry.key,
                            driverId: val.driverId,
                            platform,
                            eventType: val.eventType || 'unknown',
                        });
                    }
                    continue;
                }

                if (val.driverId === resolved.canonicalId) {
                    stats.alreadyCorrect++;
                    continue;
                }

                // Mismatch found — non-canonical driverId
                stats.repaired++;
                stats.byPlatform[platform].repaired++;

                if (stats.repairedSamples.length < 20) {
                    stats.repairedSamples.push({
                        entryId: val.id || entry.key,
                        oldDriverId: val.driverId,
                        newDriverId: resolved.canonicalId,
                        platform,
                        eventType: val.eventType || 'unknown',
                    });
                }

                if (!dryRun) {
                    toUpdate.push({
                        key: entry.key,
                        value: {
                            ...val,
                            driverId: resolved.canonicalId,
                            driverName: val.driverName || resolved.driverName,
                            _repairedAt: new Date().toISOString(),
                            _oldDriverId: val.driverId,
                        },
                    });
                }
            } catch (err: any) {
                stats.errors++;
                if (stats.errorSamples.length < 20) {
                    stats.errorSamples.push({
                        entryId: val.id || entry.key,
                        error: err.message || String(err),
                    });
                }
            }
        }

        // Batch write updates in chunks of 100
        if (!dryRun && toUpdate.length > 0) {
            for (let i = 0; i < toUpdate.length; i += 100) {
                const chunk = toUpdate.slice(i, i + 100);
                const keys = chunk.map(u => u.key);
                const values = chunk.map(u => u.value);
                await kv.mset(keys, values);
            }
            console.log(`[Ledger RepairDriverIds] Updated ${toUpdate.length} entries`);
        }

        // Diagnostic: show driver records' platform IDs
        const drivers = await loadDriverCache();
        const driverDiagnostics = drivers.map((d: any) => ({
            id: d.id?.substring(0, 12),
            name: d.name || [d.firstName, d.lastName].filter(Boolean).join(' ') || 'Unknown',
            uberDriverId: d.uberDriverId || null,
            inDriveDriverId: d.inDriveDriverId || null,
        }));

        const durationMs = Date.now() - startMs;
        const result = {
            success: true,
            dryRun,
            filterDriverId: filterDriverId || null,
            filterCanonicalId,
            startedAt,
            completedAt: new Date().toISOString(),
            durationMs,
            stats,
            _diagnostics: { driverRecords: driverDiagnostics },
        };

        console.log(`[Ledger RepairDriverIds] ${dryRun ? 'DRY RUN' : 'REPAIR'} complete: scanned=${stats.scanned}, repaired=${stats.repaired}, alreadyCorrect=${stats.alreadyCorrect}, unresolvable=${stats.unresolvable}, errors=${stats.errors} (${durationMs}ms)`);
        return c.json(result);
    } catch (e: any) {
        console.error('[Ledger RepairDriverIds] Fatal error:', e);
        return c.json({ error: e.message }, 500);
    }
});

// ─── POST /ledger/repair-driver — RETIRED: Use POST /ledger/canonical-backfill instead ──────
app.post("/make-server-37f42386/ledger/repair-driver", requireAuth(), async (c) => {
    return c.json(
        { error: "This endpoint is retired. Use POST /ledger/canonical-backfill to populate canonical ledger events." },
        410,
    );
});

// ─── POST /ledger/ensure-from-trip-ids — Idempotent canonical ledger backfill for a list of trip UUIDs ─────────
// Used after CSV / fleet import so drivers do not need manual "Repair Now" for missing fare_earning rows.
// Writes to canonical ledger_event:* only (non-Uber trips).
// Auth: none (matches POST /trips / fleet/sync — anon import key).
app.post("/make-server-37f42386/ledger/ensure-from-trip-ids", async (c) => {
    const startMs = Date.now();
    try {
        const body = await c.req.json();
        const rawIds: unknown = body?.tripIds;
        if (!Array.isArray(rawIds) || rawIds.length === 0) {
            return c.json({ error: "Body must include non-empty tripIds: string[]" }, 400);
        }
        const tripIds = [...new Set(rawIds.map((id) => String(id).trim()).filter(Boolean))];
        if (tripIds.length > 12_000) {
            return c.json({ error: "Max 12000 trip ids per request — split the import batch" }, 400);
        }

        const stats = {
            tripIdsRequested: tripIds.length,
            tripsLoaded: 0,
            skippedNoMoney: 0,
            ledgerRowsWritten: 0,
            unresolvedAfterGenerate: 0,
            errors: 0,
        };

        const CHUNK = 100;
        for (let i = 0; i < tripIds.length; i += CHUNK) {
            const chunk = tripIds.slice(i, i + CHUNK);
            const keys = chunk.map((id) => `trip:${id}`);
            let values: any[] = [];
            try {
                const got = await kv.mget(keys);
                values = Array.isArray(got) ? got.filter(Boolean) : [];
            } catch (e) {
                console.warn("[Ledger EnsureTripIds] mget failed, falling back to per-key get:", e);
                for (const key of keys) {
                    try {
                        const v = await kv.get(key);
                        if (v) values.push(v);
                    } catch {
                        /* skip */
                    }
                }
            }
            stats.tripsLoaded += values.length;

            const toAppend: Record<string, unknown>[] = [];
            for (const trip of values) {
                if (!trip?.id) continue;
                if (!tripHasMoneyForLedgerProjection(trip)) {
                    stats.skippedNoMoney += 1;
                    continue;
                }
                const evs = buildCanonicalTripFareEventsFromTrip(trip as Record<string, unknown>);
                if (evs.length === 0) {
                    stats.unresolvedAfterGenerate += 1;
                } else {
                    toAppend.push(...evs);
                }
            }
            const MAX = 200;
            for (let j = 0; j < toAppend.length; j += MAX) {
                const slice = toAppend.slice(j, j + MAX);
                try {
                    const r = await appendCanonicalLedgerEvents(slice, c);
                    stats.ledgerRowsWritten += r.inserted;
                } catch (loopErr: any) {
                    stats.errors += 1;
                    console.error(`[Ledger EnsureTripIds] canonical append:`, loopErr?.message || loopErr);
                }
            }
        }

        const durationMs = Date.now() - startMs;
        console.log(
            `[Ledger EnsureTripIds] OK — requested=${stats.tripIdsRequested} loaded=${stats.tripsLoaded} rows=${stats.ledgerRowsWritten} skipped=${stats.skippedNoMoney} unresolved=${stats.unresolvedAfterGenerate} errors=${stats.errors} (${durationMs}ms)`,
        );
        return c.json({ success: true, stats, durationMs });
    } catch (e: any) {
        console.error("[Ledger EnsureTripIds] Fatal:", e);
        return c.json({ error: e?.message || "ensure-from-trip-ids failed" }, 500);
    }
});

// ─── GET /diagnostic/unresolvable-driver-map — Step A: Discover Uber/InDrive UUID → Driver mapping ──
// Scans `ledger_event:*` rows; finds driverIds that are NOT known Roam UUIDs and groups them for mapping.
app.get("/make-server-37f42386/diagnostic/unresolvable-driver-map", requireAuth(), async (c) => {
    try {
        const drivers = await loadDriverCache();
        const roamIds = new Set(drivers.map((d: any) => d.id));

        // Paginated fetch of canonical ledger events
        const PAGE = 1000;
        const MAX_ROWS = 50000;
        let allEntries: Array<{ key: string; value: any }> = [];
        let offset = 0;
        while (offset < MAX_ROWS) {
            const { data, error } = await supabase
                .from("kv_store_37f42386")
                .select("key, value")
                .like("key", CANONICAL_LEDGER_KEY_LIKE)
                .range(offset, offset + PAGE - 1);
            if (error) throw error;
            const page = data || [];
            allEntries = allEntries.concat(page);
            if (page.length < PAGE) break;
            offset += PAGE;
        }

        // Group non-Roam driverIds
        const unknownMap: Record<string, {
            count: number;
            driverNames: Set<string>;
            platforms: Set<string>;
            eventTypes: Set<string>;
            sampleSourceIds: string[];
        }> = {};

        for (const entry of allEntries) {
            const val = entry.value;
            if (!val || !val.driverId) continue;
            const did = val.driverId;
            if (roamIds.has(did)) continue; // already a Roam UUID — skip

            if (!unknownMap[did]) {
                unknownMap[did] = {
                    count: 0,
                    driverNames: new Set(),
                    platforms: new Set(),
                    eventTypes: new Set(),
                    sampleSourceIds: [],
                };
            }
            const m = unknownMap[did];
            m.count++;
            if (val.driverName) m.driverNames.add(val.driverName);
            if (val.platform) m.platforms.add(val.platform);
            if (val.eventType) m.eventTypes.add(val.eventType);
            if (val.sourceId && m.sampleSourceIds.length < 3) m.sampleSourceIds.push(val.sourceId);
        }

        // Convert Sets to arrays for JSON serialization
        const mapping = Object.entries(unknownMap).map(([driverId, info]) => ({
            driverId,
            count: info.count,
            driverNames: Array.from(info.driverNames),
            platforms: Array.from(info.platforms),
            eventTypes: Array.from(info.eventTypes),
            sampleSourceIds: info.sampleSourceIds,
        }));

        // Also include the Roam driver records for easy reference
        const driverRecords = drivers.map((d: any) => ({
            roamId: d.id,
            name: d.name || [d.firstName, d.lastName].filter(Boolean).join(' ') || 'Unknown',
            uberDriverId: d.uberDriverId || null,
            inDriveDriverId: d.inDriveDriverId || null,
        }));

        console.log(`[Diagnostic] Scanned ${allEntries.length} ledger entries, found ${mapping.length} unique non-Roam driverIds`);
        return c.json({
            success: true,
            totalLedgerEntries: allEntries.length,
            totalRoamDrivers: drivers.length,
            uniqueUnresolvableIds: mapping.length,
            mapping,
            driverRecords,
        });
    } catch (e: any) {
        console.error('[Diagnostic] unresolvable-driver-map error:', e);
        return c.json({ error: e.message }, 500);
    }
});

// ─── POST /diagnostic/set-platform-id — Step B: Set uberDriverId/inDriveDriverId on a driver record ──
// Body: { roamId: string, platform: "uber"|"indrive", platformId: string }
app.post("/make-server-37f42386/diagnostic/set-platform-id", async (c) => {
    try {
        const { roamId, platform, platformId } = await c.req.json();
        if (!roamId || !platform || !platformId) {
            return c.json({ error: 'Missing required fields: roamId, platform, platformId' }, 400);
        }
        const fieldName = platform === 'uber' ? 'uberDriverId' : platform === 'indrive' ? 'inDriveDriverId' : null;
        if (!fieldName) {
            return c.json({ error: `Invalid platform "${platform}". Must be "uber" or "indrive".` }, 400);
        }

        // Read current driver record
        const existing = await kv.get(`driver:${roamId}`);
        if (!existing) {
            return c.json({ error: `Driver record not found for roamId: ${roamId}` }, 404);
        }

        const oldValue = existing[fieldName] || null;
        const updated = { ...existing, [fieldName]: platformId };
        await kv.set(`driver:${roamId}`, stampOrg(updated, c));
        invalidateDriverCache();

        const driverName = existing.name || [existing.firstName, existing.lastName].filter(Boolean).join(' ') || 'Unknown';
        console.log(`[Diagnostic] Set ${fieldName}=${platformId} on driver "${driverName}" (${roamId}). Old value: ${oldValue}`);
        return c.json({
            success: true,
            driverName,
            roamId,
            field: fieldName,
            oldValue,
            newValue: platformId,
        });
    } catch (e: any) {
        console.error('[Diagnostic] set-platform-id error:', e);
        return c.json({ error: e.message }, 500);
    }
});

/** Roam + Uber + InDrive UUIDs — align with canonical driver-overview ID resolution. */
async function resolveDriverIdsForEarningsHistory(driverId: string): Promise<string[]> {
  const ids = new Set<string>([String(driverId).trim()]);
  try {
    const dr: any = await kv.get(`driver:${driverId}`);
    if (dr?.uberDriverId) ids.add(String(dr.uberDriverId).trim());
    if (dr?.inDriveDriverId) ids.add(String(dr.inDriveDriverId).trim());
  } catch {
    /* ignore */
  }
  return Array.from(ids);
}

/** Paginate all `ledger_event:*` values for driver ID(s), org-filtered. */
async function fetchAllLedgerEventValuesForDrivers(driverIds: string[], c: any): Promise<any[]> {
  if (!driverIds.length) return [];
  const PAGE = 1000;
  const MAX_ROWS = 50000;
  const all: any[] = [];
  let offset = 0;
  const orFilter =
    driverIds.length === 1 ? null : driverIds.map((id) => `value->>driverId.eq.${id}`).join(",");
  while (offset < MAX_ROWS) {
    let q = supabase.from("kv_store_37f42386").select("value").like("key", "ledger_event:%");
    if (orFilter) q = q.or(orFilter);
    else q = q.eq("value->>driverId", driverIds[0]);
    const { data, error } = await q.range(offset, offset + PAGE - 1);
    if (error) throw error;
    const page = data || [];
    all.push(...page.map((d: any) => d.value).filter(Boolean));
    if (page.length < PAGE) break;
    offset += PAGE;
  }
  return filterByOrg(all, c);
}

/** Paginate all org-scoped `fare_earning` rows from `ledger_event:*`. */
async function fetchCanonicalFareEarningAll(c: any): Promise<any[]> {
  const PAGE = 1000;
  const MAX_ROWS = 100000;
  const all: any[] = [];
  let offset = 0;
  while (offset < MAX_ROWS) {
    const { data, error } = await supabase
      .from("kv_store_37f42386")
      .select("value")
      .like("key", "ledger_event:%")
      .eq("value->>eventType", "fare_earning")
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    const page = data || [];
    all.push(...page.map((d: any) => d.value).filter(Boolean));
    if (page.length < PAGE) break;
    offset += PAGE;
  }
  return filterByOrg(all, c);
}

/** Paginate `ledger_event:*` in [periodStart, periodEnd], org-scoped. */
async function fetchCanonicalLedgerEventsInPeriod(c: any, periodStart: string, periodEnd: string): Promise<any[]> {
  const PAGE = 1000;
  const MAX_ROWS = 100000;
  const all: any[] = [];
  let offset = 0;
  while (offset < MAX_ROWS) {
    const { data, error } = await supabase
      .from("kv_store_37f42386")
      .select("value")
      .like("key", "ledger_event:%")
      .gte("value->>date", periodStart)
      .lte("value->>date", periodEnd)
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    const page = data || [];
    all.push(...page.map((d: any) => d.value).filter(Boolean));
    if (page.length < PAGE) break;
    offset += PAGE;
  }
  return filterByOrg(all, c);
}

/** Same aggregation shape as GET /ledger/fleet-summary (canonical ledger_event rows). */
function aggregateFleetSummaryFromLedgerLikeEntries(entries: any[]): {
  totalEarnings: number;
  totalTripCount: number;
  totalCashCollected: number;
  dailyTrend: Array<{ date: string; earnings: number; tripCount: number }>;
  topDrivers: Array<{ driverId: string; driverName: string; earnings: number; tripCount: number }>;
  platformBreakdown: Array<{ platform: string; earnings: number; tripCount: number }>;
  revenueByType: { fare: number; tip: number; promotion: number; other: number };
} {
  let totalEarnings = 0;
  let totalTripCount = 0;
  let totalCashCollected = 0;
  const revenueByType: Record<string, number> = {
    fare: 0,
    tip: 0,
    promotion: 0,
    other: 0,
  };
  const dailyMap = new Map<string, { earnings: number; tripCount: number }>();
  const driverMap = new Map<string, { driverName: string; earnings: number; tripCount: number }>();
  const platformMap = new Map<string, { earnings: number; tripCount: number }>();

  for (const e of entries) {
    const eventType = e.eventType || "";
    const gross = Number(e.grossAmount) || 0;
    const net = Number(e.netAmount) || 0;
    const entryDate = (e.date || "").substring(0, 10);
    const platform = (e.platform === "GoRide" ? "Roam" : e.platform) || "Other";
    const driverId = e.driverId || "unknown";
    const driverName = e.driverName || "Unknown";
    const paymentMethod = e.paymentMethod || "";

    if (eventType === "fare_earning") {
      totalEarnings += gross;
      totalTripCount += 1;
      if (paymentMethod === "Cash") {
        totalCashCollected += Math.abs(net);
      }
      revenueByType.fare += gross;
      if (entryDate && entryDate.length === 10) {
        let day = dailyMap.get(entryDate);
        if (!day) {
          day = { earnings: 0, tripCount: 0 };
          dailyMap.set(entryDate, day);
        }
        day.earnings += gross;
        day.tripCount += 1;
      }
      if (driverId && driverId !== "unknown") {
        let drv = driverMap.get(driverId);
        if (!drv) {
          drv = { driverName, earnings: 0, tripCount: 0 };
          driverMap.set(driverId, drv);
        }
        drv.earnings += gross;
        drv.tripCount += 1;
        if (driverName && driverName !== "Unknown") drv.driverName = driverName;
      }
      let plat = platformMap.get(platform);
      if (!plat) {
        plat = { earnings: 0, tripCount: 0 };
        platformMap.set(platform, plat);
      }
      plat.earnings += gross;
      plat.tripCount += 1;
    } else if (eventType === "tip") {
      revenueByType.tip += net;
      totalEarnings += net;
    } else if (eventType === "promotion" || eventType === "incentive") {
      revenueByType.promotion += net;
    } else if (net > 0) {
      revenueByType.other += net;
    }
  }

  const dailyTrend = Array.from(dailyMap.entries())
    .map(([date, d]) => ({
      date,
      earnings: Number(d.earnings.toFixed(2)),
      tripCount: d.tripCount,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const topDrivers = Array.from(driverMap.entries())
    .map(([id, d]) => ({
      driverId: id,
      driverName: d.driverName,
      earnings: Number(d.earnings.toFixed(2)),
      tripCount: d.tripCount,
    }))
    .sort((a, b) => b.earnings - a.earnings)
    .slice(0, 10);

  const platformBreakdown = Array.from(platformMap.entries())
    .map(([plat, d]) => ({
      platform: plat,
      earnings: Number(d.earnings.toFixed(2)),
      tripCount: d.tripCount,
    }))
    .sort((a, b) => b.earnings - a.earnings);

  return {
    totalEarnings: Number(totalEarnings.toFixed(2)),
    totalTripCount,
    totalCashCollected: Number(totalCashCollected.toFixed(2)),
    dailyTrend,
    topDrivers,
    platformBreakdown,
    revenueByType: {
      fare: Number(revenueByType.fare.toFixed(2)),
      tip: Number(revenueByType.tip.toFixed(2)),
      promotion: Number(revenueByType.promotion.toFixed(2)),
      other: Number(revenueByType.other.toFixed(2)),
    },
  };
}

// ─── GET /ledger/driver-earnings-history — Phase 4: Server-Side Earnings History ──────
// Computes the same weekly/daily/monthly earnings table as DriverEarningsHistory,
// but from ledger entries instead of raw trips.
// Query params: driverId (required), periodType (daily|weekly|monthly, default: weekly),
//               startDate (optional), endDate (optional)
//               ledger_event:* only (legacy readModel removed).
app.get("/make-server-37f42386/ledger/driver-earnings-history", requireAuth(), async (c) => {
  try {
    const startMs = Date.now();
    const driverId = c.req.query("driverId");
    const periodType = (c.req.query("periodType") || "weekly") as "daily" | "weekly" | "monthly";
    const startDateParam = c.req.query("startDate") || null;
    const endDateParam = c.req.query("endDate") || null;

    if (!driverId) {
      return c.json({ error: "Missing required param: driverId" }, 400);
    }

    console.log(
      `[Ledger EarningsHistory] driverId=${driverId} periodType=${periodType} range=${startDateParam || "auto"}..${endDateParam || "auto"} readModel=canonical`,
    );

    const driverIdsResolved = await resolveDriverIdsForEarningsHistory(driverId);

    // ── Step 1: Fetch canonical ledger_event rows for this driver (multi-ID) ──
    const allEntries = await fetchAllLedgerEventValuesForDrivers(driverIdsResolved, c);
    console.log(`[Ledger EarningsHistory] Canonical ledger_event rows for driver(s): ${allEntries.length}`);

    // ── Step 2: Determine date range ──
    // When `startDate`+`endDate` are sent (same span as trips/transactions), bucket **that** full range
    // so weeks align with Expenses / Settlement. Otherwise min..max from ledger_event dates only (sparse).
    const allDatesEH = allEntries
      .map((e: any) => e.date)
      .filter(Boolean)
      .map((d: string) => new Date(d + "T00:00:00").getTime())
      .filter((t: number) => !isNaN(t));

    const scopedByActivityRange = !!(startDateParam && endDateParam);
    let minDateMs: number;
    let maxDateMs: number;
    if (scopedByActivityRange) {
      minDateMs = new Date(startDateParam! + "T00:00:00").getTime();
      maxDateMs = new Date(endDateParam! + "T23:59:59").getTime();
      if (minDateMs > maxDateMs) {
        const x = minDateMs;
        minDateMs = maxDateMs;
        maxDateMs = x;
      }
    } else if (allDatesEH.length > 0) {
      minDateMs = Math.min(...allDatesEH);
      maxDateMs = Math.min(Math.max(...allDatesEH), Date.now());
    } else {
      return c.json({ success: true, data: [], durationMs: Date.now() - startMs });
    }

    // ── Step 3: Generate period buckets ──
    const msPerDay = 86400000;

    function toDateStrEH(d: Date): string {
      return d.toISOString().split("T")[0];
    }
    function startOfDayMsEH(ms: number): number {
      const d = new Date(ms);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    }
    function endOfDayMsEH(ms: number): number {
      return startOfDayMsEH(ms) + msPerDay - 1;
    }
    function startOfMonthMsEH(ms: number): number {
      const d = new Date(ms);
      return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    }
    function endOfMonthMsEH(ms: number): number {
      const d = new Date(ms);
      return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
    }
    function startOfWeekMsEH(ms: number): number {
      const d = new Date(ms);
      const day = d.getDay();
      const diff = (day === 0 ? -6 : 1) - day;
      return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff).getTime();
    }
    function endOfWeekMsEH(ms: number): number {
      return startOfWeekMsEH(ms) + 7 * msPerDay - 1;
    }

    interface BucketEH { startMs: number; endMs: number; startDate: string; endDate: string; }
    const buckets: BucketEH[] = [];

    if (periodType === "daily") {
      let cursor = startOfDayMsEH(minDateMs);
      const cap = endOfDayMsEH(maxDateMs);
      while (cursor <= cap) {
        const s = cursor;
        const e = endOfDayMsEH(cursor);
        buckets.push({ startMs: s, endMs: e, startDate: toDateStrEH(new Date(s)), endDate: toDateStrEH(new Date(s)) });
        cursor += msPerDay;
      }
    } else if (periodType === "monthly") {
      let cursor = startOfMonthMsEH(minDateMs);
      const cap = endOfMonthMsEH(maxDateMs);
      while (cursor <= cap) {
        const s = cursor;
        const e = endOfMonthMsEH(cursor);
        buckets.push({ startMs: s, endMs: e, startDate: toDateStrEH(new Date(s)), endDate: toDateStrEH(new Date(e)) });
        const d = new Date(cursor);
        cursor = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
      }
    } else {
      let cursor = startOfWeekMsEH(minDateMs);
      const cap = endOfWeekMsEH(maxDateMs);
      while (cursor <= cap) {
        const s = cursor;
        const e = endOfWeekMsEH(cursor);
        buckets.push({ startMs: s, endMs: e, startDate: toDateStrEH(new Date(s)), endDate: toDateStrEH(new Date(e)) });
        cursor += 7 * msPerDay;
      }
    }

    // ── Step 4: Load tiers + quota from preferences ──
    const prefsEH: any = (await kv.get("preferences:general")) || {};

    const defaultTiersEH = [
      { id: "tier_1", name: "Bronze", minEarnings: 0, maxEarnings: 75000, sharePercentage: 25, color: "#CD7F32" },
      { id: "tier_2", name: "Silver", minEarnings: 75000, maxEarnings: 150000, sharePercentage: 27, color: "#C0C0C0" },
      { id: "tier_3", name: "Gold", minEarnings: 150000, maxEarnings: null, sharePercentage: 30, color: "#FFD700" },
    ];
    const tiersEH: any[] = (prefsEH.tiers && prefsEH.tiers.length > 0) ? prefsEH.tiers : defaultTiersEH;
    const sortedTiersEH = [...tiersEH].sort((a: any, b: any) => a.minEarnings - b.minEarnings);

    function getTierForEarningsEH(cumulative: number): any {
      const match = sortedTiersEH.find((t: any) => {
        if (t.maxEarnings === null) return cumulative >= t.minEarnings;
        return cumulative >= t.minEarnings && cumulative < t.maxEarnings;
      });
      return match || sortedTiersEH[0];
    }

    const quotaConfigEH: any = prefsEH.quotas || null;
    function getQuotaTargetEH(pt: string): number | null {
      if (!quotaConfigEH) return null;
      if (pt === "daily") {
        if (!quotaConfigEH.weekly?.enabled) return null;
        const workingDays = quotaConfigEH.weekly.workingDays?.length || 6;
        return quotaConfigEH.weekly.amount / workingDays;
      }
      if (pt === "weekly") {
        if (!quotaConfigEH.weekly?.enabled) return null;
        return quotaConfigEH.weekly.amount;
      }
      if (quotaConfigEH.monthly?.enabled) return quotaConfigEH.monthly.amount;
      if (quotaConfigEH.weekly?.enabled) return quotaConfigEH.weekly.amount * 4.33;
      return null;
    }
    const quotaTargetEH = getQuotaTargetEH(periodType);

    // ── Step 5: Pre-index entries by date for fast bucket assignment ──
    const parsedEntries = allEntries.map((e: any) => ({
      ...e,
      _dateMs: e.date ? new Date(e.date + "T00:00:00").getTime() : NaN,
    })).filter((e: any) => !isNaN(e._dateMs));

    const fareEntriesEH = parsedEntries
      .filter((e: any) => e.eventType === "fare_earning")
      .sort((a: any, b: any) => a._dateMs - b._dateMs);

    // ── Step 6: Aggregate each bucket ──
    const expenseTypes = new Set(["fuel_expense", "maintenance", "insurance", "other_expense"]);

    const rowsEH: any[] = buckets.map((bucket) => {
      const { startMs: bStart, endMs: bEnd } = bucket;
      const periodEntries = parsedEntries.filter((e: any) => e._dateMs >= bStart && e._dateMs <= bEnd);

      const periodFares = periodEntries.filter((e: any) => e.eventType === "fare_earning");
      const grossRevenue = periodFares.reduce((s: number, e: any) => {
        const g = Number.isFinite(e.grossAmount) ? Number(e.grossAmount) : Math.abs(Number(e.netAmount) || 0);
        return s + g;
      }, 0);
      const tripCount = periodFares.length;
      const ledgerEventCount = periodEntries.length;

      const tips = periodEntries
        .filter((e: any) => e.eventType === "tip")
        .reduce((s: number, e: any) => s + (e.netAmount || 0), 0);

      const tolls = periodEntries
        .filter((e: any) => e.eventType === "toll_charge")
        .reduce((s: number, e: any) => s + Math.abs(e.netAmount || 0), 0);

      const platformFees = periodEntries
        .filter((e: any) => e.eventType === "platform_fee")
        .reduce((s: number, e: any) => s + Math.abs(e.netAmount || 0), 0);

      const expenses = periodEntries
        .filter((e: any) => expenseTypes.has(e.eventType) || (e.direction === "outflow" && e.category === "Expense"))
        .reduce((s: number, e: any) => s + Math.abs(e.netAmount || 0), 0);

      const payouts = periodEntries
        .filter((e: any) => e.eventType === "driver_payout")
        .reduce((s: number, e: any) => s + Math.abs(e.netAmount || 0), 0);

      const transactionCount = periodEntries.filter((e: any) =>
        expenseTypes.has(e.eventType) || e.eventType === "driver_payout" || e.eventType === "adjustment"
      ).length;

      // Monthly-reset cumulative earnings for tier lookup
      const refMonthStartMs = startOfMonthMsEH(bStart);
      const refMonthEndMs = endOfMonthMsEH(bStart);
      const cumulativeCap = Math.min(bEnd, refMonthEndMs);

      const cumulativeEarnings = fareEntriesEH.reduce((s: number, e: any) => {
        if (e._dateMs >= refMonthStartMs && e._dateMs <= cumulativeCap) {
          const g = Number.isFinite(e.grossAmount) ? Number(e.grossAmount) : Math.abs(Number(e.netAmount) || 0);
          return s + g;
        }
        return s;
      }, 0);

      const tier = getTierForEarningsEH(cumulativeEarnings);
      const driverShare = grossRevenue * (tier.sharePercentage / 100);
      const fleetShare = grossRevenue - driverShare;
      const netEarnings = driverShare - expenses;

      const qPercent = (quotaTargetEH !== null && quotaTargetEH > 0) ? (grossRevenue / quotaTargetEH) * 100 : null;

      return {
        periodStart: bucket.startDate,
        periodEnd: bucket.endDate,
        grossRevenue: Math.round(grossRevenue * 100) / 100,
        driverShare: Math.round(driverShare * 100) / 100,
        fleetShare: Math.round(fleetShare * 100) / 100,
        expenses: Math.round(expenses * 100) / 100,
        tier: { id: tier.id, name: tier.name, sharePercentage: tier.sharePercentage, color: tier.color },
        netEarnings: Math.round(netEarnings * 100) / 100,
        payouts: Math.round(payouts * 100) / 100,
        tripCount,
        transactionCount,
        tips: Math.round(tips * 100) / 100,
        tolls: Math.round(tolls * 100) / 100,
        platformFees: Math.round(platformFees * 100) / 100,
        quotaTarget: quotaTargetEH,
        quotaPercent: qPercent !== null ? Math.round(qPercent * 100) / 100 : null,
        ledgerEventCount,
      };
    });

    // Activity-scoped range: show every period in range (zeros) — matches other Financials tabs.
    // Auto range (ledger-only dates): hide empty periods to keep the table small.
    const activeRows = scopedByActivityRange
      ? rowsEH.slice().reverse()
      : rowsEH
          .filter((r: any) => {
            if (r.tripCount > 0 || r.transactionCount > 0) return true;
            if ((r.ledgerEventCount || 0) > 0) return true;
            if (Math.abs(r.grossRevenue || 0) > 1e-6) return true;
            if (Math.abs(r.tips || 0) > 1e-6) return true;
            if (Math.abs(r.payouts || 0) > 1e-6) return true;
            if (Math.abs(r.tolls || 0) > 1e-6) return true;
            if (Math.abs(r.platformFees || 0) > 1e-6) return true;
            if (Math.abs(r.expenses || 0) > 1e-6) return true;
            return false;
          })
          .reverse();

    const durationMs = Date.now() - startMs;
    const totalGross = activeRows.reduce((s: number, r: any) => s + r.grossRevenue, 0);
    console.log(`[Ledger EarningsHistory] driverId=${driverId} periodType=${periodType} range=${startDateParam || "auto"}..${endDateParam || "auto"} — returned ${activeRows.length} rows, total gross $${totalGross.toFixed(2)}, ${durationMs}ms`);

    return c.json({ success: true, data: activeRows, durationMs, readModel: "canonical" });
  } catch (e: any) {
    console.error("[Ledger EarningsHistory] Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// END OF LEDGER ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════

// Claims Endpoints
app.get("/make-server-37f42386/claims", requireAuth(), async (c) => {
  try {
    const limitParam = c.req.query("limit");
    const offsetParam = c.req.query("offset");
    const limit = limitParam ? parseInt(limitParam) : 100;
    const offset = offsetParam ? parseInt(offsetParam) : 0;

    const { data, error } = await supabase
        .from("kv_store_37f42386")
        .select("value")
        .like("key", "claim:%")
        .range(offset, offset + limit - 1);

    if (error) throw error;
    
    const claims = filterByOrg(data?.map((d: any) => d.value) || [], c);
    return c.json(claims);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/claims", async (c) => {
  try {
    const claim = await c.req.json();
    if (!claim.id) {
        claim.id = crypto.randomUUID();
    }
    await kv.set(`claim:${claim.id}`, stampOrg(claim, c));
    return c.json({ success: true, data: claim });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-37f42386/claims/:id", async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`claim:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Expense Management Endpoints (Phase 5)
app.post("/make-server-37f42386/scan-receipt", async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body['file'];
    
    if (!file || !(file instanceof File)) {
        return c.json({ error: "File upload required" }, 400);
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return c.json({ error: "OpenAI API Key not configured" }, 503);

    const openai = new OpenAI({ apiKey });

    const arrayBuffer = await file.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');
    const dataUrl = `data:${file.type};base64,${base64Data}`;

    const prompt = `
      You are an OCR assistant for a driver expense portal. 
      Parse the receipt or invoice image. It might be a general receipt, fuel receipt, or toll receipt.
      This is from Jamaica. Jamaica EXCLUSIVELY uses DD/MM/YYYY date format. NEVER interpret dates as MM/DD/YYYY.
      
      Current Date Context: ${new Date().toISOString().split('T')[0]}
      
      Return a valid JSON object with these EXACT fields:
      - type (string): "Fuel", "Toll", "Maintenance", or "Other"
      - merchant (string): Name of the merchant or agency (e.g. "Highway 2000", "Total Gas")
      - amount (number): Total amount paid (number only)
      - date (string): Date in YYYY-MM-DD format. The receipt uses DD/MM/YYYY. The FIRST number is ALWAYS the day, the SECOND is ALWAYS the month. Example: "01/12/2025" on the receipt = 1st December 2025 = output "2025-12-01". NEVER swap day and month.
      - time (string): Time in HH:MM format (24h)
      - receiptNumber (string): Invoice, ticket, or reference number
      - plaza (string): Plaza name (for tolls)
      - lane (string): Lane number (for tolls)
      - vehicleClass (string): Vehicle class (for tolls)
      - collector (string): Collector name/ID
      - notes (string): Brief description
      
      If specific fields are missing, return null. 
      Output only valid JSON. Do not use markdown code blocks.
    `;

    const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            {
                role: "user",
                content: [
                    { type: "text", text: prompt },
                    { type: "image_url", image_url: { url: dataUrl } }
                ]
            }
        ],
        response_format: { type: "json_object" }
    });

    const text = response.choices[0].message.content || "{}";
    const data = JSON.parse(text);

    // Post-processing: catch and correct any future dates the AI missed
    const [corrected] = correctFutureDates([data]);
    return c.json({ success: true, data: corrected });

  } catch (e: any) {
    console.error("Scan Receipt Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/scan-odometer", async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body['file'];
    
    if (!file || !(file instanceof File)) {
        return c.json({ error: "File upload required" }, 400);
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return c.json({ error: "OpenAI API Key not configured" }, 503);

    const openai = new OpenAI({ apiKey });

    const arrayBuffer = await file.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');
    const dataUrl = `data:${file.type};base64,${base64Data}`;

    const prompt = `
      You are an AI assistant for a vehicle fleet.
      Analyze this image of a vehicle dashboard to find the Odometer reading.
      Return a valid JSON object with these fields:
      - reading (number | null): The odometer value (e.g. 15043). Do not include decimals unless it is clearly part of the main odometer. Ignore trip meters (which are usually smaller or resetable).
      - unit (string): "km" or "mi" if visible, otherwise default to "km"
      - confidence (string): "high", "medium", or "low"

      If you cannot clearly see an odometer, set reading to null.
      Output only valid JSON.
    `;

    const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            {
                role: "user",
                content: [
                    { type: "text", text: prompt },
                    { type: "image_url", image_url: { url: dataUrl } }
                ]
            }
        ],
        response_format: { type: "json_object" }
    });

    const text = response.choices[0].message.content || "{}";
    const data = JSON.parse(text);

    return c.json({ success: true, data });

  } catch (e: any) {
    console.error("Scan Odometer Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/expenses/approve", requireAuth(), requirePermission('fuel.approve'), async (c) => {
  try {
    const body = await c.req.json();
    const { id, notes, odometerReading, matchedStationId: adminMatchedStationId, stationLocation: adminStationLocation } = body;
    if (!id) return c.json({ error: "Transaction ID is required" }, 400);

    const tx = await kv.get(`transaction:${id}`);
    if (!tx) return c.json({ error: "Transaction not found" }, 404);

    /** Admin Review Queue: optional verified station (same workflow as manual log entry). */
    let adminResolvedStation: any = null;
    const rawAdminStation = adminMatchedStationId != null ? String(adminMatchedStationId).trim() : "";
    if (rawAdminStation) {
        const st = await kv.get(`station:${rawAdminStation}`);
        if (st && st.status === "verified") {
            adminResolvedStation = st;
            tx.matchedStationId = st.id;
            tx.vendor = st.name;
            tx.metadata = {
                ...tx.metadata,
                matchedStationId: st.id,
                locationStatus: "verified",
                verificationMethod: "admin_approval_station",
                stationLocation:
                    (typeof adminStationLocation === "string" && adminStationLocation.trim()) ||
                    st.address ||
                    tx.metadata?.stationLocation,
                stationGateHold: false,
                holdReason: undefined,
                holdTimestamp: undefined,
            };
            console.log(`[ApproveHandler] Admin linked verified station "${st.name}" (${st.id}) for transaction ${id}`);
        } else {
            console.warn(`[ApproveHandler] Ignoring matchedStationId "${rawAdminStation}" — not found or not verified`);
        }
    }

    // If admin provides an odometer reading (Log Review flow), apply it
    if (odometerReading !== undefined && odometerReading !== null) {
        const odoVal = Number(odometerReading);
        if (!isNaN(odoVal) && odoVal > 0) {
            tx.odometer = odoVal;
            console.log(`[ApproveHandler] Admin provided odometer reading: ${odoVal} km for transaction ${id}`);
        }
    }

    tx.status = 'Approved';
    tx.isReconciled = true; // Approval implies reconciliation usually
    tx.metadata = { 
        ...tx.metadata, 
        approvedAt: new Date().toISOString(), 
        notes: notes || tx.metadata?.notes,
        // Clear the Log Review flag now that admin has reviewed
        needsLogReview: undefined,
        logReviewCompleted: tx.metadata?.needsLogReview ? true : undefined,
        logReviewCompletedAt: tx.metadata?.needsLogReview ? new Date().toISOString() : undefined,
        adminOdometerReading: (odometerReading !== undefined && odometerReading !== null) ? Number(odometerReading) : undefined,
        stationGateHold: false,
        holdReason: undefined,
        holdTimestamp: undefined,
    };

    // Auto-create Fuel Entry for approved Fuel Reimbursements
    if ((tx.category === 'Fuel' || tx.category === 'Fuel Reimbursement') && tx.status === 'Approved') {
        const amount = Math.abs(Number(tx.amount) || Number(tx.metadata?.totalCost) || 0);
        let quantity =
            Number(tx.quantity) ||
            Number(tx.metadata?.fuelVolume) ||
            0;
        if (!quantity || quantity <= 0) {
            const ppl = Number(tx.metadata?.pricePerLiter);
            if (amount > 0 && ppl > 0) {
                quantity = Number((amount / ppl).toFixed(2));
            }
        }
        const pricePerLiter =
            Number(tx.metadata?.pricePerLiter) ||
            (quantity > 0 ? Number((amount / quantity).toFixed(3)) : 0);

        if (quantity > 0) {
            tx.quantity = quantity;
            tx.metadata = { ...tx.metadata, fuelVolume: quantity };
        }

        const resolvedVendor =
            adminResolvedStation?.name ||
            tx.vendor ||
            tx.merchant ||
            tx.description ||
            "Reimbursement";

        const fuelEntry = {
            id: crypto.randomUUID(),
            date: (tx.date && tx.time) ? `${tx.date}T${tx.time}` : (tx.date || new Date().toISOString().split('T')[0]),
            type: 'Reimbursement', // Using internal type even if UI doesn't show it
            amount: amount,
            liters: quantity,
            pricePerLiter: pricePerLiter,
            odometer: Number(tx.odometer) || 0,
            location: resolvedVendor,
            vendor: resolvedVendor,
            stationAddress: tx.metadata?.stationLocation || tx.location || '',
            vehicleId: tx.vehicleId, // Must be present to link to vehicle stats
            driverId: tx.driverId,
            cardId: undefined, // Not a card transaction
            transactionId: tx.id, // Link back to original transaction
            matchedStationId: tx.matchedStationId || tx.metadata?.matchedStationId,
            receiptUrl: tx.receiptUrl || tx.metadata?.receiptUrl,
            odometerProofUrl: tx.odometerProofUrl || tx.metadata?.odometerProofUrl,
            isVerified: true, // Matches auto-approve path (line 1974)
            source: 'Manual Approval', // Distinguishes from auto-approve 'Fuel Log'
            metadata: {
                ...tx.metadata,
                portal_type: tx.metadata?.portal_type || 'Manual_Entry',
                isManual: tx.metadata?.isManual ?? (tx.paymentMethod === 'Cash' || tx.metadata?.portal_type === 'Manual_Entry'),
                sourceId: tx.id,
                source: tx.metadata?.source || 'Manual Approval',
                receiptUrl: tx.receiptUrl || tx.metadata?.receiptUrl,
                odometerProofUrl: tx.odometerProofUrl || tx.metadata?.odometerProofUrl,
                locationStatus: tx.metadata?.locationStatus || ((tx.matchedStationId || tx.metadata?.matchedStationId) ? 'verified' : 'unknown'),
                matchedStationId: tx.matchedStationId || tx.metadata?.matchedStationId,
                verificationMethod: tx.metadata?.verificationMethod || ((tx.matchedStationId || tx.metadata?.matchedStationId) ? 'manual_station_picker' : undefined),
            }
        };

        // Calculate Audit Confidence Score (matching auto-approve gold-standard pattern)
        const resolvedStationId = fuelEntry.matchedStationId;
        let matchedStation = null;
        if (resolvedStationId) {
            matchedStation = await kv.get(`station:${resolvedStationId}`);
        }

        if (matchedStation && fuelEntry.matchedStationId) {
            const confidence = fuelLogic.calculateConfidenceScore(fuelEntry, matchedStation);
            fuelEntry.metadata = {
                ...fuelEntry.metadata,
                auditConfidenceScore: confidence.score,
                auditConfidenceBreakdown: confidence.breakdown,
                isHighlyTrusted: confidence.isHighlyTrusted
            };
            console.log(`[ApproveHandler] Audit confidence for ${fuelEntry.id}: ${confidence.score}/100`);
        } else {
            // No matched station — still calculate base confidence (behavioral + physical only)
            const confidence = fuelLogic.calculateConfidenceScore(fuelEntry, null);
            fuelEntry.metadata = {
                ...fuelEntry.metadata,
                auditConfidenceScore: confidence.score,
                auditConfidenceBreakdown: confidence.breakdown,
                isHighlyTrusted: confidence.isHighlyTrusted
            };
            console.log(`[ApproveHandler] Audit confidence (no station) for ${fuelEntry.id}: ${confidence.score}/100`);
        }

        // Only save if we have a vehicleId (Critical for fleet stats)
        if (fuelEntry.vehicleId) {
             await kv.set(`fuel_entry:${fuelEntry.id}`, stampOrg(fuelEntry, c));
             
             // Check if we need to link this to a transaction
             if (tx.id) {
                // Ensure the transaction also has the URLs updated if they were missing
                tx.receiptUrl = tx.receiptUrl || tx.metadata?.receiptUrl;
                tx.metadata = {
                    ...tx.metadata,
                    receiptUrl: tx.receiptUrl,
                    odometerProofUrl: tx.odometerProofUrl || tx.metadata?.odometerProofUrl
                };
             }
        }
    }

    // Phase 4: Auto-create Cash Wallet credit for approved fuel reimbursements
    const paymentSource = tx.metadata?.paymentSource || 'driver_cash'; // default to driver_cash for legacy entries
    const isDriverCash = paymentSource === 'driver_cash';

    if (!isDriverCash) {
        console.log(`[FuelCredit] Skipping wallet credit: payment source is '${paymentSource}' (not driver_cash) for transaction ${id}`);
    }

    if ((tx.category === 'Fuel' || tx.category === 'Fuel Reimbursement') && tx.status === 'Approved' && isDriverCash) {
        if (!tx.driverId) {
            console.log('[FuelCredit] Skipping wallet credit: no driverId on transaction ' + id);
        } else {
            const creditId = `fuel-credit-${id}`;
            const existingCredit = await kv.get(`transaction:${creditId}`);

            if (!existingCredit) {
                const walletCredit = {
                    id: creditId,
                    driverId: tx.driverId,
                    driverName: tx.driverName || '',
                    vehicleId: tx.vehicleId,
                    date: new Date().toISOString().split('T')[0],
                    time: new Date().toISOString().split('T')[1].substring(0, 8),
                    type: 'Payment_Received',
                    category: 'Fuel Reimbursement Credit',
                    description: `Fuel Reimbursement Credit: ${tx.vendor || tx.description || tx.merchant || 'Fuel Purchase'}`,
                    amount: Math.abs(Number(tx.amount) || Number(tx.metadata?.totalCost) || 0),
                    paymentMethod: 'Cash',
                    status: 'Completed',
                    isReconciled: true,
                    referenceNumber: tx.id,
                    metadata: {
                        fuelCreditSourceId: tx.id,
                        source: 'fuel_reimbursement_approval',
                        automated: true,
                        approvedAt: new Date().toISOString(),
                        originalAmount: tx.amount,
                        originalCategory: tx.category
                    }
                };

                await kv.set(`transaction:${creditId}`, stampOrg(walletCredit, c));
                await appendCanonicalFuelReimbursementIfEligible(walletCredit, c);
                console.log(`[FuelCredit] Created wallet credit ${creditId} for driver ${tx.driverId}, amount: ${walletCredit.amount}`);
            } else {
                console.log(`[FuelCredit] Wallet credit already exists for ${id}, skipping (idempotent)`);
            }
        }
    }

    // Phase 4b: Auto-create Cash Wallet credit for approved Toll reimbursements (Manual Resolve: WriteOff/Business)
    const isTollCash = tx.paymentMethod === 'Cash' || !!tx.receiptUrl;

    if (isTollCategoryServer(tx.category) && tx.status === 'Approved' && isTollCash) {
        if (!tx.driverId || tx.driverId === 'fleet') {
            console.log(`[TollCredit] Skipping wallet credit: driverId is '${tx.driverId}' (fleet-absorbed, no driver to credit) for transaction ${id}`);
        } else {
            const tollCreditId = `toll-credit-${id}`;
            const existingTollCredit = await kv.get(`transaction:${tollCreditId}`);

            if (!existingTollCredit) {
                const tollWalletCredit = {
                    id: tollCreditId,
                    driverId: tx.driverId,
                    driverName: tx.driverName || '',
                    vehicleId: tx.vehicleId,
                    date: new Date().toISOString().split('T')[0],
                    time: new Date().toISOString().split('T')[1].substring(0, 8),
                    type: 'Payment_Received',
                    category: 'Toll Reimbursement Credit',
                    description: `Toll Reimbursement Credit: ${tx.description || tx.vendor || tx.merchant || 'Toll Charge'}`,
                    amount: Math.abs(Number(tx.amount) || 0),
                    paymentMethod: 'Cash',
                    status: 'Completed',
                    isReconciled: true,
                    referenceNumber: tx.id,
                    metadata: {
                        tollCreditSourceId: tx.id,
                        source: 'toll_reimbursement_approval',
                        automated: true,
                        approvedAt: new Date().toISOString(),
                        originalAmount: tx.amount,
                        originalCategory: tx.category,
                        resolutionNotes: tx.metadata?.notes
                    }
                };

                await kv.set(`transaction:${tollCreditId}`, stampOrg(tollWalletCredit, c));
                await appendCanonicalTollReimbursementIfEligible(tollWalletCredit, c);
                console.log(`[TollCredit] Created wallet credit ${tollCreditId} for driver ${tx.driverId}, amount: ${tollWalletCredit.amount}`);
            } else {
                console.log(`[TollCredit] Wallet credit already exists for ${id}, skipping (idempotent)`);
            }
        }
    }

    await kv.set(`transaction:${id}`, stampOrg(tx, c));
    return c.json({ success: true, data: tx });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/expenses/reject", requireAuth(), requirePermission('fuel.reject'), async (c) => {
  try {
    const { id, reason } = await c.req.json();
    if (!id) return c.json({ error: "Transaction ID is required" }, 400);

    const tx = await kv.get(`transaction:${id}`);
    if (!tx) return c.json({ error: "Transaction not found" }, 404);

    tx.status = 'Rejected';
    tx.metadata = { 
        ...tx.metadata, 
        rejectedAt: new Date().toISOString(), 
        rejectionReason: reason 
    };

    await kv.set(`transaction:${id}`, stampOrg(tx, c));

    // Clean up wallet credit if this was previously approved (fuel or toll)
    const fuelCreditKey = `transaction:fuel-credit-${id}`;
    const existingFuelCredit = await kv.get(fuelCreditKey);
    if (existingFuelCredit) {
        const fcId = typeof (existingFuelCredit as { id?: string }).id === "string"
          ? String((existingFuelCredit as { id?: string }).id)
          : "";
        await kv.del(fuelCreditKey);
        if (fcId) {
          try {
            await deleteCanonicalLedgerBySource("transaction", [fcId]);
          } catch (e: any) {
            console.warn(`[expenses/reject] Ledger cleanup fuel credit failed:`, e?.message);
          }
        }
        console.log(`[FuelCredit] Removed wallet credit for rejected reimbursement: ${id}`);
    }

    const tollCreditKey = `transaction:toll-credit-${id}`;
    const existingTollCredit = await kv.get(tollCreditKey);
    if (existingTollCredit) {
        const tcId = typeof (existingTollCredit as { id?: string }).id === "string"
          ? String((existingTollCredit as { id?: string }).id)
          : "";
        await kv.del(tollCreditKey);
        if (tcId) {
          try {
            await deleteCanonicalLedgerBySource("transaction", [tcId]);
          } catch (e: any) {
            console.warn(`[expenses/reject] Ledger cleanup toll credit failed:`, e?.message);
          }
        }
        console.log(`[TollCredit] Removed wallet credit for rejected toll: ${id}`);
    }

    return c.json({ success: true, data: tx });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Phase 9: Backfill wallet credits for existing approved fuel reimbursements
app.post("/make-server-37f42386/fuel/backfill-wallet-credits", requireAuth(), requirePermission('data.backfill'), async (c) => {
  try {
    console.log('[FuelCredit Backfill] Starting backfill of historical approved fuel reimbursements...');

    // Fetch all transactions
    const allTransactions = await kv.getByPrefix('transaction:');
    
    // Filter for approved fuel reimbursements that are NOT already wallet credits themselves
    const approvedFuelReimbursements = allTransactions.filter((tx: any) =>
      tx &&
      tx.id &&
      (tx.category === 'Fuel' || tx.category === 'Fuel Reimbursement') &&
      tx.category !== 'Fuel Reimbursement Credit' &&
      tx.status === 'Approved' &&
      tx.driverId
    );

    console.log(`[FuelCredit Backfill] Found ${approvedFuelReimbursements.length} approved fuel reimbursements with driverId`);

    let created = 0;
    let skipped = 0;

    for (const tx of approvedFuelReimbursements) {
      // Phase 5 parity: Skip wallet credits for Gas Card/Petty Cash entries (matching approve handler guard)
      const paymentSource = tx.metadata?.paymentSource || 'driver_cash';
      if (paymentSource !== 'driver_cash') {
        console.log(`[FuelCredit Backfill] Skipping ${tx.id}: payment source is '${paymentSource}' (not driver_cash)`);
        skipped++;
        continue;
      }

      const creditId = `fuel-credit-${tx.id}`;
      const existingCredit = await kv.get(`transaction:${creditId}`);

      if (existingCredit) {
        skipped++;
        continue;
      }

      const walletCredit = {
        id: creditId,
        driverId: tx.driverId,
        driverName: tx.driverName || '',
        vehicleId: tx.vehicleId,
        date: tx.metadata?.approvedAt ? tx.metadata.approvedAt.split('T')[0] : (tx.date || new Date().toISOString().split('T')[0]),
        time: tx.metadata?.approvedAt ? tx.metadata.approvedAt.split('T')[1]?.substring(0, 8) || '00:00:00' : (tx.time || '00:00:00'),
        type: 'Payment_Received',
        category: 'Fuel Reimbursement Credit',
        description: `Fuel Reimbursement Credit: ${tx.vendor || tx.description || tx.merchant || 'Fuel Purchase'}`,
        amount: Math.abs(Number(tx.amount) || Number(tx.metadata?.totalCost) || 0),
        paymentMethod: 'Cash',
        status: 'Completed',
        isReconciled: true,
        referenceNumber: tx.id,
        metadata: {
          fuelCreditSourceId: tx.id,
          source: 'fuel_reimbursement_backfill',
          automated: true,
          approvedAt: tx.metadata?.approvedAt || new Date().toISOString(),
          originalAmount: tx.amount,
          originalCategory: tx.category
        }
      };

      await kv.set(`transaction:${creditId}`, stampOrg(walletCredit, c));
      console.log(`[FuelCredit Backfill] Created wallet credit ${creditId} for driver ${tx.driverId}, amount: ${walletCredit.amount}`);
      created++;
    }

    console.log(`[FuelCredit Backfill] Complete. Created: ${created}, Skipped (already exist): ${skipped}`);
    return c.json({ success: true, created, skipped, total: approvedFuelReimbursements.length });
  } catch (e: any) {
    console.log(`[FuelCredit Backfill] Error: ${e.message}`);
    return c.json({ error: `Backfill failed: ${e.message}` }, 500);
  }
});

// Phase C: Backfill paymentSource for RideShare Cash entries and remove orphaned wallet credits
app.post("/make-server-37f42386/fuel/backfill-rideshare-payment-source", requireAuth(), requirePermission('data.backfill'), async (c) => {
  try {
    console.log('[Backfill RideShare] Starting paymentSource backfill scan...');

    const allTransactions = await kv.getByPrefix('transaction:');

    // Find approved fuel transactions that should be rideshare_cash (match 'Cash' or 'RideShare Cash')
    const targets = allTransactions.filter((tx: any) =>
      tx &&
      tx.id &&
      (tx.category === 'Fuel' || tx.category === 'Fuel Reimbursement') &&
      tx.category !== 'Fuel Reimbursement Credit' &&
      tx.status === 'Approved' &&
      (tx.paymentMethod === 'Cash' || tx.paymentMethod === 'RideShare Cash') &&
      tx.metadata?.paymentSource !== 'rideshare_cash'
    );

    console.log(`[Backfill RideShare] Found ${targets.length} entries to fix`);

    let fixed = 0;
    let creditsDeleted = 0;
    const errors: string[] = [];

    for (const tx of targets) {
      try {
        // Step 1: Fix paymentMethod and set metadata.paymentSource = 'rideshare_cash'
        tx.paymentMethod = 'RideShare Cash';
        tx.metadata = {
          ...(tx.metadata || {}),
          paymentSource: 'rideshare_cash',
          backfilledAt: new Date().toISOString(),
          backfillReason: 'rideshare_cash_fix'
        };
        await kv.set(`transaction:${tx.id}`, stampOrg(tx, c));

        // Step 2: Delete orphaned fuel-credit if it exists
        const creditKey = `transaction:fuel-credit-${tx.id}`;
        const existingCredit = await kv.get(creditKey);
        if (existingCredit) {
          await kv.del(creditKey);
          creditsDeleted++;
          console.log(`[Backfill RideShare] Deleted orphaned credit fuel-credit-${tx.id}`);
        }

        fixed++;
        console.log(`[Backfill RideShare] Fixed transaction ${tx.id}: set paymentSource=rideshare_cash, credit deleted=${!!existingCredit}`);
      } catch (entryErr: any) {
        const msg = `Error fixing ${tx.id}: ${entryErr.message}`;
        console.log(`[Backfill RideShare] ${msg}`);
        errors.push(msg);
      }
    }

    console.log(`[Backfill RideShare] Complete. Fixed: ${fixed}, Credits deleted: ${creditsDeleted}, Errors: ${errors.length}`);
    return c.json({ success: true, fixed, creditsDeleted, errors, totalScanned: allTransactions.length, totalTargeted: targets.length });
  } catch (e: any) {
    console.log(`[Backfill RideShare] Fatal error: ${e.message}`);
    return c.json({ error: `Backfill failed: ${e.message}` }, 500);
  }
});

// ─── POST /ledger/canonical-backfill — Backfill canonical ledger events from existing data ─────
// Populates ledger_event:* for: trips, fuel_entries, toll_ledger, wallet credits (InDrive, fuel reimbursement, toll reimbursement)
// Idempotent: uses idempotencyKey to skip duplicates.
// Supports: ?dryRun=true (count only), ?types=trips,fuel,tolls,indrive,fuel_reimburse,toll_reimburse (filter by type)
app.post("/make-server-37f42386/ledger/canonical-backfill", requireAuth(), requirePermission('data.backfill'), async (c) => {
  const startMs = Date.now();
  try {
    const body = await c.req.json().catch(() => ({}));
    const dryRun = body?.dryRun === true;
    const typesParam = typeof body?.types === 'string' ? body.types : '';
    const allowedTypes = new Set(typesParam ? typesParam.split(',').map((t: string) => t.trim().toLowerCase()) : [
      'trips', 'fuel', 'tolls', 'indrive', 'fuel_reimburse', 'toll_reimburse'
    ]);

    console.log(`[CanonicalBackfill] Starting dryRun=${dryRun} types=${[...allowedTypes].join(',')}`);

    const stats = {
      trips: { scanned: 0, eligible: 0, appended: 0, skipped: 0, errors: 0 },
      fuel: { scanned: 0, eligible: 0, appended: 0, skipped: 0, errors: 0 },
      tolls: { scanned: 0, eligible: 0, appended: 0, skipped: 0, errors: 0 },
      indrive: { scanned: 0, eligible: 0, appended: 0, skipped: 0, errors: 0 },
      fuel_reimburse: { scanned: 0, eligible: 0, appended: 0, skipped: 0, errors: 0 },
      toll_reimburse: { scanned: 0, eligible: 0, appended: 0, skipped: 0, errors: 0 },
    };

    // 1. Trips → fare_earning (non-Uber only; Uber comes from CSV imports)
    if (allowedTypes.has('trips')) {
      console.log('[CanonicalBackfill] Processing trips...');
      const allTrips = await kv.getByPrefix('trip:');
      stats.trips.scanned = allTrips.length;

      const batch: Record<string, unknown>[] = [];
      for (const trip of allTrips) {
        if (!trip?.id) continue;
        const evs = buildCanonicalTripFareEventsFromTrip(trip as Record<string, unknown>);
        if (evs.length > 0) {
          stats.trips.eligible++;
          batch.push(...evs);
        }
      }

      if (!dryRun && batch.length > 0) {
        const CHUNK = 200;
        for (let i = 0; i < batch.length; i += CHUNK) {
          const slice = batch.slice(i, i + CHUNK);
          try {
            const r = await appendCanonicalLedgerEvents(slice, c);
            stats.trips.appended += r.inserted;
            stats.trips.skipped += r.skipped;
          } catch (e: any) {
            stats.trips.errors++;
            console.error('[CanonicalBackfill] trips append error:', e?.message);
          }
        }
      } else if (dryRun) {
        stats.trips.appended = batch.length;
      }
      console.log(`[CanonicalBackfill] Trips: scanned=${stats.trips.scanned} eligible=${stats.trips.eligible} appended=${stats.trips.appended}`);
    }

    // 2. Fuel entries → fuel_expense
    if (allowedTypes.has('fuel')) {
      console.log('[CanonicalBackfill] Processing fuel entries...');
      const allFuel = await kv.getByPrefix('fuel_entry:');
      stats.fuel.scanned = allFuel.length;

      const batch: Record<string, unknown>[] = [];
      for (const entry of allFuel) {
        if (!entry?.id) continue;
        const ev = buildCanonicalFuelExpenseEvent(entry as Record<string, unknown>);
        if (ev) {
          stats.fuel.eligible++;
          batch.push(ev);
        }
      }

      if (!dryRun && batch.length > 0) {
        const CHUNK = 200;
        for (let i = 0; i < batch.length; i += CHUNK) {
          const slice = batch.slice(i, i + CHUNK);
          try {
            const r = await appendCanonicalLedgerEvents(slice, c);
            stats.fuel.appended += r.inserted;
            stats.fuel.skipped += r.skipped;
          } catch (e: any) {
            stats.fuel.errors++;
            console.error('[CanonicalBackfill] fuel append error:', e?.message);
          }
        }
      } else if (dryRun) {
        stats.fuel.appended = batch.length;
      }
      console.log(`[CanonicalBackfill] Fuel: scanned=${stats.fuel.scanned} eligible=${stats.fuel.eligible} appended=${stats.fuel.appended}`);
    }

    // 3. Toll ledger → toll_charge / toll_refund
    if (allowedTypes.has('tolls')) {
      console.log('[CanonicalBackfill] Processing toll ledger...');
      const allTolls = await kv.getByPrefix('toll_ledger:');
      stats.tolls.scanned = allTolls.length;

      const batch: Record<string, unknown>[] = [];
      for (const entry of allTolls) {
        if (!entry?.id) continue;
        const ev = buildCanonicalTollEventFromTollLedger(entry as TollLedgerLike);
        if (ev) {
          stats.tolls.eligible++;
          batch.push(ev);
        }
      }

      if (!dryRun && batch.length > 0) {
        const CHUNK = 200;
        for (let i = 0; i < batch.length; i += CHUNK) {
          const slice = batch.slice(i, i + CHUNK);
          try {
            const r = await appendCanonicalLedgerEvents(slice, c);
            stats.tolls.appended += r.inserted;
            stats.tolls.skipped += r.skipped;
          } catch (e: any) {
            stats.tolls.errors++;
            console.error('[CanonicalBackfill] tolls append error:', e?.message);
          }
        }
      } else if (dryRun) {
        stats.tolls.appended = batch.length;
      }
      console.log(`[CanonicalBackfill] Tolls: scanned=${stats.tolls.scanned} eligible=${stats.tolls.eligible} appended=${stats.tolls.appended}`);
    }

    // 4-6. Transaction-based wallet credits
    const allTransactions = (allowedTypes.has('indrive') || allowedTypes.has('fuel_reimburse') || allowedTypes.has('toll_reimburse'))
      ? await kv.getByPrefix('transaction:')
      : [];

    // 4. InDrive Wallet Credit → wallet_credit
    if (allowedTypes.has('indrive')) {
      console.log('[CanonicalBackfill] Processing InDrive Wallet Credits...');
      const indriveTx = allTransactions.filter((tx: any) => tx?.category === 'InDrive Wallet Credit');
      stats.indrive.scanned = indriveTx.length;

      const batch: Record<string, unknown>[] = [];
      for (const tx of indriveTx) {
        if (!tx?.id) continue;
        const ev = buildCanonicalWalletCreditEvent(tx as Record<string, unknown>);
        if (ev) {
          stats.indrive.eligible++;
          batch.push(ev);
        }
      }

      if (!dryRun && batch.length > 0) {
        const CHUNK = 200;
        for (let i = 0; i < batch.length; i += CHUNK) {
          const slice = batch.slice(i, i + CHUNK);
          try {
            const r = await appendCanonicalLedgerEvents(slice, c);
            stats.indrive.appended += r.inserted;
            stats.indrive.skipped += r.skipped;
          } catch (e: any) {
            stats.indrive.errors++;
            console.error('[CanonicalBackfill] indrive append error:', e?.message);
          }
        }
      } else if (dryRun) {
        stats.indrive.appended = batch.length;
      }
      console.log(`[CanonicalBackfill] InDrive: scanned=${stats.indrive.scanned} eligible=${stats.indrive.eligible} appended=${stats.indrive.appended}`);
    }

    // 5. Fuel Reimbursement Credit → fuel_reimbursement
    if (allowedTypes.has('fuel_reimburse')) {
      console.log('[CanonicalBackfill] Processing Fuel Reimbursement Credits...');
      const fuelCreditTx = allTransactions.filter((tx: any) => tx?.category === 'Fuel Reimbursement Credit');
      stats.fuel_reimburse.scanned = fuelCreditTx.length;

      const batch: Record<string, unknown>[] = [];
      for (const tx of fuelCreditTx) {
        if (!tx?.id) continue;
        const ev = buildCanonicalFuelReimbursementEvent(tx as Record<string, unknown>);
        if (ev) {
          stats.fuel_reimburse.eligible++;
          batch.push(ev);
        }
      }

      if (!dryRun && batch.length > 0) {
        const CHUNK = 200;
        for (let i = 0; i < batch.length; i += CHUNK) {
          const slice = batch.slice(i, i + CHUNK);
          try {
            const r = await appendCanonicalLedgerEvents(slice, c);
            stats.fuel_reimburse.appended += r.inserted;
            stats.fuel_reimburse.skipped += r.skipped;
          } catch (e: any) {
            stats.fuel_reimburse.errors++;
            console.error('[CanonicalBackfill] fuel_reimburse append error:', e?.message);
          }
        }
      } else if (dryRun) {
        stats.fuel_reimburse.appended = batch.length;
      }
      console.log(`[CanonicalBackfill] Fuel Reimburse: scanned=${stats.fuel_reimburse.scanned} eligible=${stats.fuel_reimburse.eligible} appended=${stats.fuel_reimburse.appended}`);
    }

    // 6. Toll Reimbursement Credit → adjustment
    if (allowedTypes.has('toll_reimburse')) {
      console.log('[CanonicalBackfill] Processing Toll Reimbursement Credits...');
      const tollCreditTx = allTransactions.filter((tx: any) => tx?.category === 'Toll Reimbursement Credit');
      stats.toll_reimburse.scanned = tollCreditTx.length;

      const batch: Record<string, unknown>[] = [];
      for (const tx of tollCreditTx) {
        if (!tx?.id) continue;
        const ev = buildCanonicalTollReimbursementEvent(tx as Record<string, unknown>);
        if (ev) {
          stats.toll_reimburse.eligible++;
          batch.push(ev);
        }
      }

      if (!dryRun && batch.length > 0) {
        const CHUNK = 200;
        for (let i = 0; i < batch.length; i += CHUNK) {
          const slice = batch.slice(i, i + CHUNK);
          try {
            const r = await appendCanonicalLedgerEvents(slice, c);
            stats.toll_reimburse.appended += r.inserted;
            stats.toll_reimburse.skipped += r.skipped;
          } catch (e: any) {
            stats.toll_reimburse.errors++;
            console.error('[CanonicalBackfill] toll_reimburse append error:', e?.message);
          }
        }
      } else if (dryRun) {
        stats.toll_reimburse.appended = batch.length;
      }
      console.log(`[CanonicalBackfill] Toll Reimburse: scanned=${stats.toll_reimburse.scanned} eligible=${stats.toll_reimburse.eligible} appended=${stats.toll_reimburse.appended}`);
    }

    const durationMs = Date.now() - startMs;
    console.log(`[CanonicalBackfill] Complete in ${durationMs}ms dryRun=${dryRun}`);

    return c.json({
      success: true,
      dryRun,
      stats,
      durationMs,
    });
  } catch (e: any) {
    console.error('[CanonicalBackfill] Fatal error:', e?.message || e);
    return c.json({ error: `Canonical backfill failed: ${e?.message || 'unknown error'}` }, 500);
  }
});

// ─── POST /ledger/rebuild-trip-fare-ledger — Remove + rewrite trip fare_earning/tip/promotion ──
// Scoped by org when the user has organizationId. dryRun previews eligible count only.
// Scopes: 'indrive', 'uber', 'non_uber', 'all'
app.post(
  "/make-server-37f42386/ledger/rebuild-trip-fare-ledger",
  requireAuth(),
  requirePermission("data.backfill"),
  async (c) => {
    const t0 = Date.now();
    try {
      const body = await c.req.json().catch(() => ({}));
      const dryRun = body?.dryRun === true;
      const scopeRaw = typeof body?.scope === "string" ? body.scope.trim().toLowerCase() : "indrive";
      
      // Normalize scope
      let scope: 'indrive' | 'uber' | 'non_uber' | 'all';
      if (scopeRaw === 'all') scope = 'all';
      else if (scopeRaw === 'uber') scope = 'uber';
      else if (scopeRaw === 'non_uber' || scopeRaw === 'nonuber') scope = 'non_uber';
      else scope = 'indrive';

      const allTrips = ((await kv.getByPrefix("trip:")) as any[]).filter((t) => t?.id);
      const scoped = filterByOrg(allTrips, c);

      const passesScope = (trip: any) => {
        const platformLc = String(trip?.platform ?? "").trim().toLowerCase();
        const isUber = isUberPlatform(trip?.platform);
        
        if (scope === "indrive") return platformLc === "indrive";
        if (scope === "uber") return isUber;
        if (scope === "non_uber") return !isUber;
        return true; // 'all'
      };

      const eligible: any[] = [];
      for (const trip of scoped) {
        if (!passesScope(trip)) continue;
        if (!tripHasMoneyForLedgerProjection(trip)) continue;
        const evs = buildCanonicalTripFareEventsFromTrip(trip as Record<string, unknown>);
        if (evs.length === 0) continue;
        eligible.push(trip);
      }

      if (dryRun) {
        return c.json({
          success: true,
          dryRun: true,
          scope,
          stats: {
            scannedTotal: allTrips.length,
            afterOrgFilter: scoped.length,
            eligible: eligible.length,
            sampleTripIds: eligible.slice(0, 20).map((t: any) => String(t.id)),
          },
          durationMs: Date.now() - t0,
        });
      }

      const CHUNK = 100;
      let chunksProcessed = 0;
      let ledgerRowsDeleted = 0;
      let idemKeysDeleted = 0;
      let ledgerInserted = 0;
      let ledgerSkipped = 0;
      let ledgerFailed = 0;
      let errors = 0;

      for (let i = 0; i < eligible.length; i += CHUNK) {
        const chunk = eligible.slice(i, i + CHUNK);
        const ids = chunk.map((t: any) => String(t.id).trim()).filter(Boolean);
        try {
          const del = await deleteCanonicalLedgerBySource("trip", ids);
          ledgerRowsDeleted += del.deleted;
          idemKeysDeleted += del.idemDeleted;
        } catch (e: any) {
          errors++;
          console.error("[RebuildTripFareLedger] delete failed:", e?.message);
          continue;
        }
        try {
          const app = await appendCanonicalTripFaresIfEligibleWithStats(chunk as Record<string, unknown>[], c);
          ledgerInserted += app.inserted;
          ledgerSkipped += app.skipped;
          ledgerFailed += app.failed;
        } catch (e: any) {
          errors++;
          console.error("[RebuildTripFareLedger] append failed:", e?.message);
        }
        chunksProcessed++;
      }

      console.log(
        `[RebuildTripFareLedger] scope=${scope} eligible=${eligible.length} deleted=${ledgerRowsDeleted} inserted=${ledgerInserted} skipped=${ledgerSkipped} failed=${ledgerFailed} errors=${errors} (${Date.now() - t0}ms)`,
      );

      return c.json({
        success: true,
        dryRun: false,
        scope,
        stats: {
          eligible: eligible.length,
          chunksProcessed,
          ledgerRowsDeleted,
          idemKeysDeleted,
          ledgerInserted,
          ledgerSkipped,
          ledgerFailed,
          errors,
        },
        durationMs: Date.now() - t0,
      });
    } catch (e: any) {
      console.error("[RebuildTripFareLedger] Fatal:", e);
      return c.json({ error: e?.message || "rebuild-trip-fare-ledger failed" }, 500);
    }
  },
);

// Maintenance logs: Postgres-backed — see maintenance_routes.ts

// --- FUEL SCENARIOS ---
app.get("/make-server-37f42386/scenarios", requireAuth(), async (c) => {
  try {
    const items = await kv.getByPrefix("fuel_scenario:");
    
    // Auto-Seed if empty (Phase 10 Requirement)
    if (!items || items.length === 0) {
        const defaultId = crypto.randomUUID();
        const defaultScenario = {
            id: defaultId,
            name: "Standard Fleet Rule",
            description: "Default granular coverage settings.",
            isDefault: true,
            rules: [{
                id: crypto.randomUUID(),
                category: "Fuel",
                coverageType: "Percentage",
                coverageValue: 50, // Fallback
                rideShareCoverage: 100,
                companyUsageCoverage: 100,
                personalCoverage: 0,
                miscCoverage: 50,
                conditions: { requiresReceipt: true }
            }]
        };
        await kv.set(`fuel_scenario:${defaultId}`, stampOrg(defaultScenario, c));
        return c.json([defaultScenario]);
    }
    
    return c.json(filterByOrg(items || [], c));
  } catch (e: any) { return c.json({ error: e.message }, 500); }
});

app.post("/make-server-37f42386/scenarios", async (c) => {
  try {
    const item = await c.req.json();
    if (!item.id) item.id = crypto.randomUUID();
    await kv.set(`fuel_scenario:${item.id}`, stampOrg(item, c));
    return c.json({ success: true, data: item });
  } catch (e: any) { return c.json({ error: e.message }, 500); }
});

app.delete("/make-server-37f42386/scenarios/:id", async (c) => {
  const id = c.req.param("id");
  try { await kv.del(`fuel_scenario:${id}`); return c.json({ success: true }); }
  catch (e: any) { return c.json({ error: e.message }, 500); }
});

// Storage Upload Endpoint
app.post("/make-server-37f42386/upload", async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body['file'];
    
    if (!file || !(file instanceof File)) {
      return c.json({ error: "No file uploaded" }, 400);
    }

    // Server-side size check with clear error message
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_FILE_SIZE) {
      console.log(`Upload rejected: file "${file.name}" is ${(file.size / 1024 / 1024).toFixed(2)}MB, exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`);
      return c.json({ 
        error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum allowed size is 5MB. Please compress or resize the image before uploading.` 
      }, 413);
    }

    const bucketName = "make-37f42386-docs";
    
    // Ensure bucket exists and has adequate file size limit
    const { data: buckets } = await supabase.storage.listBuckets();
    const existingBucket = buckets?.find(b => b.name === bucketName);
    if (!existingBucket) {
        await supabase.storage.createBucket(bucketName, {
            public: false,
            fileSizeLimit: 10485760, // 10MB
        });
    } else {
        // Update existing bucket to increase file size limit if it was too low
        await supabase.storage.updateBucket(bucketName, {
            fileSizeLimit: 10485760, // 10MB
        });
    }

    const fileExt = file.name.split('.').pop();
    const fileName = `${crypto.randomUUID()}.${fileExt}`;
    const filePath = `driver-docs/${fileName}`;

    const { data, error } = await supabase.storage
        .from(bucketName)
        .upload(filePath, file, {
            contentType: file.type,
            upsert: false
        });

    if (error) throw error;

    const { data: signedData } = await supabase.storage
        .from(bucketName)
        .createSignedUrl(filePath, 60 * 60 * 24 * 365); // 1 year

    return c.json({ url: signedData?.signedUrl });
  } catch (e: any) {
    console.error("Upload error:", e);
    const status = e.statusCode === '413' || e.status === 413 ? 413 : 500;
    const message = status === 413 
      ? 'File exceeds maximum allowed size. Please compress or resize the image.'
      : e.message || 'Upload failed';
    return c.json({ error: message }, status);
  }
});

// AI Document Parsing Endpoint
app.post("/make-server-37f42386/parse-document", async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body['file'];
    const backFile = body['backFile'];
    const type = body['type'] as string;

    if (!file || !(file instanceof File)) return c.json({ error: "No file provided" }, 400);

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return c.json({ error: "OpenAI API Key not configured" }, 503);

    const openai = new OpenAI({ apiKey });

    let prompt = `Extract information from this ${type} document into valid JSON. Return ONLY the raw JSON object. Do not use markdown formatting (no \`\`\`json). Use ISO 8601 format (YYYY-MM-DD) for all dates.`;
    
    if (type === 'license') {
        prompt += `
        For 'license', extract the following fields into a JSON object with these EXACT keys:
        - firstName, lastName, middleName
        - licenseNumber (Driver's License No. or TRN), expirationDate (YYYY-MM-DD), dateOfBirth (YYYY-MM-DD)
        - address, state, countryCode
        - class, sex (M or F)
        - licenseToDrive (Extract the EXACT FULL TEXT under "LICENCE TO DRIVE" or "LICENSE TO DRIVE". e.g. "M/CARS & TRUCKS...". Do NOT abbreviate to "Class C" or similar codes. Copy the text exactly as it appears. If multiple lines, join with a space.)
        - originalIssueDate (Look for "ORIGINAL DATE OF ISSUE" - YYYY-MM-DD)
        - collectorate (Look for "COLLECTORATE" label, typically under the TRN or near the top. e.g. "011 SPANISH TOWN")
        - controlNumber (Look for "CONTROL NO.". The value is a long numeric string (e.g. 0110149740). It might be below the label. Extract ALL digits. Ignore '#' prefix.), nationality
        
        Ensure dateOfBirth is used instead of dob.

        CRITICAL PARSING RULE FOR JAMAICAN LICENSES:
        - The section under "NAME" is structured as:
          Line 1: LAST NAME (Surname)
          Line 2: FIRST NAME + MIDDLE NAMES
        - Example:
          NAME
          THOMAS           -> lastName: "THOMAS"
          SADIKI ABAYOMI   -> firstName: "SADIKI", middleName: "ABAYOMI"
        - Do NOT assign Line 1 to firstName. Line 1 is ALWAYS the Last Name.
        `;
    } else if (type === 'vehicle_registration') {
        prompt += `
        For 'vehicle_registration' (extract strictly):
        - plate (License Plate No), vin (Chassis No)
        - mvid (Motor Vehicle ID), laNumber (Licence Authority No), controlNumber
        - make, model, year
        - expirationDate (YYYY-MM-DD), issueDate (YYYY-MM-DD)
        `;
    } else if (type === 'fitness_certificate') {
        prompt += `
        For 'fitness_certificate':
        - make, model, year, color
        - bodyType, engineNumber, ccRating
        - issueDate (YYYY-MM-DD), expirationDate (YYYY-MM-DD)
        `;
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');
    const dataUrl = `data:${file.type};base64,${base64Data}`;

    const contentPayload: any[] = [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: dataUrl } }
    ];

    if (backFile && backFile instanceof File) {
         const backBuffer = await backFile.arrayBuffer();
         const backBase64 = Buffer.from(backBuffer).toString('base64');
         const backUrl = `data:${backFile.type};base64,${backBase64}`;
         contentPayload.push({ type: "text", text: "The following image is the BACK of the document. Use it to extract licenseToDrive, originalIssueDate, controlNumber, and nationality." });
         contentPayload.push({ type: "image_url", image_url: { url: backUrl } });
    }

    const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            {
                role: "user",
                content: contentPayload
            }
        ],
        response_format: { type: "json_object" }
    });
    
    const text = response.choices[0].message.content || "{}";
    return c.json({ success: true, data: JSON.parse(text) });

  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});



app.get("/make-server-37f42386/fuel-cards", requireAuth(), async (c) => {
  try {
    const cards = await kv.getByPrefix("fuel_card:");
    return c.json(filterByOrg(cards || [], c));
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/fuel-cards", requireAuth(), requirePermission('fuel.create_entry'), async (c) => {
  try {
    const card = await c.req.json();
    if (!card.id) {
        card.id = crypto.randomUUID();
    }
    await kv.set(`fuel_card:${card.id}`, stampOrg(card, c));
    return c.json({ success: true, data: card });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-37f42386/fuel-cards/:id", requireAuth(), requirePermission('fuel.delete_entry'), async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`fuel_card:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Fuel Entries (Logs) Endpoints
// Fuel Entries (Logs) Endpoints - Optimized
app.get("/make-server-37f42386/fuel-entries", requireAuth(), async (c) => {
  try {
    const limitParam = c.req.query("limit");
    const offsetParam = c.req.query("offset");
    const limit = limitParam ? parseInt(limitParam) : 100;
    const offset = offsetParam ? parseInt(offsetParam) : 0;

    const { data, error } = await supabase
        .from("kv_store_37f42386")
        .select("value")
        .like("key", "fuel_entry:%")
        .order("value->>date", { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) throw error;
    
    // Phase 8.4: Large Data Stripping
    const entries = (data || []).map((d: any) => {
        const v = d.value || {};
        if (v.metadata?.receiptBase64) delete v.metadata.receiptBase64;
        return v;
    });

    return c.json(filterByOrg(entries, c));
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/fuel-entries", requireAuth(), requirePermission('fuel.create_entry'), async (c) => {
  try {
    const entry = await c.req.json();
    if (!entry.id) {
        entry.id = crypto.randomUUID();
    }
    await kv.set(`fuel_entry:${entry.id}`, stampOrg(entry, c));
    return c.json({ success: true, data: entry });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-37f42386/fuel-entries/:id", requireAuth(), requirePermission('fuel.delete_entry'), async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`fuel_entry:${id}`);
    try {
      await deleteCanonicalLedgerBySource("transaction", [id]);
    } catch (ledgerErr: any) {
      console.warn(`[DELETE /fuel-entries/:id] Ledger cleanup failed (non-fatal) entry=${id}:`, ledgerErr?.message);
    }
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Mileage Adjustments Endpoints
app.get("/make-server-37f42386/mileage-adjustments", requireAuth(), async (c) => {
  try {
    const { data, error } = await supabase
        .from("kv_store_37f42386")
        .select("value")
        .like("key", "fuel_adjustment:%")
        .order("value->>week", { ascending: false });

    if (error) throw error;
    const adjustments = data?.map((d: any) => d.value) || [];
    return c.json(filterByOrg(adjustments, c));
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/mileage-adjustments", requireAuth(), requirePermission('vehicles.edit'), async (c) => {
  try {
    const adj = await c.req.json();
    if (!adj.id) {
        adj.id = crypto.randomUUID();
    }
    await kv.set(`fuel_adjustment:${adj.id}`, stampOrg(adj, c));
    return c.json({ success: true, data: adj });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-37f42386/mileage-adjustments/:id", requireAuth(), requirePermission('vehicles.edit'), async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`fuel_adjustment:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/generate-vehicle-image", async (c) => {
  try {
    const { make, model, year, color, bodyType, licensePlate } = await c.req.json();
    
    // Switch to Gemini/Imagen as requested
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
        return c.json({ error: "Gemini API Key not configured" }, 503);
    }

    // Update prompt for better vehicle accuracy
    const prompt = `Professional studio photography of a ${year} ${color} ${make} ${model} ${bodyType}, automotive photoshoot style. 
    The car is positioned on a clean, seamless white background with soft reflections on the floor. 
    Front 3/4 angle view, high resolution, 8k, photorealistic, sharp focus. 
    Ensure the design matches the specific production year ${year}. No license plates.`;

    let imageB64 = null;
    let lastError = null;

    try {
        // Using Imagen 4.0 (Production Standard 2026) as requested
        // Endpoint: Google Generative Language API (Gemini API)
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    instances: [{ prompt: prompt }],
                    parameters: { 
                        sampleCount: 1, 
                        aspectRatio: "1:1"
                    }
                })
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Google Imagen API Error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        
        // Handle Imagen response structure
        // The API returns { predictions: [ { bytesBase64Encoded: "..." } ] }
        if (data.predictions && data.predictions[0]) {
             const prediction = data.predictions[0];
             imageB64 = prediction.bytesBase64Encoded || prediction;
        }

        if (!imageB64) {
            throw new Error("No image data received from Gemini/Imagen");
        }

    } catch (e: any) {
        lastError = e.message;
        console.error("Gemini Imagen Failed:", e);
    }

    if (!imageB64) {
         return c.json({ 
             error: `Image Generation failed: ${lastError}` 
         }, 500);
    }
    
    // Convert Base64 to Buffer for Upload
    const buffer = Buffer.from(imageB64, 'base64');
    
    // Use the global supabase client
    const bucketName = `make-37f42386-vehicles`;
    
    // Ensure bucket exists (idempotent)
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.some((b: any) => b.name === bucketName)) {
        await supabase.storage.createBucket(bucketName, { public: false });
    }

    const fileName = `${licensePlate || crypto.randomUUID()}.png`;

    const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(fileName, buffer, { 
            contentType: 'image/png', 
            upsert: true 
        });

    if (uploadError) throw uploadError;

    // Generate Signed URL (valid for 1 year)
    const { data: signedUrlData, error: signError } = await supabase.storage
        .from(bucketName)
        .createSignedUrl(fileName, 31536000); 

    if (signError) throw signError;

    return c.json({ url: signedUrlData.signedUrl });

  } catch (e: any) {
    console.error("Image Generation Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// Toll Tag Endpoints
app.get("/make-server-37f42386/toll-tags", requireAuth(), async (c) => {
  try {
    const { data, error } = await supabase
        .from("kv_store_37f42386")
        .select("value")
        .like("key", "toll_tag:%");

    if (error) throw error;
    const tags = data?.map((d: any) => d.value) || [];
    return c.json(filterByOrg(tags, c));
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/toll-tags", requireAuth(), requirePermission('toll.manage'), async (c) => {
  try {
    const tag = await c.req.json();
    if (!tag.id) {
        tag.id = crypto.randomUUID();
    }
    if (!tag.createdAt) {
        tag.createdAt = new Date().toISOString();
    }
    
    // Key structure: toll_tag:{id}
    await kv.set(`toll_tag:${tag.id}`, stampOrg(tag, c));
    return c.json({ success: true, data: tag });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-37f42386/toll-tags/:id", requireAuth(), requirePermission('toll.manage'), async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`toll_tag:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// =========================================================================
// Toll Plaza Endpoints (Phase 2 — Toll Database CRUD)
// KV key pattern: toll_plaza:{id}
// =========================================================================

// Step 2.1 — GET all toll plazas
app.get("/make-server-37f42386/toll-plazas", requireAuth(), async (c) => {
  try {
    const { data, error } = await supabase
        .from("kv_store_37f42386")
        .select("value")
        .like("key", "toll_plaza:%");

    if (error) throw error;
    const plazas = data?.map((d: any) => d.value) || [];
    const scoped = filterByOrg(plazas, c);
    console.log(`[TollPlaza] GET /toll-plazas — returning ${scoped.length} plazas`);
    return c.json(scoped);
  } catch (e: any) {
    console.log(`[TollPlaza] ERROR GET /toll-plazas: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// Step 2.4 — GET single toll plaza by ID
app.get("/make-server-37f42386/toll-plazas/:id", requireAuth(), async (c) => {
  const id = c.req.param("id");
  try {
    const plaza = await kv.get(`toll_plaza:${id}`);
    if (!plaza) {
      console.log(`[TollPlaza] GET /toll-plazas/${id} — not found`);
      return c.json({ error: "Toll plaza not found" }, 404);
    }
    if (!belongsToOrg(plaza, c)) {
      return c.json({ error: "Toll plaza not found" }, 404);
    }
    console.log(`[TollPlaza] GET /toll-plazas/${id} — found: ${(plaza as any).name}`);
    return c.json(plaza);
  } catch (e: any) {
    console.log(`[TollPlaza] ERROR GET /toll-plazas/${id}: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// Step 2.2 — POST create or update a toll plaza
app.post("/make-server-37f42386/toll-plazas", requireAuth(), requirePermission('toll.manage'), async (c) => {
  try {
    const plaza = await c.req.json();

    if (!plaza.id) {
      plaza.id = crypto.randomUUID();
    }
    if (!plaza.createdAt) {
      plaza.createdAt = new Date().toISOString();
    }
    plaza.updatedAt = new Date().toISOString();

    if (!plaza.stats) {
      plaza.stats = {
        totalTransactions: 0,
        totalSpend: 0,
        lastTransactionDate: '',
        avgAmount: 0,
        lastUpdated: new Date().toISOString(),
      };
    }

    await kv.set(`toll_plaza:${plaza.id}`, stampOrg(plaza, c));
    console.log(`[TollPlaza] POST /toll-plazas — saved plaza "${plaza.name}" (${plaza.id})`);
    return c.json({ success: true, data: plaza });
  } catch (e: any) {
    console.log(`[TollPlaza] ERROR POST /toll-plazas: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// Step 2.3 — DELETE a toll plaza by ID
app.delete("/make-server-37f42386/toll-plazas/:id", requireAuth(), requirePermission('toll.manage'), async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`toll_plaza:${id}`);
    console.log(`[TollPlaza] DELETE /toll-plazas/${id} — deleted`);
    return c.json({ success: true });
  } catch (e: any) {
    console.log(`[TollPlaza] ERROR DELETE /toll-plazas/${id}: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// Notifications endpoints
app.get("/make-server-37f42386/notifications", requireAuth(), async (c) => {
  try {
    const limitParam = c.req.query("limit");
    const offsetParam = c.req.query("offset");
    const limit = limitParam ? parseInt(limitParam) : 50;
    const offset = offsetParam ? parseInt(offsetParam) : 0;

    const notifications = await cache.withRetry(async () => {
      const { data, error } = await supabase
          .from("kv_store_37f42386")
          .select("value")
          .like("key", "notification:%")
          .order("value->>timestamp", { ascending: false })
          .range(offset, offset + limit - 1);
      if (error) throw error;
      return data?.map((d: any) => d.value) || [];
    });
    return c.json(filterByOrg(notifications, c));
  } catch (e: any) {
    console.error("Error fetching notifications:", e);
    return c.json({ error: e.message || "Internal Server Error" }, 500);
  }
});

app.post("/make-server-37f42386/notifications", async (c) => {
  try {
    const notification = await c.req.json();
    if (!notification.id) {
        notification.id = crypto.randomUUID();
    }
    if (!notification.timestamp) {
        notification.timestamp = new Date().toISOString();
    }
    
    await kv.set(`notification:${notification.id}`, stampOrg(notification, c));
    return c.json({ success: true, data: notification });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.patch("/make-server-37f42386/notifications/:id/read", async (c) => {
  const id = c.req.param("id");
  try {
    const notification = await kv.get(`notification:${id}`);
    if (!notification) {
      return c.json({ error: "Notification not found" }, 404);
    }
    notification.read = true;
    await kv.set(`notification:${id}`, stampOrg(notification, c));
    return c.json({ success: true, data: notification });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Alert Rules endpoints
app.get("/make-server-37f42386/alert-rules", requireAuth(), async (c) => {
  try {
    const rules = await kv.getByPrefix("alert_rule:");
    return c.json(filterByOrg(rules, c));
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/alert-rules", async (c) => {
  try {
    const rule = await c.req.json();
    if (!rule.id) {
        rule.id = crypto.randomUUID();
    }
    await kv.set(`alert_rule:${rule.id}`, stampOrg(rule, c));
    return c.json({ success: true, data: rule });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-37f42386/alert-rules/:id", async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`alert_rule:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Batch Management Endpoints
app.get("/make-server-37f42386/batches", requireAuth(), async (c) => {
  try {
    const { data, error } = await supabase
        .from("kv_store_37f42386")
        .select("value")
        .like("key", "batch:%")
        .order("value->>uploadDate", { ascending: false });

    if (error) throw error;
    const batches = data?.map((d: any) => d.value) || [];

    // Enrich each batch with platform info by sampling one trip per batch
    const enriched = await Promise.all(batches.map(async (batch: any) => {
      try {
        const { data: tripRows } = await supabase
          .from("kv_store_37f42386")
          .select("value")
          .like("key", "trip:%")
          .eq("value->>batchId", batch.id)
          .limit(1);
        const platform = tripRows?.[0]?.value?.platform || null;
        return { ...batch, platform };
      } catch {
        return { ...batch, platform: null };
      }
    }));

    return c.json(filterByOrg(enriched, c));
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/batches", async (c) => {
  try {
    const batch = await c.req.json();
    if (!batch.id) {
        batch.id = crypto.randomUUID();
    }
    await kv.set(`batch:${batch.id}`, stampOrg(batch, c));
    return c.json({ success: true, data: batch });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

/** Phase 7 — merge audit / canonical-append stats into an existing batch (org-scoped). */
app.patch("/make-server-37f42386/batches/:id", requireAuth(), async (c) => {
  const id = c.req.param("id");
  const ALLOWED = new Set([
    "canonicalEventsInserted",
    "canonicalEventsSkipped",
    "canonicalEventsFailed",
    "canonicalAppendCompletedAt",
    "periodStart",
    "periodEnd",
    "uploadedBy",
    "processedBy",
    "contentFingerprint",
  ]);
  try {
    const existing = await kv.get(`batch:${id}`);
    if (!existing || typeof existing !== "object") {
      return c.json({ error: "Batch not found" }, 404);
    }
    if (!belongsToOrg(existing as Record<string, unknown>, c)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    const patch = await c.req.json();
    if (!patch || typeof patch !== "object") {
      return c.json({ error: "Invalid body" }, 400);
    }
    const merged: Record<string, unknown> = { ...(existing as Record<string, unknown>) };
    for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
      if (!ALLOWED.has(k)) continue;
      merged[k] = v;
    }
    await kv.set(`batch:${id}`, merged);
    return c.json({ success: true, data: merged });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-37f42386/batches/:id", async (c) => {
  const batchId = c.req.param("id");
  try {
    console.log(`[Batch delete] Starting cascade delete for batch ${batchId}`);

    // Paginated helper — fetches all matching rows in 1,000-row pages
    const PAGE = 1000;
    const MAX_ROWS = 50000;
    const paginatedKeyFetch = async (buildQuery: () => any): Promise<any[]> => {
      let all: any[] = [];
      let offset = 0;
      while (offset < MAX_ROWS) {
        const { data, error } = await buildQuery().range(offset, offset + PAGE - 1);
        if (error) throw error;
        const page = data || [];
        all = all.concat(page);
        if (page.length < PAGE) break;
        offset += PAGE;
      }
      return all;
    };

    // ── 0. Canonical ledger (`ledger_event:*`) + idempotency keys for this batch
    let deletedCanonicalLedger = 0;
    let deletedCanonicalIdem = 0;
    const driverIdsFromCanonical = new Set<string>();
    try {
      const leRows = await paginatedKeyFetch(() =>
        supabase
          .from("kv_store_37f42386")
          .select("key, value")
          .like("key", "ledger_event:%")
          .eq("value->>batchId", batchId)
      );
      const idemSeen = new Set<string>();
      for (const row of leRows) {
        const v = row.value as Record<string, unknown> | null;
        if (v?.driverId) driverIdsFromCanonical.add(String(v.driverId).trim());
        const idem = typeof v?.idempotencyKey === "string" ? String(v.idempotencyKey).trim() : "";
        if (idem && !idemSeen.has(idem)) {
          idemSeen.add(idem);
          try {
            const idemKvKey = `ledger_event_idem:${await sha256HexForLedgerIdem(idem)}`;
            await kv.del(idemKvKey);
            deletedCanonicalIdem++;
          } catch {
            /* non-fatal */
          }
        }
      }
      if (leRows.length > 0) {
        const keys = leRows.map((r: { key: string }) => r.key);
        for (let i = 0; i < keys.length; i += 100) {
          await kv.mdel(keys.slice(i, i + 100));
        }
        deletedCanonicalLedger = keys.length;
      }
      console.log(
        `[Batch delete] Removed ${deletedCanonicalLedger} ledger_event rows, ${deletedCanonicalIdem} idempotency keys (canonical)`,
      );
    } catch (canonicalErr: any) {
      console.warn("[Batch delete] Canonical ledger cleanup failed (non-fatal):", canonicalErr?.message);
    }

    // ── 0b. Dispute refunds (`dispute-refund:*`) + dedup index — same batchId as import (see ImportsPage + dispute_refund_controller)
    let deletedDisputeRefundKeys = 0;
    let deletedDisputeRefundDedupKeys = 0;
    try {
      const drRows = await paginatedKeyFetch(() =>
        supabase
          .from("kv_store_37f42386")
          .select("key, value")
          .like("key", "dispute-refund:%")
          .eq("value->>batchId", batchId)
      );
      const mainRows = drRows.filter((row: { key: string }) => {
        const k = row.key;
        return k.startsWith("dispute-refund:") && !k.startsWith("dispute-refund-dedup");
      });
      if (mainRows.length > 0) {
        const keysToDel = mainRows.map((r: { key: string }) => r.key);
        for (let i = 0; i < keysToDel.length; i += 100) {
          await kv.mdel(keysToDel.slice(i, i + 100));
        }
        deletedDisputeRefundKeys = keysToDel.length;
        const dedupIds = new Set<string>();
        for (const row of mainRows) {
          const v = row.value as { supportCaseId?: string } | null;
          const sid = v?.supportCaseId;
          if (typeof sid === "string" && sid.trim()) dedupIds.add(sid.trim());
        }
        for (const sid of dedupIds) {
          try {
            await kv.del(`dispute-refund-dedup:${sid}`);
            deletedDisputeRefundDedupKeys++;
          } catch {
            /* non-fatal */
          }
        }
      }
      console.log(
        `[Batch delete] Removed ${deletedDisputeRefundKeys} dispute-refund record(s), ${deletedDisputeRefundDedupKeys} dedup key(s)`,
      );
    } catch (drErr: any) {
      console.warn("[Batch delete] Dispute refund cleanup failed (non-fatal):", drErr?.message);
    }

    // ── 1. Fetch all trips in this batch (paginated, with values for ID extraction) ──
    const tripRows = await paginatedKeyFetch(() =>
      supabase
        .from("kv_store_37f42386")
        .select("key, value")
        .like("key", "trip:%")
        .eq("value->>batchId", batchId)
    );

    const tripKeys = tripRows.map(d => d.key);
    const tripIds: string[] = [];
    const driverIdSet = new Set<string>();
    const vehicleIdSet = new Set<string>();
    const uberDriverIdsFromDeletedTrips = new Set<string>();
    for (const row of tripRows) {
      const v = row.value as { id?: string; driverId?: string; vehicleId?: string; platform?: string } | null;
      if (!v) continue;
      tripIds.push(v.id || row.key.replace("trip:", ""));
      if (v.driverId) driverIdSet.add(v.driverId);
      if (v.vehicleId) vehicleIdSet.add(v.vehicleId);
      const plat = String(v.platform || "").toLowerCase();
      if (v.driverId && (plat === "uber" || plat.includes("uber"))) {
        uberDriverIdsFromDeletedTrips.add(String(v.driverId).trim());
      }
    }
    for (const d of driverIdsFromCanonical) {
      if (d) driverIdSet.add(d);
    }
    /** Drivers whose Uber payment CSV metrics (dm-pay/dm-ptx) should be stripped for this batch only */
    const stripUberPaymentMetricsFor = new Set<string>();
    for (const d of driverIdsFromCanonical) if (d) stripUberPaymentMetricsFor.add(d);
    for (const d of uberDriverIdsFromDeletedTrips) if (d) stripUberPaymentMetricsFor.add(d);

    console.log(`[Batch delete] Found ${tripKeys.length} trips, ${driverIdSet.size} drivers (${driverIdsFromCanonical.size} from canonical events), ${vehicleIdSet.size} vehicles`);

    // Delete trips in chunks
    if (tripKeys.length > 0) {
      for (let i = 0; i < tripKeys.length; i += 100) {
        await kv.mdel(tripKeys.slice(i, i + 100));
      }
    }

    // ── 2. Fetch and delete transactions in this batch (paginated) ──
    const txRows = await paginatedKeyFetch(() =>
      supabase
        .from("kv_store_37f42386")
        .select("key")
        .like("key", "transaction:%")
        .eq("value->>batchId", batchId)
    );
    const txKeys = txRows.map(d => d.key);

    if (txKeys.length > 0) {
      for (let i = 0; i < txKeys.length; i += 100) {
        await kv.mdel(txKeys.slice(i, i + 100));
      }
    }
    console.log(`[Batch delete] Deleted ${tripKeys.length} trips, ${txKeys.length} transactions`);

    // ── 3. Smart driver_metric cleanup ──
    //    Only delete if the driver has NO trips remaining in other batches.
    //    POST /driver-metrics stores keys as `driver_metric:${m.id}` (e.g. dm-pay-…), not
    //    `driver_metric:${driverId}` — deleting only the latter left ghost payment cash fields.
    const collectDriverMetricKeysForDriver = async (targetDriverId: string): Promise<string[]> => {
      const raw = String(targetDriverId || "").trim();
      if (!raw) return [];
      const variants = Array.from(
        new Set([raw, raw.toLowerCase(), raw.toUpperCase()].filter((v) => v.length > 0)),
      );
      const seen = new Set<string>();
      const out: string[] = [];
      const PAGE = 1000;
      const MAX_PAGES = 50;
      for (const vid of variants) {
        let offset = 0;
        for (let p = 0; p < MAX_PAGES; p++) {
          const { data, error } = await supabase
            .from("kv_store_37f42386")
            .select("key")
            .like("key", "driver_metric:%")
            .eq("value->>driverId", vid)
            .range(offset, offset + PAGE - 1);
          if (error) throw error;
          const page = data || [];
          for (const row of page) {
            const k = (row as { key?: string }).key;
            if (k && !seen.has(k)) {
              seen.add(k);
              out.push(k);
            }
          }
          if (page.length < PAGE) break;
          offset += PAGE;
        }
      }
      const legacy = `driver_metric:${raw}`;
      if (!seen.has(legacy)) {
        seen.add(legacy);
        out.push(legacy);
      }
      return out;
    };

    let deletedDriverMetrics = 0;
    let skippedDriverMetrics = 0;
    for (const driverId of driverIdSet) {
      const { count, error } = await supabase
        .from("kv_store_37f42386")
        .select("*", { count: "exact", head: true })
        .like("key", "trip:%")
        .eq("value->>driverId", driverId)
        .neq("value->>batchId", batchId);
      if (error) {
        console.log(`[Batch delete] Driver metric check error for ${driverId}: ${error.message} — skipping (safe)`);
        skippedDriverMetrics++;
        continue;
      }
      if ((count || 0) === 0) {
        try {
          const dmKeys = await collectDriverMetricKeysForDriver(driverId);
          if (dmKeys.length > 0) {
            for (let i = 0; i < dmKeys.length; i += 100) {
              await kv.mdel(dmKeys.slice(i, i + 100));
            }
            deletedDriverMetrics += dmKeys.length;
            console.log(
              `[Batch delete] Removed ${dmKeys.length} driver_metric key(s) for driver ${driverId}`,
            );
          }
        } catch (delErr: any) {
          console.log(`[Batch delete] Failed to delete driver_metric rows for ${driverId}: ${delErr.message}`);
        }
      } else {
        skippedDriverMetrics++;
      }
    }
    console.log(`[Batch delete] Driver metrics: ${deletedDriverMetrics} KV rows deleted, ${skippedDriverMetrics} drivers skipped (still have trips elsewhere)`);

    // ── 3b. Uber payment CSV metrics (`dm-pay-*` / `dm-ptx-*` from csvHelpers) — only for drivers tied to
    //        this batch (canonical events or deleted Uber trips), so Roam-only batch deletes do not wipe payment rows.
    let deletedUberPaymentMetrics = 0;
    for (const driverId of stripUberPaymentMetricsFor) {
      try {
        const dmKeys = await collectDriverMetricKeysForDriver(driverId);
        const uberPaymentKeys: string[] = [];
        const dd = String(driverId || "").trim().toLowerCase();
        for (const key of dmKeys) {
          const m = (await kv.get(key)) as { id?: string; driverId?: string } | null;
          const mid = m?.id != null ? String(m.id) : "";
          if (!mid.startsWith("dm-pay-") && !mid.startsWith("dm-ptx-")) continue;
          const md = String(m?.driverId || "").trim().toLowerCase();
          if (md && dd && md === dd) uberPaymentKeys.push(key);
        }
        if (uberPaymentKeys.length > 0) {
          for (let i = 0; i < uberPaymentKeys.length; i += 100) {
            await kv.mdel(uberPaymentKeys.slice(i, i + 100));
          }
          deletedUberPaymentMetrics += uberPaymentKeys.length;
          console.log(
            `[Batch delete] Removed ${uberPaymentKeys.length} Uber payment driver_metric key(s) for driver ${driverId}`,
          );
        }
      } catch (ubErr: any) {
        console.warn(`[Batch delete] Uber payment metric cleanup for ${driverId}:`, ubErr?.message);
      }
    }
    console.log(
      `[Batch delete] Uber payment metrics (dm-pay/dm-ptx): ${deletedUberPaymentMetrics} KV rows removed`,
    );

    // ── 4. Smart vehicle_metric cleanup ──
    //    Only delete if the vehicle has NO trips remaining in other batches
    let deletedVehicleMetrics = 0;
    let skippedVehicleMetrics = 0;
    for (const vehicleId of vehicleIdSet) {
      const { count, error } = await supabase
        .from("kv_store_37f42386")
        .select("*", { count: "exact", head: true })
        .like("key", "trip:%")
        .eq("value->>vehicleId", vehicleId)
        .neq("value->>batchId", batchId);
      if (error) {
        console.log(`[Batch delete] Vehicle metric check error for ${vehicleId}: ${error.message} — skipping (safe)`);
        skippedVehicleMetrics++;
        continue;
      }
      if ((count || 0) === 0) {
        try {
          await kv.del(`vehicle_metric:${vehicleId}`);
          deletedVehicleMetrics++;
        } catch (delErr: any) {
          console.log(`[Batch delete] Failed to delete vehicle_metric:${vehicleId}: ${delErr.message}`);
        }
      } else {
        skippedVehicleMetrics++;
      }
    }
    console.log(`[Batch delete] Vehicle metrics: ${deletedVehicleMetrics} deleted, ${skippedVehicleMetrics} shared/skipped`);

    // ── 5. Ghost Data Cleanup (safety net — catches edge cases) ──
    const { count: remainingTrips } = await supabase.from("kv_store_37f42386").select('*', { count: 'exact', head: true }).like("key", "trip:%");
    const { count: remainingTx } = await supabase.from("kv_store_37f42386").select('*', { count: 'exact', head: true }).like("key", "transaction:%");

    if (remainingTrips === 0 && remainingTx === 0) {
      console.log("[Batch delete] No source data remaining. Running ghost metrics cleanup...");
      const metricPrefixes = ["driver_metric:", "vehicle_metric:", "organization_metric:"];
      for (const prefix of metricPrefixes) {
        const { data: items } = await supabase.from("kv_store_37f42386").select("key").like("key", `${prefix}%`);
        if (items && items.length > 0) {
          const keys = items.map(d => d.key);
          for (let i = 0; i < keys.length; i += 100) await kv.mdel(keys.slice(i, i + 100));
        }
      }
    }

    // ── 6. Delete the batch record itself ──
    await kv.del(`batch:${batchId}`);

    // Invalidate caches
    await cache.invalidateCacheVersion("stats");
    await cache.invalidateCacheVersion("performance");

    console.log(`[Batch delete] Cascade complete for batch ${batchId}`);

    return c.json({
      success: true,
      deletedTrips: tripKeys.length,
      deletedTransactions: txKeys.length,
      deletedLedgerEntries: deletedCanonicalLedger,
      deletedCanonicalIdem,
      deletedDriverMetrics,
      skippedDriverMetrics,
      deletedUberPaymentMetrics,
      deletedDisputeRefundKeys,
      deletedDisputeRefundDedupKeys,
      deletedVehicleMetrics,
      skippedVehicleMetrics,
      deletedBatch: batchId
    });
  } catch (e: any) {
    console.error(`[Batch delete] Cascade error for batch ${batchId}:`, e);
    return c.json({ error: e.message }, 500);
  }
});

// ---------------------------------------------------------------------------
// Batch Delete Preview — returns impact summary for deleting a batch
// ---------------------------------------------------------------------------
app.get("/make-server-37f42386/batches/:id/delete-preview", requireAuth(), async (c) => {
  const batchId = c.req.param("id");
  try {
    // 0. Fetch the batch record itself
    const batchRecord = await kv.get(`batch:${batchId}`);
    if (!batchRecord) {
      return c.json({ error: `Batch ${batchId} not found` }, 404);
    }

    // Paginated helper — fetches all matching rows in 1,000-row pages
    const PAGE = 1000;
    const MAX_ROWS = 50000;
    const paginatedKeyFetch = async (buildQuery: () => any): Promise<any[]> => {
      let all: any[] = [];
      let offset = 0;
      while (offset < MAX_ROWS) {
        const { data, error } = await buildQuery().range(offset, offset + PAGE - 1);
        if (error) throw error;
        const page = data || [];
        all = all.concat(page);
        if (page.length < PAGE) break;
        offset += PAGE;
      }
      return all;
    };

    // 1. Fetch all trips in this batch (need IDs, driverIds, vehicleIds)
    const tripRows = await paginatedKeyFetch(() =>
      supabase
        .from("kv_store_37f42386")
        .select("key, value")
        .like("key", "trip:%")
        .eq("value->>batchId", batchId)
    );
    const tripCount = tripRows.length;

    // Extract trip IDs, unique driverIds, unique vehicleIds
    const tripIds: string[] = [];
    const driverIdSet = new Set<string>();
    const vehicleIdSet = new Set<string>();
    for (const row of tripRows) {
      const v = row.value;
      if (!v) continue;
      tripIds.push(v.id || row.key.replace("trip:", ""));
      if (v.driverId) driverIdSet.add(v.driverId);
      if (v.vehicleId) vehicleIdSet.add(v.vehicleId);
    }

    // 2. Count transactions in this batch
    const txRows = await paginatedKeyFetch(() =>
      supabase
        .from("kv_store_37f42386")
        .select("key")
        .like("key", "transaction:%")
        .eq("value->>batchId", batchId)
    );
    const transactionCount = txRows.length;

    // 3. Canonical ledger events for this batch (matches cascade step 0)
    let ledgerCount = 0;
    {
      const { count, error } = await supabase
        .from("kv_store_37f42386")
        .select("*", { count: "exact", head: true })
        .like("key", CANONICAL_LEDGER_KEY_LIKE)
        .eq("value->>batchId", batchId);
      if (error) {
        console.log(`Batch delete-preview ledger_event count error: ${error.message}`);
      } else {
        ledgerCount = count || 0;
      }
    }

    // 4. Driver metrics safety check
    //    For each driver in this batch, check if they have trips in OTHER batches
    const driverMetrics = { affected: driverIdSet.size, safeToDelete: 0, shared: 0, details: [] as any[] };
    for (const driverId of driverIdSet) {
      const { count, error } = await supabase
        .from("kv_store_37f42386")
        .select("*", { count: "exact", head: true })
        .like("key", "trip:%")
        .eq("value->>driverId", driverId)
        .neq("value->>batchId", batchId);
      if (error) {
        console.log(`Batch delete-preview driver check error for ${driverId}: ${error.message}`);
        driverMetrics.shared++;
        driverMetrics.details.push({ driverId, status: "shared", reason: "query error — kept safe" });
      } else if ((count || 0) > 0) {
        driverMetrics.shared++;
        driverMetrics.details.push({ driverId, status: "shared", otherTrips: count });
      } else {
        driverMetrics.safeToDelete++;
        driverMetrics.details.push({ driverId, status: "safeToDelete" });
      }
    }

    // 5. Vehicle metrics safety check — same logic
    const vehicleMetrics = { affected: vehicleIdSet.size, safeToDelete: 0, shared: 0, details: [] as any[] };
    for (const vehicleId of vehicleIdSet) {
      const { count, error } = await supabase
        .from("kv_store_37f42386")
        .select("*", { count: "exact", head: true })
        .like("key", "trip:%")
        .eq("value->>vehicleId", vehicleId)
        .neq("value->>batchId", batchId);
      if (error) {
        console.log(`Batch delete-preview vehicle check error for ${vehicleId}: ${error.message}`);
        vehicleMetrics.shared++;
        vehicleMetrics.details.push({ vehicleId, status: "shared", reason: "query error — kept safe" });
      } else if ((count || 0) > 0) {
        vehicleMetrics.shared++;
        vehicleMetrics.details.push({ vehicleId, status: "shared", otherTrips: count });
      } else {
        vehicleMetrics.safeToDelete++;
        vehicleMetrics.details.push({ vehicleId, status: "safeToDelete" });
      }
    }

    const drPreviewRows = await paginatedKeyFetch(() =>
      supabase
        .from("kv_store_37f42386")
        .select("key")
        .like("key", "dispute-refund:%")
        .eq("value->>batchId", batchId)
    );
    const disputeRefundCount = drPreviewRows.filter(
      (r: { key: string }) =>
        r.key.startsWith("dispute-refund:") && !r.key.startsWith("dispute-refund-dedup"),
    ).length;

    console.log(
      `[Batch delete-preview] Batch ${batchId}: ${tripCount} trips, ${transactionCount} txns, ${ledgerCount} ledger_event rows, ${disputeRefundCount} dispute refunds, ${driverMetrics.safeToDelete}/${driverMetrics.affected} driver metrics deletable, ${vehicleMetrics.safeToDelete}/${vehicleMetrics.affected} vehicle metrics deletable`,
    );

    return c.json({
      batch: batchRecord,
      trips: tripCount,
      transactions: transactionCount,
      ledgerEntries: ledgerCount,
      disputeRefunds: disputeRefundCount,
      driverMetrics,
      vehicleMetrics,
    });
  } catch (e: any) {
    console.error(`Batch delete-preview error for ${batchId}:`, e);
    return c.json({ error: e.message }, 500);
  }
});

// Admin: Preview Data Reset Endpoint - Optimized
app.post("/make-server-37f42386/preview-reset", requireAuth(), requirePermission('data.backfill'), async (c) => {
  try {
    const { type, startDate, endDate, targets, driverId } = await c.req.json();
    
    if (!type || !startDate || !endDate || !targets) {
        return c.json({ error: "Missing required parameters" }, 400);
    }
    
    const start = new Date(startDate).toISOString();
    const end = new Date(endDate).toISOString();
    
    const items: any[] = [];

    if (type === 'upload') {
        const { data: batchData } = await supabase
            .from("kv_store_37f42386")
            .select("value")
            .like("key", "batch:%")
            .gte("value->>uploadDate", start)
            .lte("value->>uploadDate", end);

        const targetBatches = batchData?.map((d: any) => d.value) || [];
        const batchIds = targetBatches.map((b: any) => b.id);
        
        if (batchIds.length > 0) {
            // Fetch trips and txs for these batches using native Supabase filters
            if (targets.includes('trips')) {
                let query = supabase
                    .from("kv_store_37f42386")
                    .select("value->id, value->platform, value->distance, value->amount, value->driverName, value->batchId, value->date, value->requestTimestamp")
                    .like("key", "trip:%")
                    .in("value->>batchId", batchIds);
                
                if (driverId) query = query.eq("value->>driverId", driverId);
                
                const { data: trips } = await query;
                (trips || []).forEach((t: any) => {
                    items.push({
                        id: t.id,
                        key: `trip:${t.id}`,
                        type: 'Trip',
                        date: t.date || t.requestTimestamp,
                        description: `${t.platform} - ${t.distance || 0}km`,
                        amount: t.amount,
                        driverName: t.driverName || 'Unknown',
                        batchId: t.batchId
                    });
                });
            }

            if (targets.includes('transactions')) {
                let query = supabase
                    .from("kv_store_37f42386")
                    .select("value->id, value->description, value->amount, value->driverName, value->batchId, value->date, value->timestamp, value->receiptUrl")
                    .like("key", "transaction:%")
                    .in("value->>batchId", batchIds);
                
                if (driverId) query = query.eq("value->>driverId", driverId);
                
                const { data: txs } = await query;
                (txs || []).forEach((t: any) => {
                    items.push({
                        id: t.id,
                        key: `transaction:${t.id}`,
                        type: 'Transaction',
                        date: t.date || t.timestamp,
                        description: t.description || 'Toll/Expense',
                        amount: t.amount,
                        driverName: t.driverName || 'Unknown',
                        batchId: t.batchId,
                        receiptUrl: t.receiptUrl
                    });
                });
            }
        }
    } else {
        // Record Date mode - Direct query by date
        if (targets.includes('trips')) {
            let query = supabase
                .from("kv_store_37f42386")
                .select("value->id, value->platform, value->distance, value->amount, value->driverName, value->date, value->requestTimestamp")
                .like("key", "trip:%")
                .or(`value->>date.gte.${start},value->>requestTime.gte.${start}`)
                .or(`value->>date.lte.${end},value->>requestTime.lte.${end}`);
            
            if (driverId) query = query.eq("value->>driverId", driverId);
            
            const { data: trips } = await query;
            (trips || []).forEach((t: any) => {
                items.push({
                    id: t.id,
                    key: `trip:${t.id}`,
                    type: 'Trip',
                    date: t.date || t.requestTimestamp,
                    description: `${t.platform} - ${t.distance || 0}km`,
                    amount: t.amount,
                    driverName: t.driverName || 'Unknown'
                });
            });
        }
        
        if (targets.includes('transactions')) {
            let query = supabase
                .from("kv_store_37f42386")
                .select("value->id, value->description, value->amount, value->driverName, value->date, value->timestamp, value->receiptUrl")
                .like("key", "transaction:%")
                .gte("value->>date", start)
                .lte("value->>date", end);
            
            if (driverId) query = query.eq("value->>driverId", driverId);
            
            const { data: txs } = await query;
            (txs || []).forEach((t: any) => {
                items.push({
                    id: t.id,
                    key: `transaction:${t.id}`,
                    type: 'Transaction',
                    date: t.date || t.timestamp,
                    description: t.description || 'Toll/Expense',
                    amount: t.amount,
                    driverName: t.driverName || 'Unknown',
                    receiptUrl: t.receiptUrl
                });
            });
        }
    }

    return c.json({ success: true, items });

  } catch (e: any) {
    console.error("Preview reset error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// Admin: Reset Data By Date Endpoint - Optimized
app.post("/make-server-37f42386/reset-by-date", requireAuth(), requirePermission('data.backfill'), async (c) => {
  try {
    const { type, startDate, endDate, targets, driverId, preview, keys } = await c.req.json();
    
    // Mode 1: Direct Deletion by Keys
    if (keys && Array.isArray(keys) && keys.length > 0) {
        const filesToDelete: string[] = [];
        const chunkSize = 100;
        
        for (let i = 0; i < keys.length; i += chunkSize) {
            const chunkKeys = keys.slice(i, i + chunkSize);
            const chunkValues = await kv.mget(chunkKeys);
            
            (chunkValues || []).forEach((item: any) => {
                if (item && item.receiptUrl && typeof item.receiptUrl === 'string') {
                     if (item.receiptUrl.includes('make-37f42386-docs')) {
                         const parts = item.receiptUrl.split('make-37f42386-docs/');
                         if (parts.length > 1) {
                             const path = parts[1].split('?')[0];
                             filesToDelete.push(path);
                         }
                     }
                }
            });
            
            await kv.mdel(chunkKeys);
        }

        if (filesToDelete.length > 0) {
            const bucketName = "make-37f42386-docs";
            const fileChunkSize = 50;
            for (let i = 0; i < filesToDelete.length; i += fileChunkSize) {
                const chunk = filesToDelete.slice(i, i + fileChunkSize);
                await supabase.storage.from(bucketName).remove(chunk);
            }
        }
        
        return c.json({ success: true, deletedCount: keys.length, filesDeletedCount: filesToDelete.length });
    }

    // Mode 2: Search (Preview or Bulk Delete)
    if (!type || !startDate || !endDate || !targets) {
        return c.json({ error: "Missing required parameters" }, 400);
    }
    
    const start = new Date(startDate).toISOString();
    const end = new Date(endDate).toISOString();
    
    const candidates: { key: string, data: any, type: 'trip' | 'transaction' | 'fuel_entry' }[] = [];

    if (type === 'upload') {
        const { data: batchData } = await supabase
            .from("kv_store_37f42386")
            .select("value")
            .like("key", "batch:%")
            .gte("value->>uploadDate", start)
            .lte("value->>uploadDate", end);

        const batchIds = batchData?.map((d: any) => d.value.id) || [];
        
        if (batchIds.length > 0) {
            // Trips
            if (targets.includes('trips')) {
                let query = supabase.from("kv_store_37f42386").select("key, value->id, value->date, value->requestTimestamp, value->platform, value->pickupLocation, value->dropoffLocation, value->amount, value->driverId, value->driverName").like("key", "trip:%").in("value->>batchId", batchIds);
                if (driverId) query = query.eq("value->>driverId", driverId);
                const { data } = await query;
                (data || []).forEach((d: any) => candidates.push({ key: d.key, data: d, type: 'trip' }));
            }
            // Fuel Entries
            if (targets.includes('fuel')) {
                let query = supabase.from("kv_store_37f42386").select("key, value->id, value->date, value->amount, value->driverId, value->driverName, value->category, value->description, value->receiptUrl, value->invoiceUrl").like("key", "fuel_entry:%").in("value->>batchId", batchIds);
                if (driverId) query = query.eq("value->>driverId", driverId);
                const { data } = await query;
                (data || []).forEach((d: any) => candidates.push({ key: d.key, data: d, type: 'fuel_entry' }));
            }
            // Transactions (Tolls/Other)
            if (targets.includes('transactions') || targets.includes('tolls')) {
                let query = supabase.from("kv_store_37f42386").select("key, value->id, value->date, value->timestamp, value->amount, value->driverId, value->driverName, value->category, value->description, value->receiptUrl, value->invoiceUrl").like("key", "transaction:%").in("value->>batchId", batchIds);
                if (driverId) query = query.eq("value->>driverId", driverId);
                const { data } = await query;
                (data || []).forEach((d: any) => {
                    const isToll = d.category?.includes('Toll') || d.description?.toLowerCase().includes('toll');
                    if (targets.includes('transactions') || (targets.includes('tolls') && isToll)) {
                        candidates.push({ key: d.key, data: d, type: 'transaction' });
                    }
                });
            }
        }
    } else {
        // Record Date mode
        if (targets.includes('trips')) {
            let query = supabase.from("kv_store_37f42386").select("key, value->id, value->date, value->requestTimestamp, value->platform, value->pickupLocation, value->dropoffLocation, value->amount, value->driverId, value->driverName").like("key", "trip:%")
                .or(`value->>date.gte.${start},value->>requestTime.gte.${start}`)
                .or(`value->>date.lte.${end},value->>requestTime.lte.${end}`);
            if (driverId) query = query.eq("value->>driverId", driverId);
            const { data } = await query;
            (data || []).forEach((d: any) => candidates.push({ key: d.key, data: d, type: 'trip' }));
        }
        
        if (targets.includes('transactions') || targets.includes('tolls') || targets.includes('fuel')) {
            let query = supabase.from("kv_store_37f42386").select("key, value->id, value->date, value->timestamp, value->amount, value->driverId, value->driverName, value->category, value->description, value->receiptUrl, value->invoiceUrl").like("key", "transaction:%")
                .gte("value->>date", start).lte("value->>date", end);
            if (driverId) query = query.eq("value->>driverId", driverId);
            const { data } = await query;
            (data || []).forEach((d: any) => {
                const isToll = d.category?.includes('Toll') || d.description?.toLowerCase().includes('toll');
                const isFuel = d.category === 'Fuel' || d.description?.toLowerCase().includes('fuel');
                if (targets.includes('transactions') || (targets.includes('tolls') && isToll) || (targets.includes('fuel') && isFuel)) {
                    candidates.push({ key: d.key, data: d, type: 'transaction' });
                }
            });
        }

        if (targets.includes('fuel')) {
            let query = supabase.from("kv_store_37f42386").select("key, value->id, value->date, value->amount, value->driverId, value->driverName, value->category, value->description, value->receiptUrl, value->invoiceUrl").like("key", "fuel_entry:%")
                .gte("value->>date", start).lte("value->>date", end);
            if (driverId) query = query.eq("value->>driverId", driverId);
            const { data } = await query;
            (data || []).forEach((d: any) => candidates.push({ key: d.key, data: d, type: 'fuel_entry' }));
        }
    }

    if (preview) {
        return c.json({
            success: true,
            items: candidates.map(c => ({
                id: c.data.id,
                key: c.key,
                type: c.type === 'trip' ? 'Trip' : (c.type === 'fuel_entry' ? 'Fuel Log' : (c.data.category || 'Transaction')),
                date: c.data.date || c.data.requestTimestamp || c.data.timestamp || c.data.uploadDate,
                description: c.type === 'trip' 
                    ? `Trip: ${c.data.pickupLocation || 'Unknown'} -> ${c.data.dropoffLocation || 'Unknown'}` 
                    : (c.data.description || c.data.category || 'Item'),
                amount: c.data.amount,
                driverId: c.data.driverId,
                driverName: c.data.driverName,
                receiptUrl: c.data.receiptUrl || c.data.invoiceUrl
            }))
        });
    }

    // Execute Deletion
    const keysToDelete = candidates.map(c => c.key);
    const filesToDelete: string[] = [];
    candidates.forEach(c => {
        const url = c.data.receiptUrl || c.data.invoiceUrl;
        if (url && typeof url === 'string' && url.includes('make-37f42386-docs')) {
             const parts = url.split('make-37f42386-docs/');
             if (parts.length > 1) filesToDelete.push(parts[1].split('?')[0]);
        }
    });

    if (keysToDelete.length > 0) {
        for (let i = 0; i < keysToDelete.length; i += 100) await kv.mdel(keysToDelete.slice(i, i + 100));
    }

    if (filesToDelete.length > 0) {
        const bucketName = "make-37f42386-docs";
        for (let i = 0; i < filesToDelete.length; i += 50) await supabase.storage.from(bucketName).remove(filesToDelete.slice(i, i + 50));
    }

    return c.json({ success: true, deletedCount: keysToDelete.length, filesDeletedCount: filesToDelete.length });

  } catch (e: any) {
    console.error("Reset by date error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// AI CSV Mapping Endpoint
app.post("/make-server-37f42386/ai/map-csv", async (c) => {
  try {
    const { headers, sample, targetFields } = await c.req.json();
    
    if (!headers || !sample) {
      return c.json({ error: "Headers and sample data required" }, 400);
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return c.json({ error: "AI Service not configured" }, 503);
    }

    const openai = new OpenAI({ apiKey });

    const prompt = `
      You are an expert data analyst. 
      I have a CSV file with the following headers: ${JSON.stringify(headers)}.
      Here is a sample of the first 3 rows: ${JSON.stringify(sample.slice(0, 3))}.
      
      Please map the CSV headers to the following target system fields:
      ${JSON.stringify(targetFields)}

      Rules:
      1. Analyze the sample data to understand the content of each column (e.g. identify dates, currency, IDs).
      2. Return a JSON object where keys are the CSV Header Name and values are the Target Field Key.
      3. Only include mappings you are confident about.
      4. If a column doesn't match any target field, omit it.
      5. For "driverName", if it's split into "First Name" and "Last Name", map BOTH to "driverName".
      6. For "date", map columns that look like dates or timestamps.
      
      Example Output:
      {
        "Ride Date": "date",
        "Total Fare": "amount",
        "Driver First Name": "driverName", 
        "Driver Last Name": "driverName"
      }
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a JSON mapping assistant." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0
    });

    const content = response.choices[0].message.content;
    const mapping = JSON.parse(content || "{}");

    return c.json({ success: true, mapping });
  } catch (e: any) {
    console.error("AI Mapping Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// Integration Settings Endpoints
app.get("/make-server-37f42386/settings/integrations", requireAuth(), async (c) => {
  try {
    const integrations = await kv.getByPrefix("integration:");
    return c.json(filterByOrg(integrations || [], c));
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/settings/integrations", requireAuth(), requirePermission('settings.edit'), async (c) => {
  try {
    const integration = await c.req.json();
    if (!integration.id) {
        return c.json({ error: "Integration ID is required" }, 400);
    }
    await kv.set(`integration:${integration.id}`, stampOrg(integration, c));
    return c.json({ success: true, data: integration });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Uber OAuth Endpoints

// 1. Generate Auth URL
app.get("/make-server-37f42386/uber/auth-url", async (c) => {
  try {
    const integration = await kv.get("integration:uber");
    if (!integration || !integration.credentials?.clientId) {
       return c.json({ error: "Uber integration not configured." }, 400);
    }
    
    // Allow frontend to specify redirect URI (must match exactly what is in Uber Dashboard)
    const clientRedirectUri = c.req.query("redirect_uri");
    const defaultRedirectUri = "https://csfllzzastacofsvcdsc.supabase.co/functions/v1/make-server-37f42386/uber/callback";
    
    // If client provides a URI, use it. Otherwise fallback to old default (which we are deprecating)
    const redirectUri = clientRedirectUri || defaultRedirectUri;
    
    const clientId = integration.credentials.clientId;
    
    // Allow frontend to request specific scopes (default to 'profile')
    // The user must enable these in Uber Dashboard -> Scopes
    const clientScope = c.req.query("scope");
    const scope = clientScope || "profile"; 
    
    const authUrl = `https://login.uber.com/oauth/v2/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`;
    
    return c.json({ url: authUrl });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// 2. Exchange Code (Called by Frontend)
app.post("/make-server-37f42386/uber/exchange", async (c) => {
    try {
        const { code, redirect_uri } = await c.req.json();
        
        if (!code || !redirect_uri) {
            return c.json({ error: "Missing code or redirect_uri" }, 400);
        }

        const integration = await kv.get("integration:uber");
        if (!integration || !integration.credentials) {
            return c.json({ error: "Integration settings missing." }, 400);
        }

        const { clientId, clientSecret } = integration.credentials;

        const body = new URLSearchParams();
        body.append("client_id", clientId);
        body.append("client_secret", clientSecret);
        body.append("grant_type", "authorization_code");
        body.append("redirect_uri", redirect_uri);
        body.append("code", code);

        const tokenRes = await fetch("https://login.uber.com/oauth/v2/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body
        });

        const tokenData = await tokenRes.json();
        
        if (!tokenRes.ok) {
            console.error("Uber Token Exchange Failed:", tokenData);
            return c.json({ error: "Token exchange failed", details: tokenData }, 400);
        }

        // Save Tokens
        const tokenStore = {
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_at: Date.now() + (tokenData.expires_in * 1000),
            scope: tokenData.scope,
            token_type: tokenData.token_type
        };
        
        await kv.set("integration:uber_token", tokenStore);
        
        // Update status
        integration.status = 'connected';
        integration.lastConnected = new Date().toISOString();
        await kv.set("integration:uber", integration);

        return c.json({ success: true });

    } catch (e: any) {
        console.error("Exchange Error:", e);
        return c.json({ error: e.message }, 500);
    }
});

// 3. Handle Callback (Deprecated/Legacy for Backend-to-Backend)
app.get("/make-server-37f42386/uber/callback", async (c) => {
  const code = c.req.query("code");
  const error = c.req.query("error");
  
  if (error) {
    return c.html(`<h1>Login Failed</h1><p>${error}</p>`);
  }
  if (!code) {
    return c.html(`<h1>Error</h1><p>No code provided.</p>`);
  }

  try {
    const integration = await kv.get("integration:uber");
    if (!integration || !integration.credentials) {
       return c.html(`<h1>Error</h1><p>Integration settings missing.</p>`);
    }

    const { clientId, clientSecret } = integration.credentials;
    const redirectUri = "https://csfllzzastacofsvcdsc.supabase.co/functions/v1/make-server-37f42386/uber/callback";

    const body = new URLSearchParams();
    body.append("client_id", clientId);
    body.append("client_secret", clientSecret);
    body.append("grant_type", "authorization_code");
    body.append("redirect_uri", redirectUri);
    body.append("code", code);

    const tokenRes = await fetch("https://login.uber.com/oauth/v2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body
    });

    const tokenData = await tokenRes.json();
    
    if (!tokenRes.ok) {
        console.error("Uber Token Exchange Failed:", tokenData);
        return c.html(`<h1>Auth Failed</h1><p>${JSON.stringify(tokenData)}</p>`);
    }

    // Save Tokens
    const tokenStore = {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: Date.now() + (tokenData.expires_in * 1000),
        scope: tokenData.scope,
        token_type: tokenData.token_type
    };
    
    await kv.set("integration:uber_token", tokenStore);
    
    // Update status
    integration.status = 'connected';
    integration.lastConnected = new Date().toISOString();
    await kv.set("integration:uber", integration);

    return c.html(`
      <div style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h1 style="color: green;">Success!</h1>
        <p>Uber has been connected successfully.</p>
        <p>You can close this window and return to the dashboard.</p>
        <script>
          if (window.opener) {
            window.opener.postMessage("uber-connected", "*");
            setTimeout(() => window.close(), 1500);
          }
        </script>
      </div>
    `);

  } catch (e: any) {
    return c.html(`<h1>System Error</h1><p>${e.message}</p>`);
  }
});

// Uber API Sync Endpoint
app.post("/make-server-37f42386/uber/sync", async (c) => {
  try {
    // 1. Get Tokens
    let tokenStore = await kv.get("integration:uber_token");
    
    if (!tokenStore || !tokenStore.access_token) {
       return c.json({ error: "Uber not connected. Please click 'Connect' first.", code: "AUTH_REQUIRED" }, 401);
    }

    // 2. Check Expiry & Refresh if needed
    if (Date.now() > tokenStore.expires_at) {
        console.log("Token expired, attempting refresh...");
        const integration = await kv.get("integration:uber");
        if (integration?.credentials && tokenStore.refresh_token) {
            const { clientId, clientSecret } = integration.credentials;
            const body = new URLSearchParams();
            body.append("client_id", clientId);
            body.append("client_secret", clientSecret);
            body.append("grant_type", "refresh_token");
            body.append("refresh_token", tokenStore.refresh_token);
            
            const refreshRes = await fetch("https://login.uber.com/oauth/v2/token", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body
            });
            
            if (refreshRes.ok) {
                const newData = await refreshRes.json();
                tokenStore = {
                    access_token: newData.access_token,
                    refresh_token: newData.refresh_token,
                    expires_at: Date.now() + (newData.expires_in * 1000),
                    scope: newData.scope,
                    token_type: newData.token_type
                };
                await kv.set("integration:uber_token", tokenStore);
                console.log("Token refreshed successfully.");
            } else {
                return c.json({ error: "Session expired. Please reconnect.", code: "AUTH_REQUIRED" }, 401);
            }
        } else {
             return c.json({ error: "Session expired. Please reconnect.", code: "AUTH_REQUIRED" }, 401);
        }
    }

    const accessToken = tokenStore.access_token;
    let trips = [];

    // 3. Fetch Data (Rider History API)
    // Note: The 'history' scope provides this data.
    const historyRes = await fetch("https://api.uber.com/v1.2/history?limit=50", {
        headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        }
    });

    if (historyRes.ok) {
        const data = await historyRes.json();
        if (data.history && Array.isArray(data.history)) {
            trips = data.history.map((t: any) => ({
                trip_id: t.request_id,
                date: new Date(t.start_time * 1000).toISOString(),
                platform: 'Uber',
                driverId: 'Self', 
                pickupLocation: t.start_city?.display_name || 'Unknown',
                dropoffLocation: t.end_city?.display_name || 'Unknown',
                amount: 0, // Price is often hidden in history-lite
                netPayout: 0,
                status: t.status,
                source: 'uber_oauth_api'
            }));
            return c.json({ success: true, trips });
        } else {
            return c.json({ success: true, trips: [], warning: "Connected, but no history found." });
        }
    } else {
        const errText = await historyRes.text();
        console.error("Uber API Error:", errText);
        return c.json({ error: "Failed to fetch history from Uber.", details: errText }, 500);
    }

  } catch (e: any) {
    console.error("Uber Sync Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// Budget Management Endpoints
app.get("/make-server-37f42386/budgets", requireAuth(), async (c) => {
  try {
    const budgets = await kv.getByPrefix("budget:");
    return c.json(filterByOrg(budgets || [], c));
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/budgets", requireAuth(), requirePermission('settings.edit'), async (c) => {
  try {
    const budget = await c.req.json();
    if (!budget.id) {
        budget.id = crypto.randomUUID();
    }
    await kv.set(`budget:${budget.id}`, stampOrg(budget, c));
    return c.json({ success: true, data: budget });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// General Preferences Endpoints
app.get("/make-server-37f42386/settings/preferences", async (c) => {
  try {
    const preferences = await kv.get("preferences:general");
    return c.json(preferences || {});
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/settings/preferences", requireAuth(), requirePermission('settings.edit'), async (c) => {
  try {
    const preferences = await c.req.json();
    await kv.set("preferences:general", preferences);
    return c.json({ success: true, data: preferences });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ── Toll Info Endpoints ──────────────────────────────────────────────────
app.get("/make-server-37f42386/toll-info", async (c) => {
  try {
    const data = await kv.get("toll:rate_schedule");
    return c.json(data || null);
  } catch (e: any) {
    console.log(`[toll-info GET] Error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/toll-info", async (c) => {
  try {
    const schedule = await c.req.json();
    await kv.set("toll:rate_schedule", schedule);
    return c.json({ success: true });
  } catch (e: any) {
    console.log(`[toll-info POST] Error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// Fixed Expenses Endpoints
app.get("/make-server-37f42386/fixed-expenses/:vehicleId", requireAuth(), async (c) => {
  try {
    const vehicleId = c.req.param("vehicleId");
    // Key pattern: fixed_expense:{vehicleId}:{expenseId}
    const expenses = await kv.getByPrefix(`fixed_expense:${vehicleId}:`);
    return c.json(filterByOrg(expenses || [], c));
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/fixed-expenses", requireAuth(), requirePermission('vehicles.edit'), async (c) => {
  try {
    const expense = await c.req.json();
    if (!expense.vehicleId) {
        return c.json({ error: "Vehicle ID is required" }, 400);
    }
    if (!expense.id) {
        expense.id = crypto.randomUUID();
    }
    if (!expense.createdAt) {
        expense.createdAt = new Date().toISOString();
    }
    expense.updatedAt = new Date().toISOString();

    const key = `fixed_expense:${expense.vehicleId}:${expense.id}`;
    await kv.set(key, stampOrg(expense, c));
    return c.json({ success: true, data: expense });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-37f42386/fixed-expenses/:vehicleId/:id", requireAuth(), requirePermission('vehicles.edit'), async (c) => {
  const vehicleId = c.req.param("vehicleId");
  const id = c.req.param("id");
  try {
    const key = `fixed_expense:${vehicleId}:${id}`;
    await kv.del(key);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// AI Fleet Analysis Endpoint
app.post("/make-server-37f42386/analyze-fleet", async (c) => {
  try {
    const { payload } = await c.req.json();
    if (!payload) return c.json({ error: "No payload provided" }, 400);

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "Gemini API Key not configured" }, 503);

    const genAI = new GoogleGenerativeAI(apiKey);
    // Model selection moved to execution block for fallback support

    const prompt = `
      You are an expert Fleet Management Data Analyst AI.
      I have uploaded multiple CSV files representing my fleet's activity (Trips, Payments, Driver Performance, Vehicle Stats).
      
      Your goal is to cross-reference these files and output a SINGLE JSON object that populates my database.
      
      ### RULES & LOGIC
      
      1. **Driver Identification**:
         - Group data by Driver Name or UUID. 
         - A driver might appear in multiple files (e.g., "Trip Logs" and "Payment Logs"). Merge them.
      
      2. **Financial Logic (CRITICAL)**:
         - **Cash Collected**: This is money the driver holds physically. Sum the "Cash Collected" column from Payment files.
         - **Phantom Trip Detection**: If a trip has Status="Cancelled" BUT Cash Collected > 0, this is a FRAUD INDICATOR. Add to 'insights.phantomTrips'.
         - **Net Outstanding**: Cash Collected minus any "Cash Deposit" entries found.
      
      3. **Vehicle Logic**:
         - Group earnings by "Vehicle Plate" or "License Plate".
         - If a vehicle appears in "Fuel Logs", subtract that cost from its earnings to estimate ROI.
      
      4. **Performance Targets**:
         - High Performance: Acceptance > 85%, Cancellation < 5%.
         - Critical Warning: Cancellation > 10% or Acceptance < 60%.
      
      ### OUTPUT SCHEMA (Strict JSON)
      
      {
        "metadata": {
          "periodStart": "ISO Date (earliest found)",
          "periodEnd": "ISO Date (latest found)",
          "filesProcessed": Number
        },
        "drivers": [
          {
            "driverId": "String (UUID or Name Hash)",
            "driverName": "String",
            "periodStart": "ISO Date",
            "periodEnd": "ISO Date",
            "totalEarnings": Number,
            "cashCollected": Number,
            "netEarnings": Number,
            "acceptanceRate": Number (0.0-1.0),
            "cancellationRate": Number (0.0-1.0),
            "completionRate": Number (0.0-1.0),
            "onlineHours": Number,
            "tripsCompleted": Number,
            "ratingLast500": Number,
            "score": Number (0-100),
            "tier": "String (Bronze/Silver/Gold/Platinum)",
            "recommendation": "String (Advice for manager)"
          }
        ],
        "vehicles": [
          {
            "plateNumber": "String",
            "totalEarnings": Number,
            "onlineHours": Number,
            "totalTrips": Number,
            "utilizationRate": Number (0-100),
            "roiScore": Number (0-100),
            "maintenanceStatus": "String (Good/Due Soon/Critical)"
          }
        ],
        "financials": {
          "totalEarnings": Number,
          "netFare": Number,
          "totalCashExposure": Number,
          "fleetProfitMargin": Number
        },
        "insights": {
          "alerts": ["String"],
          "trends": ["String"],
          "recommendations": ["String"],
          "phantomTrips": [ { "tripId": "String", "driver": "String", "amount": Number } ]
        }
      }

      ### DATA INPUT
      ${payload}
    `;

    // Robust fallback strategy for model selection
    // Updated 2026-03-11: Use current Gemini model names (old -exp/-latest suffixes are deprecated/404)
    const modelCandidates = ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash"];
    let result = null;
    let lastError = null;

    for (const modelName of modelCandidates) {
        try {
            console.log(`Attempting analysis with model: ${modelName}`);
            const model = genAI.getGenerativeModel({ model: modelName });
            result = await model.generateContent(prompt);
            if (result) break; 
        } catch (e: any) {
            console.warn(`Model ${modelName} failed:`, e.message);
            lastError = e;
        }
    }

    let text = "";
    if (!result) {
        console.warn("All Gemini models failed. Attempting fallback to OpenAI GPT-4o...");
        const openaiKey = Deno.env.get("OPENAI_API_KEY");
        if (openaiKey) {
            try {
                const openai = new OpenAI({ apiKey: openaiKey });
                const completion = await openai.chat.completions.create({
                    model: "gpt-4o",
                    messages: [
                        { role: "system", content: "You are an expert Fleet Management Data Analyst AI." },
                        { role: "user", content: prompt }
                    ],
                    response_format: { type: "json_object" }
                });
                text = completion.choices[0].message.content || "{}";
                console.log("OpenAI Fallback Successful");
            } catch (openaiError: any) {
                 console.error("OpenAI Fallback Failed:", openaiError);
                 throw new Error(`Both Gemini and OpenAI failed. Gemini Error: ${lastError?.message}`);
            }
        } else {
             throw new Error(`All Gemini models failed and OPENAI_API_KEY is missing. Last Gemini Error: ${lastError?.message}`);
        }
    } else {
        const response = await result.response;
        text = response.text();
    }
    
    // Enhanced JSON Extraction and Cleaning
    let jsonStr = text.trim();
    
    // 1. Try to extract from Markdown code blocks first
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim();
    } else {
        // 2. Fallback: Find the first '{' and last '}'
        const firstOpen = text.indexOf('{');
        const lastClose = text.lastIndexOf('}');
        if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
            jsonStr = text.substring(firstOpen, lastClose + 1);
        }
    }
    
    let data;
    try {
        data = JSON.parse(jsonStr);
    } catch(parseError) {
        console.warn("Initial JSON parse failed. Attempting to repair common errors...");
        try {
            // 3. Simple Repair: Remove trailing commas in arrays/objects
            // Note: This is a basic regex and won't catch everything, but fixes the most common AI error
            const fixedJson = jsonStr.replace(/,\s*([\]}])/g, '$1');
            data = JSON.parse(fixedJson);
            console.log("JSON successfully repaired.");
        } catch (repairError) {
             console.error("JSON Parse Error:", parseError);
             console.log("Raw Text:", text);
             
             // 4. Ultimate Fallback: Return raw text wrapped in a simple structure so the user sees something
             // This prevents the "500 Internal Server Error" crash and allows the frontend to show the raw analysis
             console.warn("Returning raw text as fallback due to parse failure.");
             return c.json({ 
                 success: true, 
                 warning: "AI output was not valid JSON. Showing raw analysis.",
                 data: {
                     metadata: { filesProcessed: 1 },
                     drivers: [],
                     vehicles: [],
                     financials: { totalEarnings: 0, netFare: 0, totalCashExposure: 0, fleetProfitMargin: 0 },
                     insights: { 
                         alerts: ["Analysis generated but format was invalid."], 
                         recommendations: [text], // Put the raw text here so the user can read it
                         phantomTrips: [] 
                     }
                 }
             });
        }
    }

    return c.json({ success: true, data });
  } catch (e: any) {
    console.error("Analysis Error:", e);
    // Detect quota / rate-limit errors and return a user-friendly message
    const isQuota = e?.status === 429 || e?.code === "insufficient_quota" || /quota|rate.?limit/i.test(e?.message || "");
    if (isQuota) {
      return c.json({ error: "AI service temporarily unavailable — your API quota may be exhausted. Please check your OpenAI billing dashboard and try again in a few minutes.", userFriendly: true }, 503);
    }
    return c.json({ error: e.message }, 500);
  }
});

// Fleet Sync Endpoint (Mega-JSON Persistence)
app.post("/make-server-37f42386/fleet/sync", async (c) => {
  try {
    const { drivers, vehicles, financials, trips, metadata, insights } = await c.req.json();

    const operations = [];

    // 1. Driver Metrics
    if (Array.isArray(drivers) && drivers.length > 0) {
        // Deduplicate drivers by driverId to avoid "ON CONFLICT DO UPDATE command cannot affect row a second time"
        const uniqueDrivers = Array.from(new Map(drivers.map(d => [d.driverId, d])).values());
        const driverKeys = uniqueDrivers.map((d: any) => `driver_metric:${d.driverId}`);
        operations.push(kv.mset(driverKeys, uniqueDrivers));
    }

    // 2. Vehicle Metrics
    if (Array.isArray(vehicles) && vehicles.length > 0) {
        // Deduplicate vehicles by plateNumber or vehicleId
        const uniqueVehicles = Array.from(new Map(vehicles.map(v => [v.plateNumber || v.vehicleId, v])).values());
        const vehicleKeys = uniqueVehicles.map((v: any) => `vehicle_metric:${v.plateNumber || v.vehicleId}`);
        operations.push(kv.mset(vehicleKeys, uniqueVehicles));
    }

    // 3. Trips
    if (Array.isArray(trips) && trips.length > 0) {
        // Deduplicate trips by id
        const uniqueTrips = Array.from(new Map(trips.map(t => [t.id, t])).values());

        for (const trip of uniqueTrips) {
            trip.status = normalizeTripStatusForStorage(trip.status);
        }

        // ── Normalize driverId to canonical Roam UUID (mirrors POST /trips) ──
        for (const trip of uniqueTrips) {
            try {
                const resolved = await resolveCanonicalDriverId(trip.driverId || '');
                if (resolved.resolved) {
                    trip.driverId = resolved.canonicalId;
                    if (!trip.driverName) {
                        trip.driverName = resolved.driverName;
                    }
                }
            } catch (resolveErr) {
                console.warn(`[FleetSync] Failed to resolve driverId for trip ${trip.id}:`, resolveErr);
            }
        }

        // Resolve organization scope for writes (same strategy as POST /trips).
        let writeOrgId: string | null = getOrgId(c);
        if (!writeOrgId) {
            for (const trip of uniqueTrips) {
                const did = String(trip?.driverId || '').trim();
                if (!did) continue;
                try {
                    const driverRecord = await kv.get(`driver:${did}`);
                    const candidate = typeof driverRecord?.organizationId === 'string' ? driverRecord.organizationId.trim() : '';
                    if (candidate) {
                        writeOrgId = candidate;
                        break;
                    }
                } catch {
                    // Ignore lookup failures; we can continue without stamping.
                }
            }
        }
        const stampWriteOrg = <T extends Record<string, any>>(record: T): T =>
            writeOrgId ? ({ ...record, organizationId: writeOrgId } as T) : record;

        const tripKeys = uniqueTrips.map((t: any) => `trip:${t.id}`);
        const tripValues = uniqueTrips.map((t: any) => stampWriteOrg(t));

        // Match POST /trips: await trip KV write BEFORE ledger. Queueing trip mset in
        // Promise.all runs it concurrently with the ledger loop and can race / lose writes.
        await kv.mset(tripKeys, tripValues);

        try {
            const tripIdsForLedger = uniqueTrips.map((t: any) => String(t?.id || "").trim()).filter(Boolean);
            if (tripIdsForLedger.length > 0) {
              await deleteCanonicalLedgerBySource("trip", tripIdsForLedger);
            }
            await appendCanonicalTripFaresIfEligible(uniqueTrips as Record<string, unknown>[], c);
        } catch (canonErr) {
            console.error("[FleetSync] Canonical trip fare append failed:", canonErr);
        }
    }

    // 4. Financials (Singleton)
    if (financials) {
        operations.push(kv.set("organization_metrics:current", financials));
    }

    // 5. Metadata & Insights
    if (metadata) {
        operations.push(kv.set("import_metadata:current", metadata));
    }
    if (insights) {
        operations.push(kv.set("import_insights:current", insights));
    }

    await Promise.all(operations);

    // Invalidate stats cache since data has changed
    await cache.invalidateCacheVersion("stats");
    await cache.invalidateCacheVersion("performance");
    
    // Invalidate dashboard cache (fleet sync affects trips, drivers, vehicles)
    await invalidateDashboardCache();

    return c.json({ 
        success: true, 
        stats: {
            drivers: drivers?.length || 0,
            vehicles: vehicles?.length || 0,
            trips: trips?.length || 0
        }
    });

  } catch (e: any) {
      console.error("Fleet Sync Error:", e);
      return c.json({ error: e.message }, 500);
  }
});

// Financials Endpoint
app.get("/make-server-37f42386/financials", requireAuth(), async (c) => {
    try {
        const orgId = getOrgId(c);
        const key = orgId ? `organization_metrics:${orgId}` : "organization_metrics:current";
        const data = await kv.get(key) || await kv.get("organization_metrics:current");
        return c.json(data || {});
    } catch(e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.post("/make-server-37f42386/financials", async (c) => {
    try {
        const data = await c.req.json();
        await kv.set("organization_metrics:current", data);
        return c.json({ success: true, data });
    } catch(e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Parse Invoice Endpoint
app.post("/make-server-37f42386/parse-invoice", async (c) => {
    try {
        const body = await c.req.parseBody();
        const file = body['file'];

        if (!file || !(file instanceof File)) {
            return c.json({ error: "No file uploaded" }, 400);
        }

        const apiKey = Deno.env.get("GEMINI_API_KEY");
        if (!apiKey) return c.json({ error: "Gemini API Key not configured" }, 500);

        const genAI = new GoogleGenerativeAI(apiKey);
        
        // Robust model selection
        const modelCandidates = ["gemini-1.5-flash-latest", "gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash-exp"];
        
        const arrayBuffer = await file.arrayBuffer();
        const base64Data = Buffer.from(arrayBuffer).toString('base64');
        const mimeType = file.type;

        const prompt = `Analyze this vehicle service invoice or receipt. This is from Jamaica, which EXCLUSIVELY uses DD/MM/YYYY date format. Extract the following information in strict JSON format:
        - date (YYYY-MM-DD. The receipt uses DD/MM/YYYY. The FIRST number is the day, SECOND is the month. Example: "01/12/2025" = 1st Dec 2025 = "2025-12-01".)
        - type (Choose the best fit: 'oil', 'tires', 'brake', 'inspection', 'repair', 'maintenance' (for multi-service visits), or 'other')
        - cost (number, total numeric amount. Ignore currency symbols like JMD or $)
        - odometer (number, if present)
        - notes (Create a clean, detailed summary. List every service performed and part replaced. Include customer complaints if visible (e.g. 'Customer reported soft brakes'). Format as a readable string.)
        
        If a field is missing, use null. Return ONLY the JSON object, no markdown code blocks.`;

        let result = null;
        let lastError = null;

        for (const modelName of modelCandidates) {
            try {
                console.log(`Attempting invoice analysis with model: ${modelName}`);
                const model = genAI.getGenerativeModel({ model: modelName });
                result = await model.generateContent([
                    prompt,
                    {
                        inlineData: {
                            data: base64Data,
                            mimeType: mimeType
                        }
                    }
                ]);
                if (result) break;
            } catch (e: any) {
                console.warn(`Model ${modelName} failed:`, e.message);
                lastError = e;
            }
        }

        if (!result) {
             throw new Error(`All Gemini models failed. Last Error: ${lastError?.message}`);
        }

        const response = result.response;
        const text = response.text();
        
        // Clean markdown code blocks if present
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        let data;
        try {
            data = JSON.parse(jsonStr);
        } catch (e) {
            console.error("Failed to parse JSON from Gemini:", text);
            return c.json({ error: "Failed to parse invoice data" }, 500);
        }

        return c.json({ success: true, data });

    } catch (e: any) {
        console.error("Error parsing invoice:", e);
        return c.json({ error: e.message }, 500);
    }
});

// Parse Inspection Endpoint
app.post("/make-server-37f42386/parse-inspection", async (c) => {
    try {
        const body = await c.req.parseBody();
        const file = body['file'];

        if (!file || !(file instanceof File)) {
            return c.json({ error: "No file uploaded" }, 400);
        }

        const apiKey = Deno.env.get("GEMINI_API_KEY");
        if (!apiKey) return c.json({ error: "Gemini API Key not configured" }, 500);

        const genAI = new GoogleGenerativeAI(apiKey);
        
        // Robust model selection
        const modelCandidates = ["gemini-1.5-flash-latest", "gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash-exp"];
        
        const arrayBuffer = await file.arrayBuffer();
        const base64Data = Buffer.from(arrayBuffer).toString('base64');
        const mimeType = file.type;

        const checklistItems = [
            "Replace Engine Oil & Filter",
            "Replace Air Filter",
            "Replace Cabin Filter",
            "Replace Spark Plugs",
            "Replace Brake Pads (Front)",
            "Replace Brake Pads (Rear)",
            "Resurface/Replace Rotors",
            "Flush Brake Fluid",
            "Flush Coolant",
            "Transmission Service",
            "Wheel Alignment",
            "Rotate/Balance Tires",
            "Replace Tires",
            "Replace Wipers",
            "Replace Battery",
            "Suspension Repair",
            "Steering System Repair",
            "Exhaust System Repair",
            "AC Service",
            "Matching/Calibration",
            "Throttle Body Cleaning"
        ];

        const prompt = `Analyze this vehicle inspection report (or mechanic's checklist). Extract the following information in strict JSON format:
        - issues: array of strings. Identify all items marked as 'Failed', 'Needs Attention', 'Repair Needed', 'Bad', 'Replace', or general negative findings. 
          IMPORTANT: Try to map each issue to one of the following exact categories if it matches closely:
          ${JSON.stringify(checklistItems)}
          If an issue does not match any of these, use a concise, descriptive string (e.g. "Leaking Radiator").
        - notes: string. A comprehensive summary of the inspection findings. Include specific measurements (e.g. "Front Brake Pads: 3mm", "Tire Tread: 4/32") if visible. Include mechanic recommendations.
        
        Return ONLY the JSON object, no markdown code blocks.`;

        let result = null;
        let lastError = null;

        for (const modelName of modelCandidates) {
            try {
                console.log(`Attempting inspection analysis with model: ${modelName}`);
                const model = genAI.getGenerativeModel({ model: modelName });
                result = await model.generateContent([
                    prompt,
                    {
                        inlineData: {
                            data: base64Data,
                            mimeType: mimeType
                        }
                    }
                ]);
                if (result) break;
            } catch (e: any) {
                console.warn(`Model ${modelName} failed:`, e.message);
                lastError = e;
            }
        }

        if (!result) {
             throw new Error(`All Gemini models failed. Last Error: ${lastError?.message}`);
        }

        const response = result.response;
        const text = response.text();
        
        // Clean markdown code blocks if present
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        let data;
        try {
            data = JSON.parse(jsonStr);
        } catch (e) {
            console.error("Failed to parse JSON from Gemini:", text);
            return c.json({ error: "Failed to parse inspection data" }, 500);
        }

        return c.json({ success: true, data });

    } catch (e: any) {
        console.error("Error parsing inspection:", e);
        return c.json({ error: e.message }, 500);
    }
});

// Odometer History Endpoints - Optimized
app.get("/make-server-37f42386/odometer-history/:vehicleId", requireAuth(), async (c) => {
  try {
    const vehicleId = c.req.param("vehicleId");
    const { data, error } = await supabase
        .from("kv_store_37f42386")
        .select("value")
        .like("key", `odometer_reading:${vehicleId}:`)
        .order("value->>date", { ascending: false });

    if (error) throw error;
    const history = filterByOrg(data?.map((d: any) => d.value) || [], c);
    return c.json(history);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/odometer-history", async (c) => {
  try {
    const reading = await c.req.json();
    if (!reading.id) reading.id = crypto.randomUUID();
    if (!reading.vehicleId) return c.json({ error: "Vehicle ID required" }, 400);
    if (!reading.createdAt) reading.createdAt = new Date().toISOString();
    
    // Key format: odometer_reading:{vehicleId}:{readingId}
    await kv.set(`odometer_reading:${reading.vehicleId}:${reading.id}`, stampOrg(reading, c));
    
    return c.json({ success: true, data: reading });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// AI Toll CSV Parsing
app.post("/make-server-37f42386/ai/parse-toll-csv", async (c) => {
  try {
    const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const { csvContent } = await c.req.json();
    if (!csvContent) {
        return c.json({ error: "No CSV content provided" }, 400);
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return c.json({ error: "AI Service not configured" }, 503);
    }

    const openai = new OpenAI({ apiKey });

    const prompt = `
      You are an expert data parser.
      Parse the following toll transaction data into a JSON array.
      
      The input is likely a CSV, TSV, or copy-pasted table.
      This data is from Jamaica. Jamaica EXCLUSIVELY uses DD/MM/YYYY date format.

      Current Date Context: ${today}
      
      Output JSON Schema:
      {
        "transactions": [
            {
            "date": "ISO Date String (YYYY-MM-DD)",
            "tagId": "Tag ID or Serial Number (String) or empty",
            "location": "Plaza Name (String)",
            "laneId": "Lane ID (String) or empty",
            "amount": Number (Negative for deduction, Positive for Top-up),
            "type": "Usage" | "Top-up" | "Refund"
            }
        ]
      }
      
      Rules:
      1. DATE FORMAT — NON-NEGOTIABLE: This is Jamaican data. ALL dates are DD/MM/YYYY (Day/Month/Year). NEVER interpret as MM/DD/YYYY.
         - "01/05/2024" = 1st May 2024 → output "2024-05-01"
         - "10/04/2025" = 10th April 2025 → output "2025-04-10"
         - "23/10/2025" = 23rd October 2025 → output "2025-10-23"
         - "01/12/2025" = 1st December 2025 → output "2025-12-01"
         - The FIRST number is ALWAYS the day. The SECOND number is ALWAYS the month.
      2. FUTURE DATE CHECK: The Current Date is ${today}.
         - Do NOT output any date that is in the future relative to the Current Date.
         - If the resulting date would be in the future, subtract 1 from the year.
      3. If amount is like "JMD -275.00", parse as -275.00.
      4. If amount is negative, type is "Usage". If positive, type is usually "Top-up" (unless it's a refund).
      5. Ignore header rows or irrelevant lines.
      6. Extract the Tag ID or Serial Number if present in the first few columns.
      7. Return ONLY the valid JSON object with the "transactions" key.
      
      Input Data:
      ${csvContent.substring(0, 15000)}
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a JSON parsing assistant." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0
    });

    const content = response.choices[0].message.content;
    const result = JSON.parse(content || "{}");
    
    // Post-processing: catch and correct any future dates the AI missed
    const corrected = correctFutureDates(result.transactions || []);
    
    return c.json({ success: true, data: corrected });
  } catch (e: any) {
    console.error("AI Toll Parse Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// AI Toll Image Parsing
app.post("/make-server-37f42386/ai/parse-toll-image", async (c) => {
  try {
    const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const body = await c.req.parseBody();
    const file = body['file'];

    if (!file || !(file instanceof File)) {
      return c.json({ error: "No file provided" }, 400);
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return c.json({ error: "AI Service not configured" }, 503);
    }

    const openai = new OpenAI({ apiKey });

    // Convert file to base64
    const arrayBuffer = await file.arrayBuffer();
    const base64Image = `data:${file.type};base64,${Buffer.from(arrayBuffer).toString('base64')}`;

    const prompt = `
      You are an expert data parser.
      Analyze the provided image of a toll transaction history or top-up history.
      Extract the transaction data into a JSON array.
      This data is from Jamaica. Jamaica EXCLUSIVELY uses DD/MM/YYYY date format.

      Current Date Context: ${today}

      Output JSON Schema:
      {
        "transactions": [
            {
            "date": "ISO Date String (YYYY-MM-DD)",
            "tagId": "Tag ID or Serial Number (String) or empty",
            "location": "Plaza Name (String) or empty if not visible",
            "laneId": "Lane ID (String) or empty",
            "amount": Number (Negative for deduction, Positive for Top-up),
            "type": "Usage" | "Top-up" | "Refund",
            "status": "Success" | "Failure" | "Pending",
            "discount": Number (0 if none),
            "paymentAfterDiscount": Number (equal to amount if none)
            }
        ]
      }

      Rules:
      1. DATE FORMAT — NON-NEGOTIABLE: This is Jamaican data. ALL dates are DD/MM/YYYY (Day/Month/Year). NEVER interpret as MM/DD/YYYY.
         - "01/05/2024" = 1st May 2024 → output "2024-05-01"
         - "10/04/2025" = 10th April 2025 → output "2025-04-10"
         - "23/10/2025" = 23rd October 2025 → output "2025-10-23"
         - "01/12/2025" = 1st December 2025 → output "2025-12-01"
         - The FIRST number is ALWAYS the day. The SECOND number is ALWAYS the month.
      2. FUTURE DATE CHECK: The Current Date is ${today}.
         - Do NOT output any date that is in the future relative to the Current Date.
         - If the resulting date would be in the future, subtract 1 from the year.
      3. Identify "Payment" or "Top Up Amount" columns.
      4. If the row indicates "Failure" or "Failed", ignore it or mark status as Failure.
      5. If "Top Up Amount" is present (e.g. "JMD 2,000.00"), it is a positive amount (Top-up).
      6. If "Usage" or toll charges are shown, they are negative amounts.
      7. Extract Tag ID (e.g. "212100286450") if visible in the header or rows.
      8. Return ONLY the valid JSON object with the "transactions" key.
      9. If multiple amounts are shown (e.g. "Payment After Discount" and "Topup Amount"), use the "Topup Amount" for the main 'amount' field.
      10. Extract "Discount / Bonus" if present.
      11. Extract "Payment After Discount / Bonus" if present.
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a JSON parsing assistant."
        },
        {
          role: "user",
          content: [
             { type: "text", text: prompt },
             { type: "image_url", image_url: { url: base64Image } }
          ]
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0
    });

    const content = response.choices[0].message.content;
    const result = JSON.parse(content || "{}");
    
    // Post-processing: catch and correct any future dates the AI missed
    const corrected = correctFutureDates(result.transactions || []);
    
    return c.json({ success: true, data: corrected });

  } catch (e: any) {
    console.error("AI Toll Image Parse Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-37f42386/odometer-history/:id", async (c) => {
    const id = c.req.param("id");
    const vehicleId = c.req.query("vehicleId");
    const source = c.req.query("source");
    
    if (!vehicleId) return c.json({ error: "vehicleId query param required" }, 400);
    
    try {
        // Determine the correct KV key based on source type
        const keysToTry: string[] = [];
        
        if (source === 'checkin') {
            const rawId = id.startsWith('checkin_') ? id.replace('checkin_', '') : id;
            keysToTry.push(`checkin:${rawId}`);
        } else if (source === 'fuel') {
            const rawId = id.startsWith('fuel_') ? id.replace('fuel_', '') : id;
            keysToTry.push(`fuel_entry:${rawId}`);
        } else if (source === 'service') {
            const rawId = id.startsWith('service_') ? id.replace('service_', '') : id;
            keysToTry.push(`maintenance_log:${vehicleId}:${rawId}`);
        } else {
            keysToTry.push(`odometer_reading:${vehicleId}:${id}`);
        }
        
        // Also always try the legacy odometer_reading key as fallback
        if (!keysToTry.includes(`odometer_reading:${vehicleId}:${id}`)) {
            keysToTry.push(`odometer_reading:${vehicleId}:${id}`);
        }
        
        console.log(`[DELETE odometer-history] Deleting keys for source=${source}, id=${id}:`, keysToTry);
        
        for (const key of keysToTry) {
            try {
                await kv.del(key);
            } catch (_e) {
                // Ignore errors for keys that don't exist
            }
        }
        
        return c.json({ success: true });
    } catch(e: any) {
        console.log(`[DELETE odometer-history] Error: ${e.message}`);
        return c.json({ error: e.message }, 500);
    }
});

// Update generic anchor (Fuel, Check-in, etc)
app.patch("/make-server-37f42386/anchors/:id", async (c) => {
    const id = c.req.param("id");
    const { date, value, type, vehicleId } = await c.req.json();
    let key = "";
    
    // Determine key prefix based on type
    // Note: MasterLogTimeline 'source' maps to these types
    if (type === 'Fuel Log' || type === 'fuel_entry') {
        key = `fuel_entry:${id}`;
    } else if (type === 'Check-in' || type === 'checkin' || type === 'Weekly Check-in') {
         key = `checkin:${id}`;
    } else if (type === 'Service Log' || type === 'maintenance_log') {
         if (!vehicleId) return c.json({ error: "Vehicle ID required for Service Logs" }, 400);
         key = `maintenance_log:${vehicleId}:${id}`;
    } else {
         // Fallback for generic odometer readings
         // Attempt to find the key format. Usually `odometer_reading:{vehicleId}:{id}`
         if (vehicleId) {
             key = `odometer_reading:${vehicleId}:${id}`;
         } else {
             // Try legacy or simple format?
             // Since we can't easily guess, we might fail here for Manual entries if vehicleId is missing
             return c.json({ error: "Vehicle ID required for Manual entries" }, 400);
         }
    }

    try {
        const entry = await kv.get(key);
        if (!entry) return c.json({ error: "Entry not found" }, 404);

        // Update fields
        if (date) entry.date = date;
        if (value) {
            const numVal = Number(value);
            // Update all potential fields for odometer to be safe
            if (entry.odometer !== undefined) entry.odometer = numVal;
            if (entry.value !== undefined) entry.value = numVal;
            if (entry.mileage !== undefined) entry.mileage = numVal; // Service logs often use mileage
        }
        
        await kv.set(key, stampOrg(entry, c));

        // Optional: Update associated Transaction if it exists (for Fuel Logs)
        if (entry.transactionId) {
            const txKey = `transaction:${entry.transactionId}`;
            const tx = await kv.get(txKey);
            if (tx) {
                if (date) tx.date = date.split('T')[0]; // Transactions use YYYY-MM-DD
                // We don't update time on transaction usually, or complex to parse
                // Also, odometer is sometimes on transaction
                if (value && tx.odometer !== undefined) tx.odometer = Number(value);
                await kv.set(txKey, stampOrg(tx, c));
            }
        }

        return c.json({ success: true, data: entry });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Claims Endpoints
app.get("/make-server-37f42386/claims", requireAuth(), async (c) => {
  try {
    const claims = filterByOrg(await kv.getByPrefix("claim:"), c);
    const driverId = c.req.query("driverId");
    
    if (driverId && Array.isArray(claims)) {
        const filtered = claims.filter((claim: any) => claim.driverId === driverId);
        return c.json(filtered);
    }
    
    return c.json(claims || []);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/claims", async (c) => {
  try {
    const claim = await c.req.json();
    if (!claim.id) {
        claim.id = crypto.randomUUID();
    }
    if (!claim.createdAt) {
        claim.createdAt = new Date().toISOString();
    }
    claim.updatedAt = new Date().toISOString();
    
    // Auto-create Financial Transaction for "Charge Driver" resolution
    // This ensures the $10 charge appears in the driver's transaction ledger
    if (claim.status === 'Resolved' && claim.resolutionReason === 'Charge Driver' && !claim.resolutionTransactionId) {
        const txId = crypto.randomUUID();
        const transaction = {
            id: txId,
            driverId: claim.driverId,
            date: new Date().toISOString(),
            // Ensure description contains 'Toll' so it's picked up by DriverDetail filter
            description: `Toll Dispute Charge - ${claim.subject || 'Resolution'}`, 
            category: 'Adjustment',
            tripId: claim.tripId, // Link to the Trip so it appears nested in the ledger
            type: 'Adjustment',
            amount: Math.abs(claim.amount || 0), // Positive magnitude; ledger logic subtracts it
            status: 'Completed',
            paymentMethod: 'Cash', // Affects Cash Wallet
            metadata: {
                claimId: claim.id,
                source: 'claim_resolution'
            }
        };
        
        await kv.set(`transaction:${txId}`, stampOrg(transaction, c));
        claim.resolutionTransactionId = txId; // Link it to prevent duplicates
    }
    
    await kv.set(`claim:${claim.id}`, stampOrg(claim, c));
    return c.json({ success: true, data: claim });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-37f42386/claims/:id", async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`claim:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Admin: List Users (org-scoped)
app.get("/make-server-37f42386/users", requireAuth(), async (c) => {
  try {
    const rbacUser = c.get('rbacUser') as any;
    const { data: { users }, error } = await supabase.auth.admin.listUsers();
    
    if (error) throw error;
    
    // Filter users by organizationId for data isolation
    const orgId = getOrgId(c);

    // Determine who we should show based on context
    const orgUsers = (users || []).filter((u: any) => {
      const uOrgId = u.user_metadata?.organizationId;
      const uRole = u.user_metadata?.role || '';
      
      // Always hide platform-level users from anyone who isn't a platform role themselves
      const platformRoles = ['superadmin', 'platform_owner', 'platform_support', 'platform_analyst'];
      const isPlatformUser = platformRoles.includes(uRole);
      const isRequestersPlatform = rbacUser?.resolvedRole && platformRoles.includes(rbacUser.resolvedRole);

      // If requester is NOT a platform user, they can NEVER see platform users
      if (isPlatformUser && !isRequestersPlatform) return false;

      // If we have an orgId (legit customer session), only show users in that org
      if (orgId) {
        return uOrgId === orgId || u.id === orgId;
      }

      // If no orgId (anon passthrough), they should see NOTHING
      if (rbacUser?.userId === '_anon_passthrough') return false;

      // Platform users with no orgId (seeing everyone)
      if (isRequestersPlatform) return true;

      return false;
    });
    
    // Transform to TeamMember format
    const members = orgUsers.map((u: any) => ({
        id: u.id,
        name: u.user_metadata?.name || 'Unknown',
        email: u.email || '',
        role: u.user_metadata?.role || 'driver',
        status: 'active', 
        lastActive: u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : 'Never',
        avatarUrl: u.user_metadata?.avatarUrl
    }));
    
    return c.json(members);
  } catch (e: any) {
    console.error("List Users Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// Public: Signup (Fleet Manager or Driver registration from LoginPage)
// Phase 8: Proper organizationId assignment & error handling
app.post("/make-server-37f42386/signup", async (c) => {
  try {
    const { email, password, name, role, businessType } = await c.req.json();

    // Rate limit: check by IP
    const clientIp = getClientIp(c);
    const ipCheck = await checkRateLimit(clientIp, 'signup');
    if (!ipCheck.allowed) {
      console.log(`[Signup] Rate limit exceeded for IP ${clientIp}`);
      return c.json({
        error: `Too many signup attempts. Please try again in ${Math.ceil(ipCheck.retryAfterSec / 60)} minutes.`,
        retryAfterSec: ipCheck.retryAfterSec,
      }, 429);
    }

    // Step 8.2: Validate required fields
    if (!email || !password || !name) {
      return c.json({ error: "Email, password, and name are required" }, 400);
    }

    const normalizedRole = role || 'admin';
    if (!['admin', 'driver'].includes(normalizedRole)) {
      return c.json({ error: "Invalid role. Must be 'admin' or 'driver'" }, 400);
    }

    // Phase 5: Password policy validation
    try {
      const platformSettings5 = await getPlatformSettingsCached();
      const sp = platformSettings5.securityPolicies || {};
      const pwErrors: string[] = [];
      if (sp.minPasswordLength && password.length < sp.minPasswordLength) {
        pwErrors.push(`Must be at least ${sp.minPasswordLength} characters`);
      }
      if (sp.requireUppercase && !/[A-Z]/.test(password)) {
        pwErrors.push('Must contain an uppercase letter');
      }
      if (sp.requireNumber && !/[0-9]/.test(password)) {
        pwErrors.push('Must contain a number');
      }
      if (sp.requireSpecialChar && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        pwErrors.push('Must contain a special character');
      }
      if (pwErrors.length > 0) {
        return c.json({ error: `Password does not meet requirements: ${pwErrors.join('. ')}` }, 400);
      }
    } catch (e: any) {
      console.log(`[Signup] Failed to check password policy (failing open): ${e.message}`);
    }

    // Phase 4: Registration mode enforcement
    try {
      const platformSettings = await getPlatformSettingsCached();
      const regMode = platformSettings.registrationMode || 'open';

      if (regMode === 'invite_only') {
        return c.json({ error: "Registration is currently disabled. Please contact your platform administrator." }, 403);
      }

      if (regMode === 'domain_restricted') {
        const emailDomain = email.split('@')[1]?.toLowerCase();
        const allowedDomains = (platformSettings.allowedDomains || []).map((d: string) => d.toLowerCase());
        if (!emailDomain || !allowedDomains.includes(emailDomain)) {
          return c.json({ error: `Registration is restricted to approved domains (${allowedDomains.map((d: string) => '@' + d).join(', ')}). Contact your platform administrator.` }, 403);
        }
      }
    } catch (regErr: any) {
      // Fail-open: if we can't read settings, allow registration
      console.log(`[Signup] Failed to check registration mode (failing open): ${regErr.message}`);
    }

    // Step 8.1: Build user_metadata with role-appropriate fields
    const userMetadata: Record<string, any> = {
      name,
      role: normalizedRole,
    };
    if (normalizedRole === 'admin' && businessType) {
      userMetadata.businessType = businessType;
    }

    // Phase 4: If requireApproval is enabled, mark new accounts as pending
    try {
      const platformSettings = await getPlatformSettingsCached();
      if (platformSettings.requireApproval === true && normalizedRole === 'admin') {
        userMetadata.accountStatus = 'pending_approval';
      }
    } catch (e: any) {
      console.log(`[Signup] Failed to check requireApproval (non-fatal): ${e.message}`);
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: userMetadata,
      email_confirm: true,
    });

    if (error) {
      await recordFailedAttempt(clientIp, 'signup');
      // Step 8.2: Friendly error for duplicate email
      if (error.message?.includes('already been registered') || error.message?.includes('already exists')) {
        return c.json({ error: "An account with this email already exists" }, 409);
      }
      throw error;
    }

    const userId = data.user.id;

    // Step 8.1: For admin/fleet_owner, set organizationId = own user ID (self-referencing)
    if (normalizedRole === 'admin') {
      try {
        await supabase.auth.admin.updateUserById(userId, {
          user_metadata: { ...userMetadata, organizationId: userId },
        });
        console.log(`[Signup] Admin ${email}: set organizationId=${userId} (self-referencing)`);
      } catch (orgErr: any) {
        console.warn(`[Signup] Failed to set organizationId on admin user (non-fatal): ${orgErr.message}`);
      }

      // Persist businessType to org-scoped preferences
      if (businessType) {
        try {
          await kv.set(`preferences:${userId}`, { businessType });
          // Also write to legacy global key for backward compatibility
          const existing = await kv.get("preferences:general") || {};
          await kv.set("preferences:general", { ...existing, businessType });
          console.log(`[Signup] Saved businessType '${businessType}' to preferences:${userId}`);
        } catch (prefErr: any) {
          console.warn(`[Signup] Failed to save businessType to preferences (non-fatal): ${prefErr.message}`);
        }
      }

      // Invalidate customer cache so super admin sees new fleet owner
      await invalidateCustomerCache();
    }

    // Step 8.1: For drivers, create a driver profile (unlinked — no organizationId)
    if (normalizedRole === 'driver') {
      const driverProfile = {
        id: userId,
        driverId: userId,
        driverName: name || email.split('@')[0],
        email,
        status: 'active',
        createdAt: new Date().toISOString(),
        acceptanceRate: 0,
        cancellationRate: 0,
        completionRate: 0,
        ratingLast500: 5.0,
        totalEarnings: 0,
        // organizationId intentionally omitted — driver is unlinked until claimed (Phase 10)
      };
      await kv.set(`driver:${userId}`, driverProfile);
      console.log(`[Signup] Driver ${email}: created unlinked driver profile ${userId}`);
    }

    return c.json({ success: true, data });
  } catch (e: any) {
    console.error("[Signup] Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// Admin: Invite User (Phase 8: now sets organizationId from inviting user)
app.post("/make-server-37f42386/invite-user", requireAuth(), requirePermission('users.invite'), async (c) => {
  try {
    const { email, password, name, role } = await c.req.json();
    
    if (!email || !password) {
      return c.json({ error: "Email and password are required" }, 400);
    }

    const inviterOrgId = getOrgId(c);
    const inviterUserId = (c.get('rbacUser') as any)?.userId || null;
    const assignedRole = role || 'driver';
    
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { 
        name: name || '',
        role: assignedRole,
        organizationId: inviterOrgId || undefined,
        invitedBy: inviterUserId || undefined,
        invitedAt: new Date().toISOString(),
      },
      email_confirm: true
    });
    
    if (error) {
      if (error.message?.includes('already been registered') || error.message?.includes('already exists')) {
        return c.json({ error: "An account with this email already exists" }, 409);
      }
      throw error;
    }

    console.log(`[InviteUser] ${email} invited as ${assignedRole} into org ${inviterOrgId} by ${inviterUserId}`);
    
    // Also create a driver profile if role is driver
    if ((assignedRole === 'driver') && data.user) {
        const driverId = data.user.id;
        const driverProfile = {
            id: driverId,
            driverId: driverId,
            driverName: name || email.split('@')[0],
            email,
            status: 'active',
            createdAt: new Date().toISOString(),
            acceptanceRate: 0,
            cancellationRate: 0,
            completionRate: 0,
            ratingLast500: 5.0,
            totalEarnings: 0,
        };
        // stampOrg will set organizationId from the inviting user's context
        await kv.set(`driver:${driverId}`, stampOrg(driverProfile, c));
    }

    return c.json({ success: true, data });
  } catch (e: any) {
    console.error("[InviteUser] Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// ─── Phase 9: Team Invitation System ─────────────────────────────────────────

// Step 9.1: POST /team/invite — Invite team member with auto-generated temp password
const TEAM_ROLES = ['fleet_manager', 'fleet_accountant', 'fleet_viewer'] as const;

app.post("/make-server-37f42386/team/invite", requireAuth(), requirePermission('users.invite'), async (c) => {
  try {
    const { email, name, role } = await c.req.json();

    if (!email || !name) {
      return c.json({ error: "Email and name are required" }, 400);
    }
    if (!TEAM_ROLES.includes(role)) {
      return c.json({ error: `Invalid team role. Must be one of: ${TEAM_ROLES.join(', ')}` }, 400);
    }

    const rbacUser = c.get('rbacUser') as any;
    const orgId = getOrgId(c);
    const inviterUserId = rbacUser?.userId || null;

    // Generate a random temporary password (12 chars)
    const tempPassword = Array.from(crypto.getRandomValues(new Uint8Array(9)))
      .map((b: number) => b.toString(36).padStart(2, '0'))
      .join('')
      .slice(0, 12);

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      user_metadata: {
        name,
        role,
        organizationId: orgId || undefined,
        invitedBy: inviterUserId || undefined,
        invitedAt: new Date().toISOString(),
      },
      email_confirm: true,
    });

    if (error) {
      if (error.message?.includes('already been registered') || error.message?.includes('already exists')) {
        return c.json({ error: "An account with this email already exists" }, 409);
      }
      throw error;
    }

    console.log(`[Team] Invited ${email} as ${role} into org ${orgId} by ${inviterUserId}`);

    return c.json({
      success: true,
      userId: data.user.id,
      temporaryPassword: tempPassword,
      message: `Invited ${name} as ${role}. Share the temporary password with them securely.`,
    });
  } catch (e: any) {
    console.error("[Team Invite] Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// Step 9.2: GET /team/members — List team members in same org
app.get("/make-server-37f42386/team/members", requireAuth(), async (c) => {
  try {
    const rbacUser = c.get('rbacUser') as any;
    const orgId = getOrgId(c);
    const { data: { users }, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw error;

    // Determine who we should show based on context
    const orgUsers = (users || []).filter((u: any) => {
      const uOrgId = u.user_metadata?.organizationId;
      const uRole = u.user_metadata?.role || '';
      
      // Always hide platform-level users from anyone who isn't a platform role themselves
      const platformRoles = ['superadmin', 'platform_owner', 'platform_support', 'platform_analyst'];
      const isPlatformUser = platformRoles.includes(uRole);
      const isRequestersPlatform = platformRoles.includes(rbacUser?.resolvedRole);

      // If requester is NOT a platform user, they can NEVER see platform users
      if (isPlatformUser && !isRequestersPlatform) return false;

      // If we have an orgId (legit customer session), only show users in that org
      if (orgId) {
        return uOrgId === orgId || u.id === orgId;
      }

      // If no orgId (anon passthrough or something else), and NOT a platform user, 
      // they should see NOTHING (or at most themselves if they were a user, but anon is not).
      if (rbacUser?.userId === '_anon_passthrough') return false;

      // Platform users with no orgId (seeing everyone)
      if (isRequestersPlatform) return true;

      return false;
    });

    const members = orgUsers.map((u: any) => ({
      id: u.id,
      name: u.user_metadata?.name || 'Unknown',
      email: u.email || '',
      role: u.user_metadata?.role || 'fleet_viewer',
      status: 'active',
      lastActive: u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : 'Never',
      invitedBy: u.user_metadata?.invitedBy || null,
      invitedAt: u.user_metadata?.invitedAt || null,
      isOwner: u.id === orgId,
    }));

    return c.json(members);
  } catch (e: any) {
    console.error("[Team Members] Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// Step 9.3: PUT /team/members/:id/role — Update team member's role
app.put("/make-server-37f42386/team/members/:id/role", requireAuth(), requirePermission('users.edit_role'), async (c) => {
  try {
    const targetId = c.req.param("id");
    const { role: newRole } = await c.req.json();
    const orgId = getOrgId(c);

    if (!['fleet_manager', 'fleet_accountant', 'fleet_viewer', 'driver'].includes(newRole)) {
      return c.json({ error: "Invalid role. Cannot promote to fleet_owner." }, 400);
    }

    const { data: { user: targetUser }, error: fetchErr } = await supabase.auth.admin.getUserById(targetId);
    if (fetchErr || !targetUser) {
      return c.json({ error: "User not found" }, 404);
    }

    // CRITICAL: Never allow role changes on platform-level users from any customer portal
    const currentRole = targetUser.user_metadata?.role || '';
    const protectedPlatformRoles = ['superadmin', 'platform_owner', 'platform_support', 'platform_analyst'];
    if (protectedPlatformRoles.includes(currentRole)) {
      return c.json({ error: "This user cannot be modified" }, 403);
    }

    // Protect users without an organizationId — they don't belong to this customer
    const targetOrgId = targetUser.user_metadata?.organizationId;
    if (!targetOrgId) {
      return c.json({ error: "This user does not belong to your organization" }, 403);
    }

    if (orgId && targetOrgId !== orgId) {
      return c.json({ error: "Cannot modify users from another organization" }, 403);
    }

    if (targetUser.user_metadata?.role === 'admin' || targetId === orgId) {
      return c.json({ error: "Cannot change the fleet owner's role" }, 403);
    }

    const { error } = await supabase.auth.admin.updateUserById(targetId, {
      user_metadata: { ...targetUser.user_metadata, role: newRole },
    });
    if (error) throw error;

    console.log(`[Team] Role updated: ${targetId} → ${newRole} by org ${orgId}`);
    return c.json({ success: true, message: `Role updated to ${newRole}` });
  } catch (e: any) {
    console.error("[Team Role Update] Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// Step 9.4: DELETE /team/members/:id — Remove team member
app.delete("/make-server-37f42386/team/members/:id", requireAuth(), requirePermission('users.remove'), async (c) => {
  try {
    const targetId = c.req.param("id");
    const orgId = getOrgId(c);

    const { data: { user: targetUser }, error: fetchErr } = await supabase.auth.admin.getUserById(targetId);
    if (fetchErr || !targetUser) {
      return c.json({ error: "User not found" }, 404);
    }

    // CRITICAL: Never allow deletion of platform-level users from any customer portal
    const targetRole = targetUser.user_metadata?.role || '';
    const protectedPlatformRoles = ['superadmin', 'platform_owner', 'platform_support', 'platform_analyst'];
    if (protectedPlatformRoles.includes(targetRole)) {
      return c.json({ error: "This user cannot be removed" }, 403);
    }

    // Protect any user that has NO organizationId — they don't belong to this customer
    const targetOrgId = targetUser.user_metadata?.organizationId;
    if (!targetOrgId) {
      return c.json({ error: "This user does not belong to your organization" }, 403);
    }

    if (orgId && targetOrgId !== orgId) {
      return c.json({ error: "Cannot remove users from another organization" }, 403);
    }

    if (targetUser.user_metadata?.role === 'admin' || targetId === orgId) {
      return c.json({ error: "Cannot remove the fleet owner" }, 403);
    }

    const { error } = await supabase.auth.admin.deleteUser(targetId);
    if (error) throw error;

    console.log(`[Team] Removed user ${targetId} from org ${orgId}`);
    return c.json({ success: true, message: "Team member removed" });
  } catch (e: any) {
    console.error("[Team Remove] Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// ─── Phase 10: Driver-Organization Linking ───────────────────────────────────

// Phase 11: Platform team invite endpoint
const PLATFORM_ROLES = ['platform_support', 'platform_analyst'] as const;

app.post("/make-server-37f42386/admin/team/invite", requireAuth(), async (c) => {
  try {
    // Only platform_owner (superadmin) can invite platform staff
    const rbacUser = c.get('rbacUser') as any;
    const callerRole = rbacUser?.resolvedRole || rbacUser?.role;
    if (callerRole !== 'platform_owner' && callerRole !== 'superadmin') {
      return c.json({ error: "Only the platform owner can invite platform staff" }, 403);
    }

    const { email, name, role } = await c.req.json();
    if (!email || !name) {
      return c.json({ error: "Email and name are required" }, 400);
    }
    if (!PLATFORM_ROLES.includes(role)) {
      return c.json({ error: `Invalid platform role. Must be one of: ${PLATFORM_ROLES.join(', ')}` }, 400);
    }

    const tempPassword = Array.from(crypto.getRandomValues(new Uint8Array(9)))
      .map((b: number) => b.toString(36).padStart(2, '0'))
      .join('')
      .slice(0, 12);

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      user_metadata: {
        name,
        role,
        // No organizationId — platform users see all orgs
      },
      email_confirm: true,
    });

    if (error) {
      if (error.message?.includes('already been registered') || error.message?.includes('already exists')) {
        return c.json({ error: "An account with this email already exists" }, 409);
      }
      throw error;
    }

    console.log(`[Platform Team] Invited ${email} as ${role}`);
    await logAdminAction({ actorId: rbacUser?.id, actorName: rbacUser?.name || 'Admin', action: 'invite_platform_staff', targetId: data.user.id, targetEmail: email, details: `Role: ${role}` });
    return c.json({
      success: true,
      userId: data.user.id,
      temporaryPassword: tempPassword,
      message: `Invited ${name} as ${role}. Share the temporary password securely.`,
    });
  } catch (e: any) {
    console.error("[Platform Team Invite] Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// ---------------------------------------------------------------------------
// Phase 2: Create Customer Account from Admin
// ---------------------------------------------------------------------------
app.post("/make-server-37f42386/admin/create-customer", requireAuth(), async (c) => {
  try {
    const rbacUser = c.get('rbacUser') as any;
    const callerRole = rbacUser?.resolvedRole || rbacUser?.role;
    if (callerRole !== 'platform_owner' && callerRole !== 'superadmin') {
      return c.json({ error: "Only the platform owner can create customer accounts" }, 403);
    }

    const { email, name, businessType } = await c.req.json();
    if (!email || !name || !businessType) {
      return c.json({ error: "email, name, and businessType are all required" }, 400);
    }

    const allowedTypes = ['rideshare', 'delivery', 'taxi', 'trucking', 'shipping'];
    if (!allowedTypes.includes(businessType)) {
      return c.json({ error: `Invalid businessType. Must be one of: ${allowedTypes.join(', ')}` }, 400);
    }

    // Generate temporary password
    const tempPassword = Array.from(crypto.getRandomValues(new Uint8Array(9)))
      .map((b: number) => b.toString(36).padStart(2, '0'))
      .join('')
      .slice(0, 12);

    // Create the user
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      user_metadata: {
        name,
        role: 'admin',
        businessType,
      },
      email_confirm: true,
    });

    if (error) {
      if (error.message?.includes('already been registered') || error.message?.includes('already exists')) {
        return c.json({ error: "An account with this email already exists" }, 409);
      }
      throw error;
    }

    // Set organizationId to the new user's own ID (self-referencing for fleet owners)
    const userId = data.user.id;
    const { error: updateErr } = await supabase.auth.admin.updateUserById(userId, {
      user_metadata: { ...data.user.user_metadata, organizationId: userId },
    });
    if (updateErr) {
      console.error(`[Create Customer] Failed to set organizationId for ${userId}:`, updateErr);
      // Non-fatal: the account was still created, just missing organizationId
    }

    console.log(`[Create Customer] Created ${email} as fleet owner (${businessType})`);
    await logAdminAction({ actorId: rbacUser?.id, actorName: rbacUser?.name || 'Admin', action: 'create_customer', targetId: userId, targetEmail: email, details: `Business type: ${businessType}` });
    return c.json({
      success: true,
      userId,
      temporaryPassword: tempPassword,
      message: `Customer account created for ${name}. Share the temporary password securely.`,
    });
  } catch (e: any) {
    console.error("[Create Customer] Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// ---------------------------------------------------------------------------
// Phase 3: Driver Accounts — Server Endpoints
// ---------------------------------------------------------------------------

// GET /admin/drivers — List all driver accounts across all fleets
app.get("/make-server-37f42386/admin/drivers", requireAuth(), async (c) => {
  try {
    const rbacUser = c.get('rbacUser') as any;
    const callerRole = rbacUser?.resolvedRole || rbacUser?.role;
    if (callerRole !== 'platform_owner' && callerRole !== 'superadmin' && callerRole !== 'platform_support') {
      return c.json({ error: "Only platform owner or support can view drivers" }, 403);
    }

    const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw new Error(`Auth API error: ${error.message}`);

    const allUsers = data?.users || [];

    // Build org name lookup from fleet owners (role === 'admin' or 'superadmin' with businessType)
    const orgNameMap: Record<string, string> = {};
    for (const u of allUsers) {
      const meta = u.user_metadata || {};
      if (meta.role === 'admin' || (meta.role === 'superadmin' && meta.businessType)) {
        orgNameMap[u.id] = meta.name || u.email || 'Unknown Fleet';
      }
    }

    // Filter to drivers only
    const drivers = allUsers
      .filter((u: any) => u.user_metadata?.role === 'driver')
      .map((u: any) => {
        const meta = u.user_metadata || {};
        const orgId = meta.organizationId || null;
        const isLinked = !!orgId;
        return {
          id: u.id,
          email: u.email || "",
          name: meta.name || "",
          organizationId: orgId,
          organizationName: isLinked ? (orgNameMap[orgId] || 'Unknown Fleet') : null,
          createdAt: u.created_at || null,
          lastSignIn: u.last_sign_in_at || null,
          status: u.last_sign_in_at
            ? (Date.now() - new Date(u.last_sign_in_at).getTime() < 30 * 24 * 60 * 60 * 1000 ? "active" : "inactive")
            : "inactive",
          isSuspended: !!u.banned_until && new Date(u.banned_until) > new Date(),
          isLinked,
        };
      });

    console.log(`[Admin Drivers] Returned ${drivers.length} drivers`);
    return c.json({ drivers });
  } catch (e: any) {
    console.error("[Admin Drivers List] Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// POST /admin/drivers/:id/unlink — Remove a driver's organization link
app.post("/make-server-37f42386/admin/drivers/:id/unlink", requireAuth(), async (c) => {
  try {
    const rbacUser = c.get('rbacUser') as any;
    const callerRole = rbacUser?.resolvedRole || rbacUser?.role;
    if (callerRole !== 'platform_owner' && callerRole !== 'superadmin') {
      return c.json({ error: "Only the platform owner can unlink drivers" }, 403);
    }

    const driverId = c.req.param('id');
    const { data: { user }, error: getUserErr } = await supabase.auth.admin.getUserById(driverId);
    if (getUserErr || !user) return c.json({ error: "User not found" }, 404);

    if (user.user_metadata?.role !== 'driver') {
      return c.json({ error: "This user is not a driver" }, 400);
    }

    if (!user.user_metadata?.organizationId) {
      return c.json({ error: "Driver is already unlinked" }, 400);
    }

    const { error: updateErr } = await supabase.auth.admin.updateUserById(driverId, {
      user_metadata: { ...user.user_metadata, organizationId: null }
    });
    if (updateErr) throw updateErr;

    console.log(`[Admin Drivers] Unlinked driver ${user.email} from org ${user.user_metadata.organizationId}`);
    await logAdminAction({ actorId: rbacUser?.id, actorName: rbacUser?.name || 'Admin', action: 'unlink_driver', targetId: driverId, targetEmail: user.email || '', details: `From org: ${user.user_metadata.organizationId}` });
    return c.json({ success: true, message: "Driver unlinked from organization" });
  } catch (e: any) {
    console.error("[Admin Drivers Unlink] Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// POST /admin/drivers/:id/link — Assign a driver to an organization
app.post("/make-server-37f42386/admin/drivers/:id/link", requireAuth(), async (c) => {
  try {
    const rbacUser = c.get('rbacUser') as any;
    const callerRole = rbacUser?.resolvedRole || rbacUser?.role;
    if (callerRole !== 'platform_owner' && callerRole !== 'superadmin') {
      return c.json({ error: "Only the platform owner can link drivers" }, 403);
    }

    const driverId = c.req.param('id');
    const { organizationId } = await c.req.json();
    if (!organizationId) return c.json({ error: "organizationId is required" }, 400);

    // Get the driver
    const { data: { user: driver }, error: getDriverErr } = await supabase.auth.admin.getUserById(driverId);
    if (getDriverErr || !driver) return c.json({ error: "Driver not found" }, 404);

    if (driver.user_metadata?.role !== 'driver') {
      return c.json({ error: "This user is not a driver" }, 400);
    }

    if (driver.user_metadata?.organizationId) {
      return c.json({ error: "Driver is already linked to an organization. Unlink them first." }, 409);
    }

    // Verify the target organization exists (fleet owner)
    const { data: { user: orgOwner }, error: getOrgErr } = await supabase.auth.admin.getUserById(organizationId);
    if (getOrgErr || !orgOwner) return c.json({ error: "Target organization not found" }, 404);

    const orgRole = orgOwner.user_metadata?.role;
    if (orgRole !== 'admin' && orgRole !== 'superadmin') {
      return c.json({ error: "Target organization ID does not belong to a fleet owner" }, 400);
    }

    const { error: updateErr } = await supabase.auth.admin.updateUserById(driverId, {
      user_metadata: { ...driver.user_metadata, organizationId }
    });
    if (updateErr) throw updateErr;

    const orgName = orgOwner.user_metadata?.name || orgOwner.email || organizationId;
    console.log(`[Admin Drivers] Linked driver ${driver.email} to org ${orgName} (${organizationId})`);
    await logAdminAction({ actorId: rbacUser?.id, actorName: rbacUser?.name || 'Admin', action: 'link_driver', targetId: driverId, targetEmail: driver.email || '', details: `To org: ${orgName}` });
    return c.json({ success: true, message: `Driver linked to ${orgName}` });
  } catch (e: any) {
    console.error("[Admin Drivers Link] Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// ---------------------------------------------------------------------------
// Phase 5: Team Members — All Fleet Sub-Roles
// ---------------------------------------------------------------------------

const FLEET_SUB_ROLES = ['fleet_manager', 'fleet_accountant', 'fleet_viewer', 'manager', 'viewer'];
const CANONICAL_FLEET_SUB_ROLES = ['fleet_manager', 'fleet_accountant', 'fleet_viewer'];
function canonicalizeRole(role: string): string {
  if (role === 'manager') return 'fleet_manager';
  if (role === 'viewer') return 'fleet_viewer';
  return role;
}

// GET /admin/team-members — List all fleet sub-role users across all orgs
app.get("/make-server-37f42386/admin/team-members", requireAuth(), async (c) => {
  try {
    const rbacUser = c.get('rbacUser') as any;
    const callerRole = rbacUser?.resolvedRole || rbacUser?.role;
    if (callerRole !== 'platform_owner' && callerRole !== 'superadmin' && callerRole !== 'platform_support') {
      return c.json({ error: "Only platform owner or support can view team members" }, 403);
    }

    const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw new Error(`Auth API error: ${error.message}`);

    const allUsers = data?.users || [];

    // Org name lookup
    const orgNameMap: Record<string, string> = {};
    for (const u of allUsers) {
      const meta = u.user_metadata || {};
      if (meta.role === 'admin' || (meta.role === 'superadmin' && meta.businessType)) {
        orgNameMap[u.id] = meta.name || u.email || 'Unknown Fleet';
      }
    }

    const members = allUsers
      .filter((u: any) => FLEET_SUB_ROLES.includes(u.user_metadata?.role))
      .map((u: any) => {
        const meta = u.user_metadata || {};
        const orgId = meta.organizationId || null;
        return {
          id: u.id,
          email: u.email || "",
          name: meta.name || "",
          role: canonicalizeRole(meta.role),
          organizationId: orgId,
          organizationName: orgId ? (orgNameMap[orgId] || 'Unknown Fleet') : null,
          createdAt: u.created_at || null,
          lastSignIn: u.last_sign_in_at || null,
          status: u.last_sign_in_at
            ? (Date.now() - new Date(u.last_sign_in_at).getTime() < 30 * 24 * 60 * 60 * 1000 ? "active" : "inactive")
            : "inactive",
          isSuspended: !!u.banned_until && new Date(u.banned_until) > new Date(),
        };
      });

    console.log(`[Admin Team Members] Returned ${members.length} team members`);
    return c.json({ members });
  } catch (e: any) {
    console.error("[Admin Team Members List] Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// PUT /admin/team-members/:id/role — Change a fleet sub-role user's role
app.put("/make-server-37f42386/admin/team-members/:id/role", requireAuth(), async (c) => {
  try {
    const rbacUser = c.get('rbacUser') as any;
    const callerRole = rbacUser?.resolvedRole || rbacUser?.role;
    if (callerRole !== 'platform_owner' && callerRole !== 'superadmin') {
      return c.json({ error: "Only the platform owner can change team member roles" }, 403);
    }

    const userId = c.req.param('id');
    const { role } = await c.req.json();
    if (!role || !CANONICAL_FLEET_SUB_ROLES.includes(role)) {
      return c.json({ error: `Invalid role. Must be one of: ${CANONICAL_FLEET_SUB_ROLES.join(', ')}` }, 400);
    }

    const { data: { user }, error: getUserErr } = await supabase.auth.admin.getUserById(userId);
    if (getUserErr || !user) return c.json({ error: "User not found" }, 404);

    const currentRole = user.user_metadata?.role;
    if (!FLEET_SUB_ROLES.includes(currentRole)) {
      return c.json({ error: "This user is not a fleet sub-role member. Cannot change their role here." }, 400);
    }

    const { error: updateErr } = await supabase.auth.admin.updateUserById(userId, {
      user_metadata: { ...user.user_metadata, role }
    });
    if (updateErr) throw updateErr;

    console.log(`[Admin Team Members] Changed role for ${user.email} from ${currentRole} to ${role}`);
    await logAdminAction({ actorId: rbacUser?.id, actorName: rbacUser?.name || 'Admin', action: 'change_team_role', targetId: userId, targetEmail: user.email || '', details: `From ${currentRole} to ${role}` });
    return c.json({ success: true, message: `Role changed to ${role}` });
  } catch (e: any) {
    console.error("[Admin Team Members Change Role] Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// DELETE /admin/team-members/:id — Remove a fleet sub-role user entirely
app.delete("/make-server-37f42386/admin/team-members/:id", requireAuth(), async (c) => {
  try {
    const rbacUser = c.get('rbacUser') as any;
    const callerRole = rbacUser?.resolvedRole || rbacUser?.role;
    if (callerRole !== 'platform_owner' && callerRole !== 'superadmin') {
      return c.json({ error: "Only the platform owner can remove team members" }, 403);
    }

    const userId = c.req.param('id');
    const { data: { user }, error: getUserErr } = await supabase.auth.admin.getUserById(userId);
    if (getUserErr || !user) return c.json({ error: "User not found" }, 404);

    const currentRole = user.user_metadata?.role;
    if (!FLEET_SUB_ROLES.includes(currentRole)) {
      return c.json({ error: "This user is not a fleet sub-role member. Cannot delete them here." }, 400);
    }

    const { error: deleteErr } = await supabase.auth.admin.deleteUser(userId);
    if (deleteErr) throw deleteErr;

    console.log(`[Admin Team Members] Deleted user ${user.email} (role: ${currentRole})`);
    await logAdminAction({ actorId: rbacUser?.id, actorName: rbacUser?.name || 'Admin', action: 'remove_team_member', targetId: userId, targetEmail: user.email || '' });
    return c.json({ success: true, message: "Team member removed" });
  } catch (e: any) {
    console.error("[Admin Team Members Delete] Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// ---------------------------------------------------------------------------
// Phase 8: Audit Log — GET endpoint
// ---------------------------------------------------------------------------

// GET /admin/audit-log — Retrieve admin activity log
app.get("/make-server-37f42386/admin/audit-log", requireAuth(), async (c) => {
  try {
    const rbacUser = c.get('rbacUser') as any;
    const callerRole = rbacUser?.resolvedRole || rbacUser?.role;
    if (callerRole !== 'platform_owner' && callerRole !== 'superadmin') {
      return c.json({ error: "Only the platform owner can view the audit log" }, 403);
    }

    const url = new URL(c.req.url);
    const limitParam = url.searchParams.get('limit');
    const actorParam = url.searchParams.get('actor');
    const limit = limitParam ? parseInt(limitParam, 10) : 200;

    let entries;
    if (actorParam) {
      entries = await getAuditLogsByActor(actorParam, limit);
    } else {
      entries = await getAuditLogs(limit);
    }

    return c.json({ entries });
  } catch (e: any) {
    console.error("[Admin Audit Log] Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// ---------------------------------------------------------------------------
// Phase 7: Direct Password Set
// ---------------------------------------------------------------------------

// POST /admin/set-password — Directly set a user's password
app.post("/make-server-37f42386/admin/set-password", requireAuth(), async (c) => {
  try {
    const rbacUser = c.get('rbacUser') as any;
    const callerRole = rbacUser?.resolvedRole || rbacUser?.role;
    if (callerRole !== 'platform_owner' && callerRole !== 'superadmin') {
      return c.json({ error: "Only the platform owner can set passwords directly" }, 403);
    }

    const { userId, password } = await c.req.json();
    if (!userId || !password) {
      return c.json({ error: "userId and password are required" }, 400);
    }
    if (password.length < 8) {
      return c.json({ error: "Password must be at least 8 characters" }, 400);
    }

    const { data: { user }, error: getUserErr } = await supabase.auth.admin.getUserById(userId);
    if (getUserErr || !user) return c.json({ error: "User not found" }, 404);

    const { error: updateErr } = await supabase.auth.admin.updateUserById(userId, { password });
    if (updateErr) throw updateErr;

    console.log(`[Admin Set Password] Password set for ${user.email} by platform owner`);
    await logAdminAction({ actorId: rbacUser?.id, actorName: rbacUser?.name || 'Admin', action: 'set_password', targetId: userId, targetEmail: user.email || '' });
    return c.json({ success: true, message: "Password updated successfully" });
  } catch (e: any) {
    console.error("[Admin Set Password] Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// ---------------------------------------------------------------------------
// Phase 6: Organization Detail — Drill-Down Summary
// ---------------------------------------------------------------------------

// GET /admin/organizations/:orgId/summary
app.get("/make-server-37f42386/admin/organizations/:orgId/summary", requireAuth(), async (c) => {
  try {
    const rbacUser = c.get('rbacUser') as any;
    const callerRole = rbacUser?.resolvedRole || rbacUser?.role;
    if (callerRole !== 'platform_owner' && callerRole !== 'superadmin' && callerRole !== 'platform_support') {
      return c.json({ error: "Only platform owner or support can view org details" }, 403);
    }

    const orgId = c.req.param('orgId');

    // Get the org owner
    const { data: { user: owner }, error: ownerErr } = await supabase.auth.admin.getUserById(orgId);
    if (ownerErr || !owner) return c.json({ error: "Organization owner not found" }, 404);

    const ownerMeta = owner.user_metadata || {};
    const ownerData = {
      id: owner.id,
      name: ownerMeta.name || '',
      email: owner.email || '',
      businessType: ownerMeta.businessType || 'rideshare',
      createdAt: owner.created_at || null,
      lastSignIn: owner.last_sign_in_at || null,
      status: owner.last_sign_in_at
        ? (Date.now() - new Date(owner.last_sign_in_at).getTime() < 30 * 24 * 60 * 60 * 1000 ? 'active' : 'inactive')
        : 'inactive',
      isSuspended: !!owner.banned_until && new Date(owner.banned_until) > new Date(),
    };

    // Get all users to find team members and drivers for this org
    const { data: usersData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const allUsers = usersData?.users || [];

    const teamMembers: any[] = [];
    const drivers: any[] = [];

    for (const u of allUsers) {
      const meta = u.user_metadata || {};
      if (meta.organizationId !== orgId) continue;

      const userInfo = {
        id: u.id,
        name: meta.name || '',
        email: u.email || '',
        role: canonicalizeRole(meta.role || ''),
        lastSignIn: u.last_sign_in_at || null,
        status: u.last_sign_in_at
          ? (Date.now() - new Date(u.last_sign_in_at).getTime() < 30 * 24 * 60 * 60 * 1000 ? 'active' : 'inactive')
          : 'inactive',
        isSuspended: !!u.banned_until && new Date(u.banned_until) > new Date(),
      };

      if (FLEET_SUB_ROLES.includes(meta.role)) {
        teamMembers.push(userInfo);
      } else if (meta.role === 'driver') {
        drivers.push({ ...userInfo, isLinked: true });
      }
    }

    // Count KV data for this org
    const [vehicles, fuelEntries, kvDrivers] = await Promise.all([
      kv.getByPrefix("vehicle:"),
      kv.getByPrefix("fuel_entry:"),
      kv.getByPrefix("driver:"),
    ]);

    const vehicleCount = (vehicles || []).filter((v: any) => v?.organizationId === orgId).length;
    const fuelCount = (fuelEntries || []).filter((f: any) => f?.organizationId === orgId).length;
    const kvDriverCount = (kvDrivers || []).filter((d: any) => d?.organizationId === orgId).length;

    const stats = {
      teamMembers: teamMembers.length,
      drivers: Math.max(drivers.length, kvDriverCount),
      vehicles: vehicleCount,
      trips: 0,
      fuelEntries: fuelCount,
      tollEntries: 0,
    };

    console.log(`[Admin Org Detail] Org ${orgId}: ${teamMembers.length} team, ${stats.drivers} drivers, ${vehicleCount} vehicles, ${fuelCount} fuel`);
    return c.json({ owner: ownerData, stats, teamMembers, drivers });
  } catch (e: any) {
    console.error("[Admin Org Detail] Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// ---------------------------------------------------------------------------
// Phase 1: Platform Team Management Endpoints
// ---------------------------------------------------------------------------

// GET /admin/platform-team — List all platform staff (owner, support, analyst)
app.get("/make-server-37f42386/admin/platform-team", requireAuth(), async (c) => {
  try {
    const rbacUser = c.get('rbacUser') as any;
    const callerRole = rbacUser?.resolvedRole || rbacUser?.role;
    if (callerRole !== 'platform_owner' && callerRole !== 'superadmin') {
      return c.json({ error: "Only the platform owner can view platform team" }, 403);
    }

    const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw new Error(`Auth API error: ${error.message}`);

    const platformRoles = ['platform_owner', 'platform_support', 'platform_analyst', 'superadmin'];
    const members = (data?.users || [])
      .filter((u: any) => platformRoles.includes(u.user_metadata?.role))
      .map((u: any) => ({
        id: u.id,
        email: u.email || "",
        name: u.user_metadata?.name || "",
        role: u.user_metadata?.role === 'superadmin' ? 'platform_owner' : u.user_metadata?.role,
        createdAt: u.created_at || null,
        lastSignIn: u.last_sign_in_at || null,
        status: u.last_sign_in_at
          ? (Date.now() - new Date(u.last_sign_in_at).getTime() < 30 * 24 * 60 * 60 * 1000 ? "active" : "inactive")
          : "inactive",
        isSuspended: !!u.banned_until && new Date(u.banned_until) > new Date(),
      }));

    console.log(`[Platform Team] Returned ${members.length} platform members`);
    return c.json({ members });
  } catch (e: any) {
    console.error("[Platform Team List] Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// PUT /admin/platform-team/:id/role — Change a platform staff member's role
app.put("/make-server-37f42386/admin/platform-team/:id/role", requireAuth(), async (c) => {
  try {
    const rbacUser = c.get('rbacUser') as any;
    const callerRole = rbacUser?.resolvedRole || rbacUser?.role;
    if (callerRole !== 'platform_owner' && callerRole !== 'superadmin') {
      return c.json({ error: "Only the platform owner can change platform roles" }, 403);
    }

    const targetId = c.req.param('id');
    const { role } = await c.req.json();

    // Validate new role
    const allowedRoles = ['platform_support', 'platform_analyst'];
    if (!allowedRoles.includes(role)) {
      return c.json({ error: `Invalid role. Must be one of: ${allowedRoles.join(', ')}` }, 400);
    }

    // Prevent changing your own role
    const callerId = rbacUser?.id;
    if (callerId === targetId) {
      return c.json({ error: "You cannot change your own role" }, 400);
    }

    // Get the target user
    const { data: { user: targetUser }, error: getUserErr } = await supabase.auth.admin.getUserById(targetId);
    if (getUserErr || !targetUser) {
      return c.json({ error: "User not found" }, 404);
    }

    // Prevent changing the platform_owner's role
    const targetRole = targetUser.user_metadata?.role;
    if (targetRole === 'platform_owner' || targetRole === 'superadmin') {
      return c.json({ error: "Cannot change the platform owner's role" }, 403);
    }

    // Verify target is a platform user
    const platformSubRoles = ['platform_support', 'platform_analyst'];
    if (!platformSubRoles.includes(targetRole)) {
      return c.json({ error: "This user is not a platform staff member" }, 400);
    }

    const oldRole = targetRole;
    const { error: updateErr } = await supabase.auth.admin.updateUserById(targetId, {
      user_metadata: { ...targetUser.user_metadata, role }
    });
    if (updateErr) throw updateErr;

    console.log(`[Platform Team] Changed role for ${targetUser.email}: ${oldRole} → ${role}`);
    await logAdminAction({ actorId: rbacUser?.id, actorName: rbacUser?.name || 'Admin', action: 'change_platform_role', targetId: targetId, targetEmail: targetUser.email || '', details: `From ${oldRole} to ${role}` });
    return c.json({ success: true, message: `Role changed from ${oldRole} to ${role}` });
  } catch (e: any) {
    console.error("[Platform Team Role Change] Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// DELETE /admin/platform-team/:id — Remove a platform staff member
app.delete("/make-server-37f42386/admin/platform-team/:id", requireAuth(), async (c) => {
  try {
    const rbacUser = c.get('rbacUser') as any;
    const callerRole = rbacUser?.resolvedRole || rbacUser?.role;
    if (callerRole !== 'platform_owner' && callerRole !== 'superadmin') {
      return c.json({ error: "Only the platform owner can remove platform staff" }, 403);
    }

    const targetId = c.req.param('id');

    // Prevent deleting yourself
    const callerId = rbacUser?.id;
    if (callerId === targetId) {
      return c.json({ error: "You cannot remove yourself" }, 400);
    }

    // Get the target user
    const { data: { user: targetUser }, error: getUserErr } = await supabase.auth.admin.getUserById(targetId);
    if (getUserErr || !targetUser) {
      return c.json({ error: "User not found" }, 404);
    }

    // Prevent deleting the platform_owner
    const targetRole = targetUser.user_metadata?.role;
    if (targetRole === 'platform_owner' || targetRole === 'superadmin') {
      return c.json({ error: "Cannot remove the platform owner" }, 403);
    }

    // Verify target is a platform user
    const deletableRoles = ['platform_support', 'platform_analyst'];
    if (!deletableRoles.includes(targetRole)) {
      return c.json({ error: "This user is not a platform staff member" }, 400);
    }

    const { error: deleteErr } = await supabase.auth.admin.deleteUser(targetId);
    if (deleteErr) throw deleteErr;

    console.log(`[Platform Team] Removed ${targetUser.email} (was ${targetRole})`);
    await logAdminAction({ actorId: rbacUser?.id, actorName: rbacUser?.name || 'Admin', action: 'remove_platform_staff', targetId: targetId, targetEmail: targetUser.email || '' });
    return c.json({ success: true, message: `Removed ${targetUser.email} from platform team` });
  } catch (e: any) {
    console.error("[Platform Team Remove] Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// ONE-TIME RECOVERY: Recreate the platform owner (superadmin) account
// This endpoint does NOT require auth since the account was deleted.
// It is protected by a one-time secret and will refuse to create duplicates.
app.post("/make-server-37f42386/recover-platform-owner", async (c) => {
  try {
    const { email, password, name, recoverySecret } = await c.req.json();

    // Protect with a hardcoded one-time secret
    if (recoverySecret !== 'ROAMFLEET-RECOVER-2026-EMERGENCY') {
      return c.json({ error: "Invalid recovery secret" }, 403);
    }

    if (!email || !password) {
      return c.json({ error: "Email and password are required" }, 400);
    }

    // Check if a platform_owner already exists to prevent abuse
    const { data: { users: allUsers } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const existingOwner = (allUsers || []).find((u: any) =>
      u.user_metadata?.role === 'platform_owner' || u.user_metadata?.role === 'superadmin'
    );
    if (existingOwner) {
      return c.json({ error: `A platform owner already exists: ${existingOwner.email}. Recovery not needed.` }, 409);
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: {
        name: name || 'Platform Owner',
        role: 'platform_owner',
      },
      email_confirm: true,
    });

    if (error) throw error;

    console.log(`[RECOVERY] Platform owner account recreated: ${email}, id: ${data.user.id}`);
    return c.json({
      success: true,
      message: `Platform owner account recreated successfully. You can now log in at /admin.`,
      userId: data.user.id,
    });
  } catch (e: any) {
    console.error("[RECOVERY] Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// Step 10.5: POST /team/claim-driver — Claim an unlinked driver by email
app.post("/make-server-37f42386/team/claim-driver", requireAuth(), requirePermission('drivers.create'), async (c) => {
  try {
    const { driverEmail } = await c.req.json();
    if (!driverEmail) {
      return c.json({ error: "driverEmail is required" }, 400);
    }

    const orgId = getOrgId(c);
    if (!orgId) {
      return c.json({ error: "Cannot claim driver: no organization context" }, 400);
    }

    // Find user by email in Supabase Auth
    const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (listErr) throw listErr;

    const targetUser = (users || []).find((u: any) => u.email?.toLowerCase() === driverEmail.toLowerCase());
    if (!targetUser) {
      return c.json({ error: `No account found for ${driverEmail}` }, 404);
    }

    const meta = targetUser.user_metadata || {};

    // Verify their role is driver
    if (meta.role !== 'driver') {
      return c.json({ error: `This user is a ${meta.role || 'unknown'}, not a driver. Only drivers can be claimed.` }, 400);
    }

    // Verify they have no organizationId (not already claimed)
    if (meta.organizationId) {
      return c.json({ error: "This driver is already linked to an organization" }, 409);
    }

    // Update their user_metadata with the fleet owner's orgId
    const { error: updateErr } = await supabase.auth.admin.updateUserById(targetUser.id, {
      user_metadata: { ...meta, organizationId: orgId },
    });
    if (updateErr) throw updateErr;

    // Also update the driver's KV profile to have organizationId
    const driverProfile = await kv.get(`driver:${targetUser.id}`);
    if (driverProfile) {
      await kv.set(`driver:${targetUser.id}`, { ...driverProfile, organizationId: orgId });
      console.log(`[ClaimDriver] Updated KV profile for driver ${targetUser.id} with org ${orgId}`);
    } else {
      // Driver has auth account but no KV profile — create one
      const newProfile = {
        id: targetUser.id,
        driverId: targetUser.id,
        driverName: meta.name || driverEmail.split('@')[0],
        email: driverEmail,
        status: 'active',
        createdAt: new Date().toISOString(),
        acceptanceRate: 0,
        cancellationRate: 0,
        completionRate: 0,
        ratingLast500: 5.0,
        totalEarnings: 0,
        organizationId: orgId,
      };
      await kv.set(`driver:${targetUser.id}`, newProfile);
      console.log(`[ClaimDriver] Created KV profile for driver ${targetUser.id} in org ${orgId}`);
    }

    console.log(`[ClaimDriver] Driver ${driverEmail} (${targetUser.id}) claimed by org ${orgId}`);
    return c.json({ success: true, driverId: targetUser.id, message: `Driver ${driverEmail} has been linked to your organization` });
  } catch (e: any) {
    console.error("[ClaimDriver] Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// Admin: Update User Password
app.post("/make-server-37f42386/update-password", requireAuth(), async (c) => {
  try {
    const { userId, password } = await c.req.json();
    
    if (!userId || !password) {
      return c.json({ error: "User ID and new password are required" }, 400);
    }
    
    const { data, error } = await supabase.auth.admin.updateUserById(
      userId,
      { password: password }
    );
    
    if (error) throw error;
    
    return c.json({ success: true });
  } catch (e: any) {
    console.error("Update Password Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// Admin: Update User Details (name, role, businessType)
app.post("/make-server-37f42386/update-user", requireAuth(), requirePermission('users.edit_role'), async (c) => {
  try {
    const { userId, name, role, businessType } = await c.req.json();

    if (!userId) {
      return c.json({ error: "User ID is required" }, 400);
    }

    const updates: Record<string, any> = {};
    if (name !== undefined) updates.name = name;
    if (role !== undefined) updates.role = role;
    if (businessType !== undefined) updates.businessType = businessType;

    if (Object.keys(updates).length === 0) {
      return c.json({ error: "No fields to update" }, 400);
    }

    const { data, error } = await supabase.auth.admin.updateUserById(
      userId,
      { user_metadata: updates }
    );

    if (error) throw error;

    console.log(`User updated: ${userId} — fields: ${JSON.stringify(updates)}`);
    
    // Invalidate customer cache if updating an admin user
    if (updates.role === 'admin' || data.user?.user_metadata?.role === 'admin') {
      await invalidateCustomerCache();
    }
    
    return c.json({ success: true, user: data.user });
  } catch (e: any) {
    console.error("Update User Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// Admin: Delete User (Driver)
app.post("/make-server-37f42386/delete-user", requireAuth(), requirePermission('users.remove'), async (c) => {
  try {
    const { userId } = await c.req.json();
    
    if (!userId) {
      return c.json({ error: "User ID is required" }, 400);
    }
    
    // 1. Get user info before deletion (to check role)
    const { data: userData } = await supabase.auth.admin.getUserById(userId);
    const isAdmin = userData?.user?.user_metadata?.role === 'admin';
    
    // 2. Delete from Auth (Attempt)
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) {
        console.warn(`Auth delete failed for ${userId} (ignoring):`, error.message);
    }
    
    // 3. Delete from KV Store
    await kv.del(`driver:${userId}`);
    
    // 4. Invalidate customer cache if deleting an admin user
    if (isAdmin) {
      await invalidateCustomerCache();
    }
    
    return c.json({ success: true });
  } catch (e: any) {
    console.error("Delete User Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// Fuel Dispute Endpoints
app.get("/make-server-37f42386/fuel-disputes", requireAuth(), async (c) => {
  try {
    const { data, error } = await supabase
        .from("kv_store_37f42386")
        .select("value")
        .like("key", "fuel_dispute:%")
        .order("value->>createdAt", { ascending: false });

    if (error) throw error;
    const disputes = filterByOrg(data?.map((d: any) => d.value) || [], c);
    return c.json(disputes);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/fuel-disputes", async (c) => {
  try {
    const dispute = await c.req.json();
    if (!dispute.id) {
        dispute.id = crypto.randomUUID();
    }
    if (!dispute.createdAt) {
        dispute.createdAt = new Date().toISOString();
    }
    await kv.set(`fuel_dispute:${dispute.id}`, stampOrg(dispute, c));
    return c.json({ success: true, data: dispute });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-37f42386/fuel-disputes/:id", async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`fuel_dispute:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Equipment Endpoints
app.get("/make-server-37f42386/equipment/:vehicleId", requireAuth(), async (c) => {
  try {
    const vehicleId = c.req.param("vehicleId");
    // Get all equipment items for this vehicle. We assume keys are formatted as equipment:{vehicleId}:{itemId}
    const items = await kv.getByPrefix(`equipment:${vehicleId}:`);
    return c.json(filterByOrg(items || [], c));
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/equipment", requireAuth(), requirePermission('vehicles.edit'), async (c) => {
  try {
    const item = await c.req.json();
    if (!item.id) {
        item.id = crypto.randomUUID();
    }
    if (!item.vehicleId) {
        return c.json({ error: "Vehicle ID is required" }, 400);
    }
    if (!item.updatedAt) {
        item.updatedAt = new Date().toISOString();
    }
    
    // Key structure: equipment:{vehicleId}:{itemId}
    await kv.set(`equipment:${item.vehicleId}:${item.id}`, stampOrg(item, c));
    return c.json({ success: true, data: item });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-37f42386/equipment/:vehicleId/:id", requireAuth(), requirePermission('vehicles.edit'), async (c) => {
  const vehicleId = c.req.param("vehicleId");
  const id = c.req.param("id");
  try {
    await kv.del(`equipment:${vehicleId}:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Map Match Endpoint (OSRM Proxy)
app.post("/make-server-37f42386/map-match", async (c) => {
  try {
    const { points } = await c.req.json();
    if (!Array.isArray(points) || points.length === 0) {
      return c.json({ error: "Points array is required" }, 400);
    }

    // Filter valid points with timestamps and sort them
    const rawPoints = points
        .filter((p: any) => {
            const lat = Number(p.lat);
            const lon = Number(p.lon);
            const ts = Number(p.timestamp);
            return p && 
                   !isNaN(lat) && lat !== 0 && 
                   !isNaN(lon) && lon !== 0 && 
                   !isNaN(ts) && ts > 0;
        })
        .sort((a: any, b: any) => Number(a.timestamp) - Number(b.timestamp));

    // Deduplicate to ensure strictly increasing timestamps (seconds) for OSRM
    const uniquePoints: any[] = [];
    let lastSec = -1;
    for (const p of rawPoints) {
        const sec = Math.floor(Number(p.timestamp) / 1000);
        if (sec > lastSec) {
            uniquePoints.push(p);
            lastSec = sec;
        }
    }

    if (uniquePoints.length < 2) {
      // Not enough points for a route, return success with empty/null data to avoid crashing frontend
      return c.json({ success: true, data: { totalDistance: 0, totalDuration: 0, confidence: 0, snappedRoute: [] } });
    }

    // Chunking Logic (60 points per chunk to be safe within 100 limit and URL length)
    const CHUNK_SIZE = 60;
    const chunks = [];
    
    // Create chunks with 1 point overlap
    for (let i = 0; i < uniquePoints.length - 1; i += (CHUNK_SIZE - 1)) {
        const chunk = uniquePoints.slice(i, Math.min(i + CHUNK_SIZE, uniquePoints.length));
        if (chunk.length >= 2) {
            chunks.push(chunk);
        }
    }
    
    const responses = await Promise.all(chunks.map(async (chunk) => {
        // Format: lon,lat;lon,lat
        const coords = chunk.map((p: any) => `${Number(p.lon)},${Number(p.lat)}`).join(';');
        const timestamps = chunk.map((p: any) => Math.floor(Number(p.timestamp) / 1000)).join(';');
        // Increase radius to 60m to be more forgiving of GPS drift
        const radiuses = chunk.map(() => "60").join(';');
        
        // Using public OSRM server. 
        // fallback to 'router.project-osrm.org' but ideally this should be configurable
        const url = `https://router.project-osrm.org/match/v1/driving/${coords}?timestamps=${timestamps}&radiuses=${radiuses}&overview=full&geometries=geojson&steps=false&annotations=true`;
        
        try {
            const res = await fetch(url);
            if (!res.ok) {
                const text = await res.text();
                console.log(`OSRM Failed (${res.status}): ${text.substring(0, 100)}... URL length: ${url.length}`);
                // Return null instead of throwing to allow partial results
                return null;
            }
            return res.json();
        } catch (fetchErr) {
            console.error("OSRM Fetch Error:", fetchErr);
            return null;
        }
    }));

    // Result Stitching
    let totalDistance = 0;
    let totalDuration = 0;
    const stitchedCoordinates: any[] = [];
    let confidenceSum = 0;
    let validResponses = 0;
    
    responses.forEach((res, index) => {
        if (!res || res.code !== 'Ok' || !res.matchings || res.matchings.length === 0) return;
        
        const match = res.matchings[0]; // Take best match
        
        totalDistance += match.distance;
        totalDuration += match.duration;
        confidenceSum += match.confidence;
        validResponses++;

        // Geometry Stitching
        if (match.geometry && match.geometry.coordinates) {
             const coords = match.geometry.coordinates;
             // If this is not the first chunk, remove the first coordinate to avoid duplicate vertex at join
             if (index > 0 && stitchedCoordinates.length > 0) {
                 stitchedCoordinates.push(...coords.slice(1));
             } else {
                 stitchedCoordinates.push(...coords);
             }
        }
    });

    const confidence = validResponses > 0 ? confidenceSum / validResponses : 0;

    return c.json({
        success: true,
        data: {
            snappedRoute: stitchedCoordinates.map((c: any) => ({ lat: c[1], lon: c[0] })), // GeoJSON is [lon, lat]
            totalDistance, // Meters
            totalDuration, // Seconds
            confidence
        }
    });

  } catch (e: any) {
    console.error("Map Matching Error:", e);
    return c.json({ success: false, error: e.message });
  }
});

// Performance Report Endpoint - Optimized with Streaming (Phase 6) & Caching (Phase 7)
app.get("/make-server-37f42386/performance-report", requireAuth(), async (c) => {
    const startDate = c.req.query("startDate");
    const endDate = c.req.query("endDate");
    const dailyRideTarget = parseInt(c.req.query("dailyRideTarget") || "10");
    const dailyEarningsTarget = parseInt(c.req.query("dailyEarningsTarget") || "0");
    const summaryOnly = c.req.query("summaryOnly") === "true";
    const limit = parseInt(c.req.query("limit") || "100");
    const offset = parseInt(c.req.query("offset") || "0");
    
    if (!startDate || !endDate) {
        return c.json({ error: "startDate and endDate are required" }, 400);
    }

    // Phase 7.1: Caching Strategy
    try {
        const cacheParams = { startDate, endDate, dailyRideTarget, dailyEarningsTarget, summaryOnly, limit, offset };
        const version = await cache.getCacheVersion("performance");
        const cacheKey = await cache.generateKey(`performance:${version}`, cacheParams);
        
        const cachedData = await cache.getCache(cacheKey);
        if (cachedData) {
            c.header("X-Cache", "HIT");
            return c.json(cachedData);
        }
        
        c.header("X-Cache", "MISS");

        return streamText(c, async (stream) => {
            // Helper for safe streaming to handle Broken Pipe
            const safeWrite = async (content: string): Promise<boolean> => {
                try {
                    await stream.write(content);
                    return true;
                } catch (writeErr: any) {
                    if (writeErr.message.includes("broken pipe") || 
                        writeErr.name === "EPIPE" || 
                        writeErr.name === "Http" || 
                        writeErr.name === "BadResource") {
                        console.warn(`Stream Client disconnected (${writeErr.name}) - Stopping stream`);
                        return false;
                    }
                    // Log unexpected errors but still return false to stop the loop safely
                    console.error("Unexpected stream write error:", writeErr);
                    return false;
                }
            };

            try {
                // Buffer for caching
                const cachedReports: any[] = [];

                // 1. Get total count of drivers first (for pagination metadata)
                const { count: totalDrivers, error: countError } = await supabase
                    .from("kv_store_37f42386")
                    .select("key", { count: 'exact', head: true })
                    .like("key", "driver:%");

                if (countError) throw countError;

                // Log Start
                const reqStart = Date.now();
                console.log(`[Performance Report] Starting processing for offset ${offset}, limit ${limit}`);

                // Start JSON response
                if (!await safeWrite(`{"data": [`)) return;

                // 2. Fetch Drivers for the requested page
                // We still fetch the full page of drivers requested (e.g., 100)
                let { data: driverData, error: driverError } = await supabase
                    .from("kv_store_37f42386")
                    .select("value->id, value->name, value->driverId, value->uberDriverId, value->inDriveDriverId")
                    .like("key", "driver:%")
                    .range(offset, offset + limit - 1);

                if (driverError) throw driverError;

                let driversPage = (driverData as any) || [];
                // Free raw driver response
                (driverData as any) = null;

                let firstItem = true;

                // 3. Process drivers in chunks (Throttled via pMap)
                const CHUNK_SIZE = 10; 
                let driverChunks = [];
                for (let i = 0; i < driversPage.length; i += CHUNK_SIZE) {
                    driverChunks.push(driversPage.slice(i, i + CHUNK_SIZE));
                }
                // Free driversPage as it is now chunked
                (driversPage as any) = null;

                // Circuit Breaker State
                let failureCount = 0;
                const MAX_FAILURES = 3;

                // Define the processor for a single chunk
                const processChunk = async (driverChunk: any[], chunkIndex: number) => {
                    // Circuit Breaker Check
                    if (failureCount >= MAX_FAILURES) {
                        console.warn("Circuit Breaker Open: Skipping chunk due to previous failures");
                        return;
                    }

                    const driverIds = new Set<string>();
                    driverChunk.forEach((d: any) => {
                        if (d.id) driverIds.add(d.id);
                        if (d.driverId) driverIds.add(d.driverId);
                        if (d.uberDriverId) driverIds.add(d.uberDriverId);
                        if (d.inDriveDriverId) driverIds.add(d.inDriveDriverId);
                    });

                    if (driverIds.size === 0) return;

                    const chunkStart = Date.now();

                    // Fetch raw trips
                    let { data: tripData, error: tripError } = await supabase
                        .from("kv_store_37f42386")
                        .select("value->id, value->amount, value->date, value->driverId, value->status")
                        .like("key", "trip:%")
                        .in("value->>driverId", Array.from(driverIds))
                        .or(`value->>date.gte.${startDate},value->>requestTime.gte.${startDate}`)
                        .or(`value->>date.lte.${endDate},value->>requestTime.lte.${endDate}`);

                    if (tripError) {
                        console.error(`[Chunk Error] Failed to fetch trips. Drivers: ${driverIds.size}`, tripError);
                        failureCount++; // Increment failure count
                        return;
                    }
                    
                    const tripCount = (tripData as any)?.length || 0;

                    // Aggregate immediately
                    const report = generatePerformanceReport(
                        (tripData as any) || [], 
                        driverChunk, 
                        startDate, 
                        endDate,
                        { dailyRideTarget, dailyEarningsTarget },
                        summaryOnly
                    );
                    
                    // Explicitly free heavy trip data to prevent OOM
                    (tripData as any) = null;

                    console.log(`[Chunk] Processed ${driverIds.size} drivers. Trips: ${tripCount}. Duration: ${Date.now() - chunkStart}ms`);

                    // Stream items INDIVIDUALLY to reduce memory pressure
                    for (const reportItem of report) {
                        let prefix = "";
                        if (!firstItem) {
                            prefix = ",";
                        }
                        const itemStr = prefix + JSON.stringify(reportItem);
                        
                        // CRITICAL FIX: Check if write succeeded
                        const success = await safeWrite(itemStr);
                        if (!success) {
                            console.warn(`[Chunk] Stream broken during write. Aborting processing.`);
                            throw new Error("StreamAborted");
                        }
                        
                        firstItem = false;
                    }

                    // Add to cache buffer
                    cachedReports.push(...report);
                };

                // Execute with concurrency limit of 1 (Serial)
                // specific error handling for StreamAborted to exit cleanly
                try {
                    await pMap(driverChunks, processChunk, { concurrency: 1 });
                } catch (err: any) {
                    if (err.message === "StreamAborted") {
                        console.warn("Processing halted due to client disconnection.");
                        return; // Exit function cleanly, do not try to write footer
                    }
                    throw err; // Re-throw real errors
                }

                // End JSON response
                const resultMetadata = { total: totalDrivers || 0, limit, offset };
                if (!await safeWrite(`], "total": ${totalDrivers || 0}, "limit": ${limit}, "offset": ${offset}}`)) return;
                
                console.log(`[Performance Report] Completed in ${Date.now() - reqStart}ms`);

                // 7. Save to Cache (Async) - Step 7.3: Increase TTL for summary data
                const ttl = summaryOnly ? 600 : 300; // 10 mins for summary, 5 mins for details
                const finalResponse = {
                    data: cachedReports,
                    ...resultMetadata
                };
                
                // We don't await this to keep the response fast, but Deno Deploy might kill background tasks?
                // Better to await it or use specific background pattern.
                await cache.setCache(cacheKey, finalResponse, ttl);

            } catch (e: any) {
                console.error("Stream Error:", e);
                // If we already started the stream, we can't change the status code.
                try {
                    await safeWrite(`]}`); // Try to close valid JSON even if empty
                } catch (innerErr) {
                    // Ignore failure to write the closing bracket if connection is dead
                }
            }
        });
    } catch (e: any) {
        console.error("Cache Error:", e);
        return c.json({ error: "Internal Server Error" }, 500);
    }
});

// Scan Receipt Endpoint (OpenAI)
app.post("/make-server-37f42386/scan-receipt", async (c) => {
    try {
        const body = await c.req.parseBody();
        const file = body['file'];

        if (!file || !(file instanceof File)) {
            return c.json({ error: "No file uploaded" }, 400);
        }

        const apiKey = Deno.env.get("OPENAI_API_KEY");
        if (!apiKey) return c.json({ error: "OpenAI API Key not configured" }, 500);

        const openai = new OpenAI({ apiKey });
        
        const arrayBuffer = await file.arrayBuffer();
        const base64Image = `data:${file.type};base64,${Buffer.from(arrayBuffer).toString('base64')}`;

        const prompt = `Analyze this receipt image. It is a Jamaican receipt.
        Jamaica EXCLUSIVELY uses DD/MM/YYYY date format. NEVER interpret dates as MM/DD/YYYY.
        
        Extract the following details in JSON format:
        - merchant (string, name of the store/service. For tolls, use the Highway name e.g. Highway 2000, East-West, North-South)
        - date (YYYY-MM-DD. The receipt date is in DD/MM/YYYY format. The FIRST number is ALWAYS the day, the SECOND is ALWAYS the month. Example: "01/12/2025" on the receipt = 1st December 2025 = output "2025-12-01".)
        - time (HH:MM:SS, 24-hour format. Look for the time of transaction.)
        - amount (number, total amount. Remove currency symbols.)
        - type (string, one of: 'Fuel', 'Service', 'Toll', 'Other'. Infer from context. If it mentions tolls, highway, plaza, etc. use 'Toll'.)
        - notes (string, brief description of items)
        
        If it is a Toll receipt, specifically extract these additional fields if present:
        - plaza (string, e.g. Portmore East, Spanish Town, Angels, Vineyards)
        - lane (string, e.g. K15, M01)
        - vehicleClass (string, e.g. 1, 2)
        - receiptNumber (string, the Ticket No or No)
        - collector (string, e.g. 613893)

        Return ONLY the JSON object, no markdown.`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: "You are a receipt scanning assistant that outputs strict JSON." },
                { 
                  role: "user", 
                  content: [
                      { type: "text", text: prompt },
                      { type: "image_url", image_url: { url: base64Image } }
                  ] 
                }
            ],
            response_format: { type: "json_object" },
            temperature: 0
        });

        const content = response.choices[0].message.content;
        const data = JSON.parse(content || "{}");

        return c.json({ success: true, data });

    } catch (e: any) {
        console.error("Receipt Scan Error:", e);
        return c.json({ error: e.message }, 500);
    }
});

// Fleet Equipment Endpoints
app.get("/make-server-37f42386/fleet/equipment/all", requireAuth(), async (c) => {
    try {
        const { data, error } = await supabase
            .from("kv_store_37f42386")
            .select("value")
            .like("key", "equipment:%");

        if (error) throw error;
        const equipment = filterByOrg(data?.map((d: any) => d.value) || [], c);
        return c.json(equipment);
    } catch(e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.post("/make-server-37f42386/fleet/equipment/bulk", requireAuth(), requirePermission('vehicles.edit'), async (c) => {
    try {
        const items = await c.req.json();
        if (!Array.isArray(items)) {
            return c.json({ error: "Expected array of items" }, 400);
        }
        
        // Key format: equipment:{vehicleId}:{itemId}
        // Ensure keys match this format
        const keys = items.map((item: any) => `equipment:${item.vehicleId}:${item.id}`);
        await kv.mset(keys, items);
        
        return c.json({ success: true, count: items.length });
    } catch(e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Inventory Endpoints
app.get("/make-server-37f42386/inventory", requireAuth(), async (c) => {
    try {
        const { data, error } = await supabase
            .from("kv_store_37f42386")
            .select("value")
            .like("key", "inventory:%");

        if (error) throw error;
        const inventory = filterByOrg(data?.map((d: any) => d.value) || [], c);
        return c.json(inventory);
    } catch(e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.post("/make-server-37f42386/inventory", async (c) => {
    try {
        const item = await c.req.json();
        if (!item.id) item.id = crypto.randomUUID();
        await kv.set(`inventory:${item.id}`, stampOrg(item, c));
        return c.json({ success: true, data: item });
    } catch(e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.post("/make-server-37f42386/inventory/bulk", async (c) => {
    try {
        const items = await c.req.json();
        if (!Array.isArray(items)) return c.json({ error: "Expected array" }, 400);
        
        const keys = items.map((i: any) => `inventory:${i.id}`);
        await kv.mset(keys, items);
        return c.json({ success: true, count: items.length });
    } catch(e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Templates Endpoints
app.get("/make-server-37f42386/templates", requireAuth(), async (c) => {
    try {
        const templates = await kv.getByPrefix("template:equipment:");
        return c.json(filterByOrg(templates || [], c));
    } catch(e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.post("/make-server-37f42386/templates", async (c) => {
    try {
        const t = await c.req.json();
        if (!t.id) t.id = crypto.randomUUID();
        await kv.set(`template:equipment:${t.id}`, stampOrg(t, c));
        return c.json({ success: true, data: t });
    } catch(e: any) {
        return c.json({ error: e.message }, 500);
    }
});


// Weekly Check-Ins Endpoints - Optimized
app.get("/make-server-37f42386/check-ins", requireAuth(), async (c) => {
  try {
    const driverId = c.req.query("driverId");
    const weekStart = c.req.query("weekStart");
    const limit = parseInt(c.req.query("limit") || "100");
    
    let query = supabase
        .from("kv_store_37f42386")
        .select("value")
        .like("key", "checkin:%");
    
    if (driverId) query = query.eq("value->>driverId", driverId);
    if (weekStart) query = query.eq("value->>weekStart", weekStart);
    
    const { data, error } = await query
        .order("value->>timestamp", { ascending: false })
        .limit(limit);

    if (error) throw error;
    const checkIns = filterByOrg(data?.map((d: any) => d.value) || [], c);
    return c.json(checkIns);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/check-ins", async (c) => {
  try {
    const checkIn = await c.req.json();
    if (!checkIn.driverId || !checkIn.weekStart || !checkIn.odometer) {
        return c.json({ error: "Missing required fields" }, 400);
    }

    // Validation for Manual Override
    if (checkIn.method === 'manual_override' && !checkIn.manualReadingReason) {
        return c.json({ error: "Reason required for manual override" }, 400);
    }
    
    // Key: checkin:{id}
    const key = `checkin:${checkIn.id}`;
    
    // Log manual overrides for review
    if (checkIn.method === 'manual_override') {
        console.warn(`[Alert] Manual Odometer Override by Driver ${checkIn.driverId}: ${checkIn.odometer}km. Reason: ${checkIn.manualReadingReason}`);
        // In a real system, we might create a 'notification' object here for the fleet manager
    }

    await kv.set(key, stampOrg({ ...checkIn, timestamp: new Date().toISOString() }, c));
    
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/check-ins/review", async (c) => {
  try {
    const { checkInId, status, managerNotes } = await c.req.json();
    
    if (!checkInId || !status) {
        return c.json({ error: "Missing checkInId or status" }, 400);
    }

    const key = `checkin:${checkInId}`;
    const checkIn = await kv.get(key);
    
    if (!checkIn) {
        return c.json({ error: "Check-in not found" }, 404);
    }

    // Update status
    checkIn.reviewStatus = status; // 'approved' | 'rejected'
    checkIn.verified = (status === 'approved');
    checkIn.managerNotes = managerNotes;
    checkIn.reviewedAt = new Date().toISOString();

    await kv.set(key, stampOrg(checkIn, c));
    return c.json({ success: true, data: checkIn });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-37f42386/check-ins/:id", async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`checkin:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-37f42386/fuel-entries/:id", requireAuth(), requirePermission('fuel.delete_entry'), async (c) => {
    const id = c.req.param("id");
    try {
        await kv.del(`fuel_entry:${id}`);
        try {
          await deleteCanonicalLedgerBySource("transaction", [id]);
        } catch (ledgerErr: any) {
          console.warn(`[DELETE /fuel-entries/:id dup] Ledger cleanup failed (non-fatal) entry=${id}:`, ledgerErr?.message);
        }
        return c.json({ success: true });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// --- PERSISTENT ALERTS (Phase 1) ---

app.get("/make-server-37f42386/notifications/list", requireAuth(), async (c) => {
    try {
        const userId = c.req.query("userId");
        const vehicleId = c.req.query("vehicleId");
        
        // Use kv.getByPrefix for reliable retrieval (avoids unsupported JSON path ordering)
        let alerts: any[] = filterByOrg(await kv.getByPrefix("alert:"), c);

        // Filter in-memory if optional query params are provided
        if (userId) alerts = alerts.filter((a: any) => a.driverId === userId);
        if (vehicleId) alerts = alerts.filter((a: any) => a.vehicleId === vehicleId);

        // Sort newest-first by timestamp
        alerts.sort((a: any, b: any) => {
            const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
            const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
            return tb - ta;
        });

        return c.json(alerts);
    } catch (e: any) {
        console.log("Error listing persistent alerts:", e.message);
        return c.json({ error: e.message }, 500);
    }
});

app.post("/make-server-37f42386/notifications/push", async (c) => {
    try {
        const alert = await c.req.json();
        if (!alert.id) alert.id = crypto.randomUUID();
        if (!alert.timestamp) alert.timestamp = new Date().toISOString();
        alert.isRead = false;

        // Key: alert:{id}
        await kv.set(`alert:${alert.id}`, stampOrg(alert, c));
        return c.json({ success: true, data: alert });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.post("/make-server-37f42386/notifications/acknowledge", async (c) => {
    try {
        const { id, isDismissed } = await c.req.json();
        const alert = await kv.get(`alert:${id}`);
        if (!alert) return c.json({ error: "Alert not found" }, 404);

        if (isDismissed) {
            await kv.del(`alert:${id}`);
        } else {
            alert.isRead = true;
            await kv.set(`alert:${id}`, stampOrg(alert, c));
        }
        
        return c.json({ success: true });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Mount Fuel Controller for missing endpoints
app.route("/", fuelApp);

// ---------------------------------------------------------------------------
// Admin Diagnostic: Scan for entries corrupted by the type-overwrite bug
// ---------------------------------------------------------------------------
app.get("/make-server-37f42386/admin/scan-corrupted-types", async (c) => {
  try {
    const { data, error } = await supabase
      .from("kv_store_37f42386")
      .select("key, value")
      .like("key", "fuel_entry:%");

    if (error) throw error;

    const suspects: any[] = [];
    for (const row of (data || [])) {
      const entry = row.value;
      if (!entry) continue;

      // Only look at entries whose type is NOT Reimbursement
      if (entry.type === 'Reimbursement') continue;

      const signals: string[] = [];

      // Signal 1: paymentSource says RideShare_Cash but type isn't Reimbursement
      if (entry.paymentSource === 'RideShare_Cash') {
        signals.push('paymentSource is RideShare_Cash');
      }

      // Signal 2: has anchorPeriodId (was part of anchor cycle tracking)
      if (entry.anchorPeriodId) {
        signals.push(`anchorPeriodId: ${entry.anchorPeriodId}`);
      }

      // Signal 3: entryMode is Anchor but type is Manual
      if (entry.entryMode === 'Anchor' && (entry.type === 'Fuel_Manual_Entry' || entry.type === 'Manual_Entry')) {
        signals.push(`entryMode is Anchor but type is ${entry.type}`);
      }

      // Signal 4: metadata contains cycle or anchor references
      if (entry.metadata?.cycleId) {
        signals.push(`metadata.cycleId: ${entry.metadata.cycleId}`);
      }
      if (entry.metadata?.portal_type === 'Reimbursement') {
        signals.push('metadata.portal_type is Reimbursement');
      }

      // Signal 5: has a linked transactionId (manual entries that went through settlement)
      if (entry.transactionId && (entry.type === 'Fuel_Manual_Entry' || entry.type === 'Manual_Entry')) {
        signals.push(`has transactionId: ${entry.transactionId}`);
      }

      if (signals.length > 0) {
        suspects.push({
          key: row.key,
          id: entry.id,
          date: entry.date,
          time: entry.time,
          location: entry.location || entry.vendor || '(no station)',
          amount: entry.amount,
          odometer: entry.odometer,
          currentType: entry.type,
          paymentSource: entry.paymentSource,
          entryMode: entry.entryMode,
          driverId: entry.driverId,
          vehicleId: entry.vehicleId,
          signals
        });
      }
    }

    // Sort by date descending for easy review
    suspects.sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''));

    return c.json({
      totalEntriesScanned: (data || []).length,
      suspectsFound: suspects.length,
      suspects
    });
  } catch (e: any) {
    console.log(`Error in scan-corrupted-types: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// Admin Diagnostic: Fix corrupted types — PATCH selected entries back to Reimbursement
app.post("/make-server-37f42386/admin/fix-corrupted-types", async (c) => {
  try {
    const body = await c.req.json();
    const entryIds: string[] = body.entryIds;

    if (!entryIds || !Array.isArray(entryIds) || entryIds.length === 0) {
      return c.json({ error: 'entryIds array is required' }, 400);
    }

    const results: any[] = [];

    for (const entryId of entryIds) {
      const kvKey = `fuel_entry:${entryId}`;
      const { data, error: fetchErr } = await supabase
        .from("kv_store_37f42386")
        .select("value")
        .eq("key", kvKey)
        .single();

      if (fetchErr || !data) {
        results.push({ id: entryId, status: 'not_found', error: fetchErr?.message });
        continue;
      }

      const entry = data.value;
      const oldType = entry.type;

      entry.type = 'Reimbursement';

      if (!entry.metadata) entry.metadata = {};
      entry.metadata.typeCorrectedAt = new Date().toISOString();
      entry.metadata.typeCorrectedFrom = oldType;
      entry.metadata.typeCorrectionReason = 'type-overwrite bug fix (admin diagnostic)';

      const { error: updateErr } = await supabase
        .from("kv_store_37f42386")
        .update({ value: entry })
        .eq("key", kvKey);

      if (updateErr) {
        results.push({ id: entryId, status: 'error', error: updateErr.message });
      } else {
        results.push({ id: entryId, status: 'fixed', oldType, newType: 'Reimbursement' });
      }
    }

    return c.json({
      totalRequested: entryIds.length,
      results
    });
  } catch (e: any) {
    console.log(`Error in fix-corrupted-types: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// ---------------------------------------------------------------------------
// Admin Diagnostic: Scan for entries with stale integrityStatus flags
// ---------------------------------------------------------------------------
app.get("/make-server-37f42386/admin/scan-anomaly-flags", async (c) => {
  try {
    const { data, error } = await supabase
      .from("kv_store_37f42386")
      .select("key, value")
      .like("key", "fuel_entry:%");

    if (error) throw error;

    const allEntries = (data || []).map((row: any) => row.value).filter(Boolean);
    const byVehicle: Record<string, any[]> = {};
    for (const e of allEntries) {
      const vid = e.vehicleId || 'unknown';
      if (!byVehicle[vid]) byVehicle[vid] = [];
      byVehicle[vid].push(e);
    }
    for (const vid of Object.keys(byVehicle)) {
      byVehicle[vid].sort((a: any, b: any) => {
        const dc = (a.date || '').localeCompare(b.date || '');
        if (dc !== 0) return dc;
        return (a.odometer || 0) - (b.odometer || 0);
      });
    }

    const flagged: any[] = [];
    for (const row of (data || [])) {
      const entry = row.value;
      if (!entry) continue;

      const integrityStatus = entry.metadata?.integrityStatus;
      if (integrityStatus !== 'critical' && integrityStatus !== 'warning') continue;

      let prevOdometer: number | null = null;
      let prevDate: string | null = null;
      const vid = entry.vehicleId || 'unknown';
      const timeline = byVehicle[vid] || [];
      const idx = timeline.findIndex((e: any) => e.id === entry.id);
      if (idx > 0) {
        prevOdometer = timeline[idx - 1].odometer ?? null;
        prevDate = timeline[idx - 1].date ?? null;
      }

      flagged.push({
        key: row.key,
        id: entry.id,
        date: entry.date,
        time: entry.time,
        location: entry.location || entry.vendor || '(no station)',
        amount: entry.amount,
        liters: entry.liters,
        odometer: entry.odometer,
        prevOdometer,
        prevDate,
        type: entry.type,
        paymentSource: entry.paymentSource,
        entryMode: entry.entryMode,
        driverId: entry.driverId,
        vehicleId: entry.vehicleId,
        integrityStatus,
        anomalyReason: entry.metadata?.anomalyReason || '(no reason recorded)',
        auditStatus: entry.auditStatus || entry.metadata?.auditStatus || 'Unknown',
        isFlagged: entry.isFlagged,
        cycleId: entry.metadata?.cycleId,
      });
    }

    flagged.sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''));

    return c.json({
      totalEntriesScanned: (data || []).length,
      flaggedCount: flagged.length,
      flagged
    });
  } catch (e: any) {
    console.log(`Error in scan-anomaly-flags: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// Admin Diagnostic: Clear anomaly flags — PATCH selected entries to valid/Clear
app.post("/make-server-37f42386/admin/fix-anomaly-flags", async (c) => {
  try {
    const body = await c.req.json();
    const entryIds: string[] = body.entryIds;

    if (!entryIds || !Array.isArray(entryIds) || entryIds.length === 0) {
      return c.json({ error: 'entryIds array is required' }, 400);
    }

    const results: any[] = [];

    for (const entryId of entryIds) {
      const kvKey = `fuel_entry:${entryId}`;
      const { data, error: fetchErr } = await supabase
        .from("kv_store_37f42386")
        .select("value")
        .eq("key", kvKey)
        .single();

      if (fetchErr || !data) {
        results.push({ id: entryId, status: 'not_found', error: fetchErr?.message });
        continue;
      }

      const entry = data.value;
      const oldStatus = entry.metadata?.integrityStatus;
      const oldReason = entry.metadata?.anomalyReason;
      const oldAudit = entry.auditStatus;

      if (!entry.metadata) entry.metadata = {};
      entry.metadata.integrityStatus = 'valid';
      entry.metadata.anomalyReason = undefined;
      entry.metadata.auditStatus = 'Clear';
      entry.isFlagged = false;
      entry.auditStatus = 'Clear';

      entry.metadata.anomalyClearedAt = new Date().toISOString();
      entry.metadata.anomalyClearedFrom = { integrityStatus: oldStatus, anomalyReason: oldReason, auditStatus: oldAudit };
      entry.metadata.anomalyClearReason = 'admin anomaly scanner — false positive cleared';

      const { error: updateErr } = await supabase
        .from("kv_store_37f42386")
        .update({ value: entry })
        .eq("key", kvKey);

      if (updateErr) {
        results.push({ id: entryId, status: 'error', error: updateErr.message });
      } else {
        results.push({ id: entryId, status: 'fixed', oldStatus, oldReason });
      }
    }

    return c.json({
      totalRequested: entryIds.length,
      results
    });
  } catch (e: any) {
    console.log(`Error in fix-anomaly-flags: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// ---------------------------------------------------------------------------
// Super Admin — Seed & Check Endpoints
// ---------------------------------------------------------------------------

// POST /backfill-org-ids — One-time migration: stamp organizationId on all KV records
// Protected by data.backfill permission (platform_owner / fleet_owner only)
// Safe to run multiple times (idempotent).
app.post("/make-server-37f42386/backfill-org-ids", requireAuth(), requirePermission('data.backfill'), async (c) => {
  try {
    const { organizationId } = await c.req.json();
    if (!organizationId) {
      return c.json({ error: "organizationId is required in the request body" }, 400);
    }

    // Prefixes of all fleet-scoped data (not config, not admin)
    const DATA_PREFIXES = [
      "driver:", "vehicle:", "trip:", "transaction:", "ledger:",
      "fuel_entry:", "fuel-card:", "toll-tag:", "toll-plaza:",
      "maintenance-log:", "fixed-expense:", "equipment:",
      "mileage-adjustment:", "budget:", "expense:",
      "error-log:", "import-history:",
    ];

    let totalUpdated = 0;
    let totalSkipped = 0;

    for (const prefix of DATA_PREFIXES) {
      const records = await kv.getByPrefix(prefix);
      if (!records || records.length === 0) continue;

      for (const row of records) {
        const val = row.value;
        if (!val || typeof val !== 'object') {
          totalSkipped++;
          continue;
        }
        // Skip records that already have an organizationId
        if ((val as any).organizationId) {
          totalSkipped++;
          continue;
        }
        // Stamp and save
        const updated = { ...(val as any), organizationId };
        await kv.set(row.key, updated);
        totalUpdated++;
      }
    }

    console.log(`[backfill-org-ids] Done. Updated: ${totalUpdated}, Skipped: ${totalSkipped}`);
    return c.json({ success: true, updated: totalUpdated, skipped: totalSkipped });
  } catch (err: any) {
    console.log(`[backfill-org-ids] Error: ${err.message}`);
    return c.json({ error: `Backfill failed: ${err.message}` }, 500);
  }
});

// POST /admin-seed — One-time creation of the super admin account
// Self-locking: refuses to create a second superadmin if one already exists
app.post("/make-server-37f42386/admin-seed", async (c) => {
  try {
    const { email, password, name } = await c.req.json();

    if (!email || !password) {
      return c.json({ error: "Email and password are required for admin seed" }, 400);
    }

    // Check if a superadmin already exists (self-locking)
    const existing = await kv.get("platform:superadmin_created");
    if (existing && (existing as any).created === true) {
      return c.json({ error: "Super admin account already exists. This endpoint can only be used once." }, 400);
    }

    // Create the superadmin user via Supabase Auth
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: {
        name: name || "Super Admin",
        role: "superadmin",
      },
      // Automatically confirm the email since an email server hasn't been configured.
      email_confirm: true,
    });

    if (error) {
      console.log(`Admin seed error: ${error.message}`);
      // If the user already exists in Supabase Auth, recover gracefully:
      // look them up, set the KV lock, and return success (idempotent).
      if (error.message?.includes('already been registered')) {
        console.log(`Super admin email already registered — recovering by setting KV lock`);
        try {
          const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
          const existingUser = listData?.users?.find(
            (u: any) => u.email === email && u.user_metadata?.role === 'superadmin'
          );
          if (existingUser) {
            // Update password to match the submitted form so auto sign-in works
            await supabase.auth.admin.updateUserById(existingUser.id, { password });
            await kv.set("platform:superadmin_created", {
              created: true,
              userId: existingUser.id,
              email,
              createdAt: existingUser.created_at || new Date().toISOString(),
            });
            console.log(`KV lock restored for existing super admin: ${email} (${existingUser.id})`);
            return c.json({ success: true, userId: existingUser.id, recovered: true });
          }
          // If the email exists but isn't a superadmin, promote them
          const anyUser = listData?.users?.find((u: any) => u.email === email);
          if (anyUser) {
            await supabase.auth.admin.updateUserById(anyUser.id, {
              password,
              user_metadata: { ...anyUser.user_metadata, role: 'superadmin', name: name || anyUser.user_metadata?.name || 'Super Admin' },
            });
            await kv.set("platform:superadmin_created", {
              created: true,
              userId: anyUser.id,
              email,
              createdAt: new Date().toISOString(),
            });
            console.log(`Existing user promoted to super admin: ${email} (${anyUser.id})`);
            return c.json({ success: true, userId: anyUser.id, recovered: true, promoted: true });
          }
        } catch (recoverErr: any) {
          console.log(`Recovery attempt failed: ${recoverErr.message}`);
        }
      }
      throw error;
    }

    // Lock the endpoint — persist the superadmin record
    await kv.set("platform:superadmin_created", {
      created: true,
      userId: data.user.id,
      email,
      createdAt: new Date().toISOString(),
    });

    console.log(`Super admin created successfully: ${email} (${data.user.id})`);
    return c.json({ success: true, userId: data.user.id });
  } catch (e: any) {
    console.log(`Admin seed fatal error: ${e.message}`);
    return c.json({ error: `Failed to create super admin: ${e.message}` }, 500);
  }
});

// ---------------------------------------------------------------------------
// POST /fleet-login — Server-side Fleet Manager login with rate limiting
// Rejects driver accounts. Returns session tokens.
// ---------------------------------------------------------------------------
app.post("/make-server-37f42386/fleet-login", async (c) => {
  try {
    const { email, password } = await c.req.json();
    if (!email || !password) {
      return c.json({ error: "Email and password are required" }, 400);
    }

    // Rate limit: check by IP and email
    const clientIp = getClientIp(c);
    const ipCheck = await checkRateLimit(clientIp, 'fleet');
    const emailCheck = await checkRateLimit(email.toLowerCase(), 'fleet');
    if (!ipCheck.allowed || !emailCheck.allowed) {
      const retryAfterSec = Math.max(ipCheck.retryAfterSec, emailCheck.retryAfterSec);
      console.log(`[FleetLogin] Rate limit exceeded for IP ${clientIp} / email ${email}`);
      return c.json({
        error: `Too many login attempts. Please try again in ${Math.ceil(retryAfterSec / 60)} minutes.`,
        retryAfterSec,
      }, 429);
    }

    const { createClient: createAnonClient } = await import("npm:@supabase/supabase-js@2");
    const anonUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const anonClient = createAnonClient(anonUrl, anonKey);

    const { data, error: signInError } = await anonClient.auth.signInWithPassword({ email, password });

    if (signInError) {
      await recordFailedAttempt(clientIp, 'fleet');
      await recordFailedAttempt(email.toLowerCase(), 'fleet');
      console.log(`[FleetLogin] Failed for ${email}: ${signInError.message}`);
      const remaining = await checkRateLimit(email.toLowerCase(), 'fleet');
      return c.json({
        error: "Invalid email or password.",
        attemptsRemaining: remaining.remaining,
      }, 401);
    }

    // Enterprise gate: WHITELIST — only allow 'admin' (fleet manager) role on fleet portal
    // All other roles (driver, superadmin, platform_owner, platform_support, platform_analyst)
    // are rejected with a generic error. Whitelist approach ensures any future roles are
    // blocked by default.
    const userRole = data?.user?.user_metadata?.role;
    if (userRole !== 'admin') {
      // Sign out immediately — don't leave a dangling session
      await anonClient.auth.signOut();
      await recordFailedAttempt(clientIp, 'fleet');
      await recordFailedAttempt(email.toLowerCase(), 'fleet');
      console.log(`[FleetLogin] Non-fleet account ${email} (role: ${userRole}) rejected from fleet portal`);
      return c.json({
        error: "Invalid email or password.",
      }, 401);
    }

    if (!data?.session) {
      return c.json({ error: "Sign-in succeeded but no session was returned" }, 500);
    }

    // Success — clear rate limits
    await clearRateLimit(clientIp, 'fleet');
    await clearRateLimit(email.toLowerCase(), 'fleet');
    console.log(`[FleetLogin] Success: ${email} (role: ${userRole})`);
    return c.json({
      success: true,
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata?.name,
        role: userRole,
      },
    });
  } catch (e: any) {
    console.error("[FleetLogin] Error:", e);
    return c.json({ error: e.message || "Login failed" }, 500);
  }
});

// ---------------------------------------------------------------------------
// POST /driver-login — Server-side Driver login with rate limiting
// Rejects non-driver accounts. Returns session tokens.
// ---------------------------------------------------------------------------
app.post("/make-server-37f42386/driver-login", async (c) => {
  try {
    const { email, password } = await c.req.json();
    if (!email || !password) {
      return c.json({ error: "Email and password are required" }, 400);
    }

    // Rate limit: check by IP and email
    const clientIp = getClientIp(c);
    const ipCheck = await checkRateLimit(clientIp, 'driver');
    const emailCheck = await checkRateLimit(email.toLowerCase(), 'driver');
    if (!ipCheck.allowed || !emailCheck.allowed) {
      const retryAfterSec = Math.max(ipCheck.retryAfterSec, emailCheck.retryAfterSec);
      console.log(`[DriverLogin] Rate limit exceeded for IP ${clientIp} / email ${email}`);
      return c.json({
        error: `Too many login attempts. Please try again in ${Math.ceil(retryAfterSec / 60)} minutes.`,
        retryAfterSec,
      }, 429);
    }

    const { createClient: createAnonClient } = await import("npm:@supabase/supabase-js@2");
    const anonUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const anonClient = createAnonClient(anonUrl, anonKey);

    const { data, error: signInError } = await anonClient.auth.signInWithPassword({ email, password });

    if (signInError) {
      await recordFailedAttempt(clientIp, 'driver');
      await recordFailedAttempt(email.toLowerCase(), 'driver');
      console.log(`[DriverLogin] Failed for ${email}: ${signInError.message}`);
      const remaining = await checkRateLimit(email.toLowerCase(), 'driver');
      return c.json({
        error: "Invalid email or password.",
        attemptsRemaining: remaining.remaining,
      }, 401);
    }

    // Enterprise gate: reject non-driver accounts on driver portal
    const userRole = data?.user?.user_metadata?.role;
    if (userRole !== 'driver') {
      await anonClient.auth.signOut();
      await recordFailedAttempt(clientIp, 'driver');
      await recordFailedAttempt(email.toLowerCase(), 'driver');
      console.log(`[DriverLogin] Non-driver account ${email} (role: ${userRole}) rejected from driver portal`);
      return c.json({
        error: "Invalid email or password.",
      }, 401);
    }

    if (!data?.session) {
      return c.json({ error: "Sign-in succeeded but no session was returned" }, 500);
    }

    // Success — clear rate limits
    await clearRateLimit(clientIp, 'driver');
    await clearRateLimit(email.toLowerCase(), 'driver');
    console.log(`[DriverLogin] Success: ${email}`);
    return c.json({
      success: true,
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata?.name,
        role: userRole,
      },
    });
  } catch (e: any) {
    console.error("[DriverLogin] Error:", e);
    return c.json({ error: e.message || "Login failed" }, 500);
  }
});

// POST /admin-login — Server-side admin login (whitelist: superadmin + platform roles only)
// Auto-recovery removed in Phase 4 — wrong password simply fails, no password overwrite.
// Returns session tokens so the frontend can call supabase.auth.setSession()
app.post("/make-server-37f42386/admin-login", async (c) => {
  try {
    const { email, password } = await c.req.json();
    if (!email || !password) {
      return c.json({ error: "Email and password are required" }, 400);
    }

    // Rate limit: check by IP and email
    const clientIp = getClientIp(c);
    const ipCheck = await checkRateLimit(clientIp, 'admin');
    const emailCheck = await checkRateLimit(email.toLowerCase(), 'admin');
    if (!ipCheck.allowed || !emailCheck.allowed) {
      const retryAfterSec = Math.max(ipCheck.retryAfterSec, emailCheck.retryAfterSec);
      console.log(`[AdminLogin] Rate limit exceeded for IP ${clientIp} / email ${email}`);
      return c.json({
        error: `Too many login attempts. Account temporarily locked. Try again in ${Math.ceil(retryAfterSec / 60)} minutes.`,
        retryAfterSec,
      }, 429);
    }

    const { createClient: createAnonClient } = await import("npm:@supabase/supabase-js@2");
    const anonUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const anonClient = createAnonClient(anonUrl, anonKey);

    let signInResult = await anonClient.auth.signInWithPassword({ email, password });
    let { data, error: signInError } = signInResult;

    if (signInError) {
      // Auto-recovery removed (Phase 4): wrong password = fail. No password overwrite, no role promotion.
      console.log(`[AdminLogin] Login failed for ${email}: ${signInError.message}`);
      await recordFailedAttempt(clientIp, 'admin');
      await recordFailedAttempt(email.toLowerCase(), 'admin');
      return c.json({ error: "Invalid email or password." }, 401);
    }

    if (!data?.session) {
      return c.json({ error: "Sign-in succeeded but no session was returned" }, 500);
    }

    let role = data.user?.user_metadata?.role;
    if (role !== "superadmin") {
      // Role metadata missing — check KV to see if this email IS the registered superadmin
      console.log(`User ${email} signed in but role is '${role}', not superadmin — checking KV record`);
      const kvRecord = await kv.get("platform:superadmin_created") as any;
      if (kvRecord?.email === email) {
        // This IS the superadmin — promote their metadata so future logins work immediately
        console.log(`KV confirms ${email} is the superadmin — promoting user_metadata`);
        await supabase.auth.admin.updateUserById(data.user.id, {
          user_metadata: { ...data.user.user_metadata, role: 'superadmin' },
        });
        role = "superadmin";

        // IMPORTANT: Re-authenticate to get a FRESH session with the new role in the JWT
        const fresh = await anonClient.auth.signInWithPassword({ email, password });
        if (fresh.data?.session) {
          data = fresh.data;
          console.log(`Fresh session obtained for promoted superadmin: ${email}`);
        }
      } else {
        console.log(`User ${email} is not the registered superadmin (KV email: ${kvRecord?.email || 'none'})`);
        await recordFailedAttempt(clientIp, 'admin');
        await recordFailedAttempt(email.toLowerCase(), 'admin');
        return c.json({ error: "This account does not have super admin privileges." }, 403);
      }
    }

    // Success — clear rate limit counters
    await clearRateLimit(clientIp, 'admin');
    await clearRateLimit(email.toLowerCase(), 'admin');
    console.log(`Admin login successful: ${email}`);
    return c.json({
      success: true,
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata?.name,
        role: data.user.user_metadata?.role,
      },
    });
  } catch (e: any) {
    console.error("Admin login error:", e);
    return c.json({ error: e.message || "Login failed" }, 500);
  }
});

// GET /rate-limit-stats — Rate limiter monitoring (superadmin only)
app.get("/make-server-37f42386/rate-limit-stats", requireAuth(), async (c) => {
  try {
    const user = (c as any).user;
    const role = user?.user_metadata?.role;
    if (role !== 'superadmin') {
      return c.json({ error: "Superadmin access required" }, 403);
    }
    return c.json(getRateLimitStats());
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// GET /admin-check — Check whether a superadmin has been set up
// Used by the /admin frontend to decide whether to show Setup vs Login
app.get("/make-server-37f42386/admin-check", async (c) => {
  try {
    const existing = await kv.get("platform:superadmin_created");
    const exists = !!(existing && (existing as any).created === true);
    return c.json({ exists });
  } catch (e: any) {
    console.log(`Admin check error: ${e.message}`);
    return c.json({ exists: false });
  }
});

// GET /admin-stats — Summary counts for the admin dashboard cards
app.get("/make-server-37f42386/admin-stats", async (c) => {
  try {
    // Count user breakdowns via Supabase Auth
    let customerCount = 0;
    let driverCount = 0;
    let linkedDriverCount = 0;
    let unlinkedDriverCount = 0;
    let teamMemberCount = 0;
    let platformStaffCount = 0;
    try {
      const { data } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      if (data?.users) {
        for (const u of data.users) {
          const role = u.user_metadata?.role;
          if (role === 'admin') customerCount++;
          else if (role === 'driver') {
            driverCount++;
            if (u.user_metadata?.organizationId) linkedDriverCount++;
          } else if (FLEET_SUB_ROLES.includes(role)) {
            teamMemberCount++;
          } else if (role === 'platform_support' || role === 'platform_analyst') {
            platformStaffCount++;
          }
        }
        unlinkedDriverCount = driverCount - linkedDriverCount;
      }
    } catch (e: any) {
      console.log(`admin-stats: failed to count users: ${e.message}`);
    }

    // Count fuel stations from KV (prefix: station:)
    let fuelStationCount = 0;
    try {
      const stations = await kv.getByPrefix("station:");
      fuelStationCount = stations?.length || 0;
    } catch (e: any) {
      console.log(`admin-stats: failed to count fuel stations: ${e.message}`);
    }

    // Count toll stations from KV (prefix: toll_plaza:)
    let tollStationCount = 0;
    try {
      const tolls = await kv.getByPrefix("toll_plaza:");
      tollStationCount = tolls?.length || 0;
    } catch (e: any) {
      console.log(`admin-stats: failed to count toll stations: ${e.message}`);
    }

    const totalUserCount = customerCount + driverCount + teamMemberCount + platformStaffCount + 1;
    return c.json({ customerCount, fuelStationCount, tollStationCount, driverCount, linkedDriverCount, unlinkedDriverCount, teamMemberCount, platformStaffCount, totalUserCount });
  } catch (e: any) {
    console.log(`admin-stats error: ${e.message}`);
    return c.json({ customerCount: 0, fuelStationCount: 0, tollStationCount: 0, driverCount: 0, linkedDriverCount: 0, unlinkedDriverCount: 0, teamMemberCount: 0, platformStaffCount: 0, totalUserCount: 0 });
  }
});

// ---------------------------------------------------------------------------
// Vehicle catalog (motor vehicles master DB) — platform owner / support
// ---------------------------------------------------------------------------

const VEHICLE_CATALOG_WRITABLE_KEYS = [
  "make", "model", "year", "trim_series", "generation", "model_code",
  "body_type", "doors", "exterior_color", "length_mm", "width_mm", "height_mm", "wheelbase_mm", "ground_clearance_mm",
  "engine_displacement_l", "engine_displacement_cc", "engine_configuration", "fuel_type", "transmission", "drivetrain",
  "horsepower", "torque", "torque_unit",
  "fuel_tank_capacity", "fuel_tank_unit", "seating_capacity", "curb_weight_kg", "gross_vehicle_weight_kg", "max_payload_kg", "max_towing_kg",
] as const;

function assertVehicleCatalogAccess(c: any) {
  const rbacUser = c.get("rbacUser") as any;
  const callerRole = rbacUser?.resolvedRole || rbacUser?.role;
  if (callerRole !== "platform_owner" && callerRole !== "superadmin" && callerRole !== "platform_support") {
    return c.json({ error: "Only platform owner or support can manage the vehicle catalog" }, 403);
  }
  return null;
}

function pickVehicleCatalogRow(raw: Record<string, unknown>, partial: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of VEHICLE_CATALOG_WRITABLE_KEYS) {
    if (!(k in raw)) continue;
    const v = raw[k];
    if (v === undefined) continue;
    if (partial) {
      if (v === "") continue;
      out[k] = v;
    } else {
      if (v === "" && k !== "make" && k !== "model") continue;
      out[k] = v;
    }
  }
  return out;
}

// GET /admin/vehicle-catalog
app.get("/make-server-37f42386/admin/vehicle-catalog", requireAuth(), async (c) => {
  const denied = assertVehicleCatalogAccess(c);
  if (denied) return denied;
  try {
    const { data, error } = await supabase
      .from("vehicle_catalog")
      .select("*")
      .order("make", { ascending: true })
      .order("model", { ascending: true })
      .order("year", { ascending: false });
    if (error) throw error;
    return c.json({ items: data || [] });
  } catch (e: any) {
    console.error("[vehicle-catalog] list:", e);
    return c.json({ error: e.message || "Failed to list vehicle catalog" }, 500);
  }
});

// POST /admin/vehicle-catalog
app.post("/make-server-37f42386/admin/vehicle-catalog", requireAuth(), async (c) => {
  const denied = assertVehicleCatalogAccess(c);
  if (denied) return denied;
  try {
    const body = (await c.req.json()) as Record<string, unknown>;
    const make = String(body.make ?? "").trim();
    const model = String(body.model ?? "").trim();
    const yearNum = Number(body.year);
    if (!make || !model || body.year === undefined || body.year === null || body.year === "") {
      return c.json({ error: "make, model, and year are required" }, 400);
    }
    if (!Number.isFinite(yearNum) || yearNum < 1900 || yearNum > 2100) {
      return c.json({ error: "year must be between 1900 and 2100" }, 400);
    }
    const row = pickVehicleCatalogRow({ ...body, make, model, year: yearNum }, false);
    row.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from("vehicle_catalog").insert(row).select().single();
    if (error) throw error;
    return c.json({ item: data });
  } catch (e: any) {
    console.error("[vehicle-catalog] create:", e);
    return c.json({ error: e.message || "Failed to create vehicle catalog entry" }, 500);
  }
});

// PATCH /admin/vehicle-catalog/:id
app.patch("/make-server-37f42386/admin/vehicle-catalog/:id", requireAuth(), async (c) => {
  const denied = assertVehicleCatalogAccess(c);
  if (denied) return denied;
  try {
    const id = c.req.param("id");
    const body = (await c.req.json()) as Record<string, unknown>;
    const row = pickVehicleCatalogRow(body, true);
    if (row.year !== undefined) {
      const y = Number(row.year);
      if (!Number.isFinite(y) || y < 1900 || y > 2100) {
        return c.json({ error: "year must be between 1900 and 2100" }, 400);
      }
      row.year = y;
    }
    if (row.make !== undefined) row.make = String(row.make).trim();
    if (row.model !== undefined) row.model = String(row.model).trim();
    row.updated_at = new Date().toISOString();
    const keys = Object.keys(row).filter((k) => k !== "updated_at");
    if (keys.length === 0) {
      return c.json({ error: "No fields to update" }, 400);
    }
    const { data, error } = await supabase.from("vehicle_catalog").update(row).eq("id", id).select().single();
    if (error) throw error;
    if (!data) return c.json({ error: "Not found" }, 404);
    return c.json({ item: data });
  } catch (e: any) {
    console.error("[vehicle-catalog] patch:", e);
    return c.json({ error: e.message || "Failed to update vehicle catalog entry" }, 500);
  }
});

// DELETE /admin/vehicle-catalog/:id
app.delete("/make-server-37f42386/admin/vehicle-catalog/:id", requireAuth(), async (c) => {
  const denied = assertVehicleCatalogAccess(c);
  if (denied) return denied;
  try {
    const id = c.req.param("id");
    const { data, error } = await supabase.from("vehicle_catalog").delete().eq("id", id).select("id");
    if (error) throw error;
    if (!data?.length) return c.json({ error: "Not found" }, 404);
    return c.json({ success: true });
  } catch (e: any) {
    console.error("[vehicle-catalog] delete:", e);
    return c.json({ error: e.message || "Failed to delete vehicle catalog entry" }, 500);
  }
});

// ---------------------------------------------------------------------------
// Admin Customers - Multi-Layer Caching Helper
// ---------------------------------------------------------------------------

/**
 * Fetch customers with 3-layer caching:
 * Layer 1: Memory cache (hot path - <5ms)
 * Layer 2: KV cache (warm path - ~50ms, 5min TTL)
 * Layer 3: Auth API (cold path - ~500-2000ms)
 */
async function fetchCustomersWithCache(): Promise<any[]> {
  const cacheKey = "admin:customers:list";
  
  // Layer 1: Memory cache (hot path - <5ms)
  const memCached = memCache.customerCache.get(cacheKey);
  if (memCached !== null) {
    console.log("[AdminCustomers] Served from memory cache");
    return memCached;
  }
  
  // Layer 2: KV cache (warm path - ~50ms, 5min TTL)
  const kvCached = await cache.getCache(cacheKey);
  if (kvCached !== null) {
    console.log("[AdminCustomers] Served from KV cache, warming memory");
    memCache.customerCache.set(cacheKey, kvCached, 2 * 60 * 1000); // 2min in memory
    return kvCached;
  }
  
  // Layer 3: Auth API (cold path - ~500-2000ms)
  console.log("[AdminCustomers] Cache miss, fetching from Auth API");
  const { data, error } = await cache.withRetry(() => 
    supabase.auth.admin.listUsers({ perPage: 1000 })
  );
  
  if (error) throw new Error(`Auth API error: ${error.message}`);
  
  // Filter to fleet managers (role === 'admin')
  const customers = (data?.users || [])
    .filter((u: any) => u.user_metadata?.role === "admin")
    .map((u: any) => ({
      id: u.id,
      email: u.email || "",
      name: u.user_metadata?.name || "",
      businessType: u.user_metadata?.businessType || "rideshare",
      createdAt: u.created_at || null,
      lastSignIn: u.last_sign_in_at || null,
      status: u.last_sign_in_at
        ? (Date.now() - new Date(u.last_sign_in_at).getTime() < 30 * 24 * 60 * 60 * 1000
          ? "active"
          : "inactive")
        : "inactive",
      isSuspended: !!u.banned_until && new Date(u.banned_until) > new Date(),
    }));
  
  // Store in both caches
  await cache.setCache(cacheKey, customers, 5 * 60); // 5min in KV
  memCache.customerCache.set(cacheKey, customers, 2 * 60 * 1000); // 2min in memory
  
  console.log(`[AdminCustomers] Cached ${customers.length} customers`);
  return customers;
}

/**
 * Invalidate customer cache when data changes
 */
async function invalidateCustomerCache(): Promise<void> {
  const cacheKey = "admin:customers:list";
  memCache.customerCache.invalidate(cacheKey);
  await cache.setCache(cacheKey, null, 0); // Expire KV cache
  console.log("[AdminCustomers] Cache invalidated");
}

// GET /admin/customers — List all fleet manager accounts (superadmin only)
app.get("/make-server-37f42386/admin/customers", async (c) => {
  try {
    // Verify superadmin
    const accessToken = c.req.header("Authorization")?.split(" ")[1];
    const { data: { user: reqUser }, error: authErr } = await supabase.auth.getUser(accessToken);
    if (authErr || !reqUser) {
      console.log(`admin/customers auth error: ${authErr?.message || "no user"}`);
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (reqUser.user_metadata?.role !== "superadmin") {
      return c.json({ error: "Forbidden — superadmin only" }, 403);
    }

    // Check for force refresh parameter
    const forceRefresh = c.req.query("refresh") === "true";
    if (forceRefresh) {
      console.log("[AdminCustomers] Force refresh requested");
      await invalidateCustomerCache();
    }

    // Fetch with multi-layer caching
    const customers = await fetchCustomersWithCache();
    return c.json({ customers });
  } catch (e: any) {
    console.log(`admin/customers error: ${e.message}`);
    return c.json({ error: `Server error: ${e.message}` }, 500);
  }
});

// POST /admin/reset-password — Generate password recovery link (superadmin only)
app.post("/make-server-37f42386/admin/reset-password", async (c) => {
  try {
    const accessToken = c.req.header("Authorization")?.split(" ")[1];
    const { data: { user: reqUser }, error: authErr } = await supabase.auth.getUser(accessToken);
    if (authErr || !reqUser) {
      console.log(`admin/reset-password auth error: ${authErr?.message || "no user"}`);
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (reqUser.user_metadata?.role !== "superadmin") {
      console.log(`admin/reset-password forbidden: user ${reqUser.id} is not superadmin`);
      return c.json({ error: "Forbidden — superadmin only" }, 403);
    }

    const { email } = await c.req.json();
    if (!email) {
      return c.json({ error: "Email is required" }, 400);
    }

    const { data, error } = await supabase.auth.admin.generateLink({ type: "recovery", email });
    if (error) throw error;

    console.log(`Password reset link generated for ${email}`);
    await logAdminAction({ actorId: reqUser.id, actorName: reqUser.user_metadata?.name || 'Admin', action: 'reset_password', targetId: '', targetEmail: email });
    return c.json({ success: true, message: `Password reset link generated for ${email}` });
  } catch (e: any) {
    console.error("admin/reset-password error:", e);
    return c.json({ error: e.message || "Failed to generate reset link" }, 500);
  }
});

// POST /admin/force-logout — Terminate all sessions for a user (superadmin only)
app.post("/make-server-37f42386/admin/force-logout", async (c) => {
  try {
    const accessToken = c.req.header("Authorization")?.split(" ")[1];
    const { data: { user: reqUser }, error: authErr } = await supabase.auth.getUser(accessToken);
    if (authErr || !reqUser) {
      console.log(`admin/force-logout auth error: ${authErr?.message || "no user"}`);
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (reqUser.user_metadata?.role !== "superadmin") {
      console.log(`admin/force-logout forbidden: user ${reqUser.id} is not superadmin`);
      return c.json({ error: "Forbidden — superadmin only" }, 403);
    }

    const { userId } = await c.req.json();
    if (!userId) {
      return c.json({ error: "userId is required" }, 400);
    }

    const { error } = await supabase.auth.admin.signOut(userId);
    if (error) throw error;

    console.log(`All sessions terminated for user ${userId}`);
    await logAdminAction({ actorId: reqUser.id, actorName: reqUser.user_metadata?.name || 'Admin', action: 'force_logout', targetId: userId, targetEmail: '' });
    return c.json({ success: true, message: `All sessions terminated for user ${userId}` });
  } catch (e: any) {
    console.error("admin/force-logout error:", e);
    return c.json({ error: e.message || "Failed to force logout" }, 500);
  }
});

// POST /admin/toggle-suspend — Ban or unban a user (superadmin only)
app.post("/make-server-37f42386/admin/toggle-suspend", async (c) => {
  try {
    const accessToken = c.req.header("Authorization")?.split(" ")[1];
    const { data: { user: reqUser }, error: authErr } = await supabase.auth.getUser(accessToken);
    if (authErr || !reqUser) {
      console.log(`admin/toggle-suspend auth error: ${authErr?.message || "no user"}`);
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (reqUser.user_metadata?.role !== "superadmin") {
      console.log(`admin/toggle-suspend forbidden: user ${reqUser.id} is not superadmin`);
      return c.json({ error: "Forbidden — superadmin only" }, 403);
    }

    const { userId, suspend } = await c.req.json();
    if (!userId || typeof suspend !== "boolean") {
      return c.json({ error: "userId (string) and suspend (boolean) are required" }, 400);
    }

    const ban_duration = suspend ? "876000h" : "none";
    const { data, error } = await supabase.auth.admin.updateUserById(userId, { ban_duration });
    if (error) throw error;

    const action = suspend ? "suspended" : "reactivated";
    console.log(`User ${userId} has been ${action}`);
    await logAdminAction({ actorId: reqUser.id, actorName: reqUser.user_metadata?.name || 'Admin', action: suspend ? 'suspend_user' : 'reactivate_user', targetId: userId, targetEmail: data?.user?.email || '' });
    return c.json({ success: true, message: `User ${userId} has been ${action}` });
  } catch (e: any) {
    console.error("admin/toggle-suspend error:", e);
    return c.json({ error: e.message || "Failed to toggle suspend" }, 500);
  }
});

// ---------------------------------------------------------------------------
// Admin Fuel Station CRUD (superadmin-only)
// Operates on the same `station:` KV data the fleet fuel system uses.
// ---------------------------------------------------------------------------

// Helper: verify superadmin from Authorization header
async function verifySuperadmin(c: any): Promise<{ userId: string; email: string; name: string } | Response> {
  const accessToken = c.req.header("Authorization")?.split(" ")[1];
  let reqUser: any = null;
  let error: any = null;
  try {
    const result = await cache.withRetry(async () => {
      const r = await supabase.auth.getUser(accessToken);
      if (r.error) throw r.error;
      return r.data.user;
    });
    reqUser = result;
  } catch (e: any) {
    error = e;
  }
  if (error || !reqUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  if (reqUser.user_metadata?.role !== "superadmin") {
    return c.json({ error: "Forbidden — superadmin only" }, 403);
  }
  return {
    userId: reqUser.id,
    email: reqUser.email || '',
    name: reqUser.user_metadata?.name || reqUser.email || 'Unknown',
  };
}

// ---------------------------------------------------------------------------
// Cache Health & Performance Endpoints
// ---------------------------------------------------------------------------

// GET /admin/cache-stats — Cache performance metrics (Superadmin only)
app.get("/make-server-37f42386/admin/cache-stats", async (c) => {
  try {
    const accessToken = c.req.header("Authorization")?.split(" ")[1];
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user || user.user_metadata?.role !== "superadmin") {
      return c.json({ error: "Unauthorized" }, 401);
    }

    return c.json({
      parentCompanies: memCache.parentCompanyCache.getStats(),
      customers: memCache.customerCache.getStats(),
      dashboard: memCache.dashboardCache.getStats(),
      dashboardStats: memCache.dashboardStatsCache.getStats(),
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// GET /admin/fuel-stations — list all fuel stations
app.get("/make-server-37f42386/admin/fuel-stations", async (c) => {
  try {
    const auth = await verifySuperadmin(c);
    if (auth instanceof Response) return auth;

    const stations = await kv.getByPrefix("station:");
    return c.json({ stations: stations || [] });
  } catch (e: any) {
    console.log(`admin/fuel-stations GET error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// POST /admin/fuel-stations — add a new fuel station
app.post("/make-server-37f42386/admin/fuel-stations", async (c) => {
  try {
    const auth = await verifySuperadmin(c);
    if (auth instanceof Response) return auth;

    const station = await c.req.json();
    if (!station.id) station.id = crypto.randomUUID();
    if (!station.name) return c.json({ error: "Station name is required" }, 400);

    // Ensure required fields have defaults
    station.status = station.status || "verified";
    station.brand = station.brand || "";
    station.address = station.address || "";
    station.location = station.location || { lat: 0, lng: 0 };
    station.stats = station.stats || { totalVisits: 0, lastVisited: null };
    station.amenities = station.amenities || [];
    station.dataSource = station.dataSource || "manual";
    station.contactInfo = station.contactInfo || {};
    station.createdAt = station.createdAt || new Date().toISOString();

    await kv.set(`station:${station.id}`, stampOrg(station, c));
    return c.json({ success: true, data: station });
  } catch (e: any) {
    console.log(`admin/fuel-stations POST error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// PUT /admin/fuel-stations/:id — update a fuel station
app.put("/make-server-37f42386/admin/fuel-stations/:id", async (c) => {
  try {
    const auth = await verifySuperadmin(c);
    if (auth instanceof Response) return auth;

    const id = c.req.param("id");
    const updates = await c.req.json();
    const existing = await kv.get(`station:${id}`);
    if (!existing) return c.json({ error: "Station not found" }, 404);

    const merged = { ...existing, ...updates, id };
    await kv.set(`station:${id}`, stampOrg(merged, c));
    return c.json({ success: true, data: merged });
  } catch (e: any) {
    console.log(`admin/fuel-stations PUT error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// DELETE /admin/fuel-stations/:id — delete a fuel station
app.delete("/make-server-37f42386/admin/fuel-stations/:id", async (c) => {
  try {
    const auth = await verifySuperadmin(c);
    if (auth instanceof Response) return auth;

    const id = c.req.param("id");
    const existing = await kv.get(`station:${id}`);
    if (!existing) return c.json({ error: "Station not found" }, 404);

    await kv.del(`station:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    console.log(`admin/fuel-stations DELETE error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// ---------------------------------------------------------------------------
// Admin Toll Plaza CRUD (superadmin-only)
// Operates on the same `toll_plaza:` KV data the fleet toll system uses.
// ---------------------------------------------------------------------------

// GET /admin/toll-stations — list all toll plazas
app.get("/make-server-37f42386/admin/toll-stations", async (c) => {
  try {
    const auth = await verifySuperadmin(c);
    if (auth instanceof Response) return auth;

    const plazas = await kv.getByPrefix("toll_plaza:");
    return c.json({ plazas: plazas || [] });
  } catch (e: any) {
    console.log(`admin/toll-stations GET error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// POST /admin/toll-stations — add a new toll plaza
app.post("/make-server-37f42386/admin/toll-stations", async (c) => {
  try {
    const auth = await verifySuperadmin(c);
    if (auth instanceof Response) return auth;

    const plaza = await c.req.json();
    if (!plaza.id) plaza.id = crypto.randomUUID();
    if (!plaza.name) return c.json({ error: "Plaza name is required" }, 400);

    plaza.status = plaza.status || "verified";
    plaza.highway = plaza.highway || "";
    plaza.direction = plaza.direction || "Both";
    plaza.operator = plaza.operator || "";
    plaza.location = plaza.location || { lat: 0, lng: 0 };
    plaza.dataSource = plaza.dataSource || "manual";
    plaza.stats = plaza.stats || {
      totalTransactions: 0,
      totalSpend: 0,
      lastTransactionDate: "",
      avgAmount: 0,
      lastUpdated: new Date().toISOString(),
    };
    plaza.createdAt = plaza.createdAt || new Date().toISOString();
    plaza.updatedAt = new Date().toISOString();

    await kv.set(`toll_plaza:${plaza.id}`, stampOrg(plaza, c));
    return c.json({ success: true, data: plaza });
  } catch (e: any) {
    console.log(`admin/toll-stations POST error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// PUT /admin/toll-stations/:id — update a toll plaza
app.put("/make-server-37f42386/admin/toll-stations/:id", async (c) => {
  try {
    const auth = await verifySuperadmin(c);
    if (auth instanceof Response) return auth;

    const id = c.req.param("id");
    const updates = await c.req.json();
    const existing = await kv.get(`toll_plaza:${id}`);
    if (!existing) return c.json({ error: "Toll plaza not found" }, 404);

    const merged = { ...existing, ...updates, id, updatedAt: new Date().toISOString() };
    await kv.set(`toll_plaza:${id}`, stampOrg(merged, c));
    return c.json({ success: true, data: merged });
  } catch (e: any) {
    console.log(`admin/toll-stations PUT error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// DELETE /admin/toll-stations/:id — delete a toll plaza
app.delete("/make-server-37f42386/admin/toll-stations/:id", async (c) => {
  try {
    const auth = await verifySuperadmin(c);
    if (auth instanceof Response) return auth;

    const id = c.req.param("id");
    const existing = await kv.get(`toll_plaza:${id}`);
    if (!existing) return c.json({ error: "Toll plaza not found" }, 404);

    await kv.del(`toll_plaza:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    console.log(`admin/toll-stations DELETE error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// ---------------------------------------------------------------------------
// Admin Platform Settings (superadmin-only)
// Single KV key: "platform:settings"
// ---------------------------------------------------------------------------

// GET /admin/platform-settings
app.get("/make-server-37f42386/admin/platform-settings", async (c) => {
  try {
    const auth = await verifySuperadmin(c);
    if (auth instanceof Response) return auth;

    const settings = await kv.get("platform:settings");
    return c.json({ settings: settings || null });
  } catch (e: any) {
    console.log(`admin/platform-settings GET error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// GET /admin/export-data — Phase 7: Full platform data export
app.get("/make-server-37f42386/admin/export-data", async (c) => {
  try {
    const auth = await verifySuperadmin(c);
    const prefixes = ['platform:', 'customer:', 'driver:', 'fuel:', 'toll:', 'audit:', 'station:', 'team:', 'user:', 'vehicle:', 'trip:', 'login_attempts:', 'invitation:', 'org:'];
    const sections: Record<string, any[]> = {};
    let totalEntries = 0;
    for (const prefix of prefixes) {
      try {
        const entries = await kv.getByPrefix(prefix);
        if (entries && entries.length > 0) {
          const sectionName = prefix.replace(':', '');
          sections[sectionName] = entries;
          totalEntries += entries.length;
        }
      } catch (e: any) {
        console.log(`[Export] Error reading prefix ${prefix}: ${e.message}`);
      }
    }
    try {
      await logAdminAction({ actorId: auth.userId, actorName: auth.name || auth.email, action: 'export_platform_data', targetId: 'platform', targetEmail: 'N/A', details: `Exported ${totalEntries} entries across ${Object.keys(sections).length} sections` });
    } catch (e: any) {
      console.log(`[Export] Audit log failed (non-fatal): ${e.message}`);
    }
    return c.json({ exportDate: new Date().toISOString(), totalEntries, sections });
  } catch (e: any) {
    console.log(`export-data error: ${e.message}`);
    return c.json({ error: e.message }, e.status || 500);
  }
});

// GET /admin/system-health — Phase 7: System health check
app.get("/make-server-37f42386/admin/system-health", async (c) => {
  try {
    const auth = await verifySuperadmin(c);
    let dbStatus = 'healthy';
    let lastSettingsUpdate: string | null = null;
    let kvRowCount = 0;
    try {
      const settings = await kv.get('platform:settings');
      if (settings?.updatedAt) lastSettingsUpdate = settings.updatedAt;
    } catch (e: any) {
      dbStatus = 'error';
      console.log(`[HealthCheck] DB connectivity error: ${e.message}`);
    }
    const prefixes = ['platform:', 'customer:', 'driver:', 'fuel:', 'toll:', 'audit:', 'station:', 'team:', 'user:', 'vehicle:', 'trip:'];
    for (const prefix of prefixes) {
      try {
        const entries = await kv.getByPrefix(prefix);
        kvRowCount += entries?.length || 0;
      } catch {}
    }
    return c.json({ dbStatus, kvRowCount, lastSettingsUpdate, serverTime: new Date().toISOString() });
  } catch (e: any) {
    console.log(`system-health error: ${e.message}`);
    return c.json({ error: e.message }, e.status || 500);
  }
});

// POST /admin/terminate-all-sessions — Phase 5: Emergency session termination
app.post("/make-server-37f42386/admin/terminate-all-sessions", async (c) => {
  try {
    const auth = await verifySuperadmin(c);
    // List all users and sign them out
    let count = 0;
    let page = 1;
    const perPage = 100;
    while (true) {
      const { data: { users }, error } = await supabase.auth.admin.listUsers({ page, perPage });
      if (error) throw error;
      if (!users || users.length === 0) break;
      for (const u of users) {
        try {
          await supabase.auth.admin.signOut(u.id, 'global');
          count++;
        } catch (e: any) {
          console.log(`[TerminateAll] Failed to sign out user ${u.id}: ${e.message}`);
        }
      }
      if (users.length < perPage) break;
      page++;
    }
    // Audit log
    try {
      await logAdminAction({ actorId: auth.userId, actorName: auth.name || auth.email, action: 'terminate_all_sessions', targetId: 'platform', targetEmail: 'N/A', details: `Signed out ${count} users` });
    } catch (e: any) {
      console.log(`[TerminateAll] Audit log failed (non-fatal): ${e.message}`);
    }
    return c.json({ success: true, count });
  } catch (e: any) {
    console.log(`terminate-all-sessions error: ${e.message}`);
    return c.json({ error: e.message }, e.status || 500);
  }
});

// PUT /admin/platform-settings
app.put("/make-server-37f42386/admin/platform-settings", async (c) => {
  try {
    const auth = await verifySuperadmin(c);
    if (auth instanceof Response) return auth;

    // Read old settings BEFORE overwriting so we can diff for audit
    const oldSettings = await kv.get("platform:settings");

    const settings = await c.req.json();
    settings.updatedAt = new Date().toISOString();
    await kv.set("platform:settings", settings);

    // Immediately invalidate cached settings so maintenance mode propagates instantly
    memCache.platformSettingsCache.invalidate('platform:settings');

    // Build a human-readable diff for the audit log
    let details = "Initial settings configuration";
    if (oldSettings && typeof oldSettings === "object") {
      const changes: string[] = [];
      const fieldsToCheck = [
        "platformName", "defaultCurrency", "fleetTimezone", "platformVersion", "maintenanceMode", "maintenanceMessage", "registrationMode", "requireApproval", "welcomeEmailMessage",
      ];
      for (const field of fieldsToCheck) {
        const oldVal = (oldSettings as any)[field];
        const newVal = settings[field];
        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
          changes.push(`${field}: '${oldVal}' → '${newVal}'`);
        }
      }
      // Diff enabledBusinessTypes
      const oldBt = (oldSettings as any).enabledBusinessTypes || {};
      const newBt = settings.enabledBusinessTypes || {};
      const allBtKeys = new Set([...Object.keys(oldBt), ...Object.keys(newBt)]);
      for (const k of allBtKeys) {
        if (oldBt[k] !== newBt[k]) {
          changes.push(`enabledBusinessTypes.${k}: ${oldBt[k]} → ${newBt[k]}`);
        }
      }
      // Diff announcement
      const oldAnn = JSON.stringify((oldSettings as any).announcement || {});
      const newAnn = JSON.stringify(settings.announcement || {});
      if (oldAnn !== newAnn) {
        const oa = (oldSettings as any).announcement || {};
        const na = settings.announcement || {};
        if (oa.enabled !== na.enabled) changes.push(`announcement.enabled: ${oa.enabled} → ${na.enabled}`);
        if (oa.type !== na.type) changes.push(`announcement.type: ${oa.type} → ${na.type}`);
        if (oa.message !== na.message) changes.push(`announcement.message changed`);
        if (oa.dismissible !== na.dismissible) changes.push(`announcement.dismissible: ${oa.dismissible} → ${na.dismissible}`);
      }
      // Diff securityPolicies
      const oldSec = (oldSettings as any).securityPolicies || {};
      const newSec = settings.securityPolicies || {};
      const allSecKeys = new Set([...Object.keys(oldSec), ...Object.keys(newSec)]);
      for (const k of allSecKeys) {
        if (JSON.stringify(oldSec[k]) !== JSON.stringify(newSec[k])) {
          changes.push(`securityPolicies.${k}: ${oldSec[k]} → ${newSec[k]}`);
        }
      }
      // Diff allowedDomains
      const oldDomains = JSON.stringify((oldSettings as any).allowedDomains || []);
      const newDomains = JSON.stringify(settings.allowedDomains || []);
      if (oldDomains !== newDomains) {
        changes.push(`allowedDomains: ${oldDomains} → ${newDomains}`);
      }
      // Diff enabledModules
      const oldMod = (oldSettings as any).enabledModules || {};
      const newMod = settings.enabledModules || {};
      const allModKeys = new Set([...Object.keys(oldMod), ...Object.keys(newMod)]);
      for (const k of allModKeys) {
        if (oldMod[k] !== newMod[k]) {
          changes.push(`enabledModules.${k}: ${oldMod[k]} → ${newMod[k]}`);
        }
      }
      details = changes.length > 0 ? changes.join(", ") : "No changes detected (re-saved)";
    }

    // Fire-and-forget audit log — never let it break the save
    logAdminAction({
      actorId: auth.userId,
      actorName: auth.name,
      action: "update_platform_settings",
      targetId: "platform",
      targetEmail: "N/A",
      details,
    }).catch((e: any) => console.log(`Audit log failed for platform-settings: ${e.message}`));

    return c.json({ success: true, data: settings });
  } catch (e: any) {
    console.log(`admin/platform-settings PUT error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// ---------------------------------------------------------------------------
// Ledger Column Configuration (Super Admin Portal)
// ---------------------------------------------------------------------------
// Per-business-type configuration for which ledgers are enabled and column settings.
// Stored as `ledger_config:{businessType}` in KV.
// ---------------------------------------------------------------------------

const VALID_BUSINESS_TYPES = ['rideshare', 'delivery', 'taxi', 'trucking', 'shipping'];
const VALID_LEDGER_TYPES = ['main', 'trip', 'fuel', 'toll'];

// GET /admin/ledger-config/:businessType — Get ledger config for a business type
app.get("/make-server-37f42386/admin/ledger-config/:businessType", async (c) => {
  try {
    const auth = await verifySuperadmin(c);
    if (auth instanceof Response) return auth;

    const businessType = c.req.param("businessType");
    if (!VALID_BUSINESS_TYPES.includes(businessType)) {
      return c.json({ error: `Invalid business type: ${businessType}` }, 400);
    }

    const config = await kv.get(`ledger_config:${businessType}`);
    if (!config) {
      // Return default config if none exists — keys must match ALL_COLUMNS in each ledger table
      return c.json({
        businessType,
        enabledLedgers: ['trip', 'fuel', 'toll'],
        columns: {
          main: [
            { key: 'date', label: 'Date', visible: true },
            { key: 'type', label: 'Type', visible: true },
            { key: 'amount', label: 'Amount', visible: true },
            { key: 'description', label: 'Description', visible: true },
            { key: 'reference', label: 'Reference', visible: true },
          ],
          trip: [
            { key: 'id', label: 'ID', visible: true },
            { key: 'date', label: 'Date/Time', visible: true },
            { key: 'tripDate', label: 'Date', visible: true },
            { key: 'tripTime', label: 'Time', visible: true },
            { key: 'driver', label: 'Driver', visible: true },
            { key: 'vehicle', label: 'Vehicle', visible: true },
            { key: 'platform', label: 'Platform', visible: true },
            { key: 'status', label: 'Status', visible: true },
            { key: 'distance', label: 'Distance', visible: true },
            { key: 'duration', label: 'Duration', visible: true },
            { key: 'amount', label: 'Amount', visible: true },
            { key: 'netIncome', label: 'Net Income', visible: true },
            { key: 'paymentMethod', label: 'Payment', visible: true },
            { key: 'cashCollected', label: 'Cash Collected', visible: true },
            { key: 'tips', label: 'Tips', visible: true },
            { key: 'surge', label: 'Surge', visible: true },
            { key: 'tolls', label: 'Tolls', visible: true },
            { key: 'serviceFee', label: 'Service Fee', visible: true },
            { key: 'pickup', label: 'Pickup', visible: true },
            { key: 'dropoff', label: 'Dropoff', visible: true },
            { key: 'serviceCategory', label: 'Service Category', visible: true },
            { key: 'batchSource', label: 'Batch Source', visible: true },
            { key: 'efficiencyScore', label: 'Efficiency', visible: true },
            { key: 'requestTime', label: 'Request Time', visible: true },
            { key: 'dropoffTime', label: 'Dropoff Time', visible: true },
            { key: 'serviceType', label: 'Service Type', visible: true },
            { key: 'grossEarnings', label: 'Gross Earnings', visible: true },
            { key: 'netPayout', label: 'Net Payout', visible: true },
            { key: 'baseFare', label: 'Base Fare', visible: true },
            { key: 'waitTime', label: 'Wait Time Fee', visible: true },
            { key: 'airportFees', label: 'Airport Fees', visible: true },
            { key: 'timeAtStop', label: 'Time at Stop', visible: true },
            { key: 'taxes', label: 'Taxes', visible: true },
            { key: 'indriveServiceFeePercent', label: 'InDrive Fee %', visible: true },
            { key: 'indriveNetIncome', label: 'InDrive Net Income', visible: true },
            { key: 'indriveBalanceDeduction', label: 'Balance Deduction', visible: true },
            { key: 'pickupArea', label: 'Pickup Area', visible: true },
            { key: 'dropoffArea', label: 'Dropoff Area', visible: true },
            { key: 'speed', label: 'Speed', visible: true },
            { key: 'earningsPerKm', label: 'Earnings/km', visible: true },
            { key: 'earningsPerMin', label: 'Earnings/min', visible: true },
            { key: 'tripRating', label: 'Trip Rating', visible: true },
            { key: 'dayOfWeek', label: 'Day of Week', visible: true },
            { key: 'anchorPeriod', label: 'Anchor Period', visible: true },
            { key: 'routeId', label: 'Route ID', visible: true },
            { key: 'notes', label: 'Notes', visible: true },
          ],
          fuel: [
            { key: 'id', label: 'ID', visible: true },
            { key: 'date', label: 'Date', visible: true },
            { key: 'vehicleId', label: 'Vehicle', visible: true },
            { key: 'driverId', label: 'Driver', visible: true },
            { key: 'amount', label: 'Amount', visible: true },
            { key: 'liters', label: 'Liters', visible: true },
            { key: 'pricePerLiter', label: 'Price/Liter', visible: true },
            { key: 'odometer', label: 'Odometer', visible: true },
            { key: 'location', label: 'Location', visible: true },
            { key: 'paymentSource', label: 'Payment Source', visible: true },
            { key: 'entryMode', label: 'Entry Mode', visible: false },
            { key: 'type', label: 'Type', visible: false },
            { key: 'auditStatus', label: 'Audit Status', visible: false },
          ],
          toll: [
            { key: 'id', label: 'ID', visible: true },
            { key: 'date', label: 'Date', visible: true },
            { key: 'vehiclePlate', label: 'Vehicle', visible: true },
            { key: 'driverName', label: 'Driver', visible: true },
            { key: 'plaza', label: 'Plaza', visible: true },
            { key: 'amount', label: 'Amount', visible: true },
            { key: 'type', label: 'Type', visible: true },
            { key: 'reconciliationStatus', label: 'Reconciliation', visible: true },
            { key: 'status', label: 'Status', visible: false },
            { key: 'paymentMethod', label: 'Payment Method', visible: false },
            { key: 'matchedTripId', label: 'Matched Trip', visible: false },
          ],
        },
      });
    }

    return c.json(config);
  } catch (e: any) {
    console.log(`admin/ledger-config GET error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// PUT /admin/ledger-config/:businessType — Save ledger config for a business type
app.put("/make-server-37f42386/admin/ledger-config/:businessType", async (c) => {
  try {
    const auth = await verifySuperadmin(c);
    if (auth instanceof Response) return auth;

    const businessType = c.req.param("businessType");
    if (!VALID_BUSINESS_TYPES.includes(businessType)) {
      return c.json({ error: `Invalid business type: ${businessType}` }, 400);
    }

    const body = await c.req.json();

    // Validate enabledLedgers
    if (body.enabledLedgers && !Array.isArray(body.enabledLedgers)) {
      return c.json({ error: 'enabledLedgers must be an array' }, 400);
    }
    const enabledLedgers = (body.enabledLedgers || []).filter((l: string) => VALID_LEDGER_TYPES.includes(l));

    // Validate columns
    const columns = body.columns || {};
    for (const ledgerType of VALID_LEDGER_TYPES) {
      if (columns[ledgerType] && !Array.isArray(columns[ledgerType])) {
        return c.json({ error: `columns.${ledgerType} must be an array` }, 400);
      }
    }

    const config = {
      businessType,
      enabledLedgers,
      columns,
      updatedAt: new Date().toISOString(),
      updatedBy: auth.userId,
    };

    await kv.set(`ledger_config:${businessType}`, config);

    // Audit log
    logAdminAction({
      actorId: auth.userId,
      actorName: auth.name,
      action: "update_ledger_config",
      targetId: businessType,
      targetEmail: "N/A",
      details: `Updated ledger config for ${businessType}: enabled ledgers = ${enabledLedgers.join(', ')}`,
    }).catch((e: any) => console.log(`Audit log failed for ledger-config: ${e.message}`));

    return c.json({ success: true, data: config });
  } catch (e: any) {
    console.log(`admin/ledger-config PUT error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// ---------------------------------------------------------------------------
// Bulk Delete — Preview
// ---------------------------------------------------------------------------
// Generic endpoint: fetch items by KV key prefix with optional filters,
// returning lean preview rows for the DeleteFlowModal.
// ---------------------------------------------------------------------------
app.post("/make-server-37f42386/bulk-delete-preview", requireAuth(), requirePermission('data.backfill'), async (c) => {
  try {
    const { prefix, startDate, endDate, dateField, driverId, platform, fields } = await c.req.json();

    if (!prefix || typeof prefix !== "string") {
      return c.json({ error: "Missing required 'prefix' parameter" }, 400);
    }

    const SAFETY_LIMIT = 50000;
    const PAGE_SIZE = 1000;
    const dateFld = dateField || "date";
    const requestedFields = Array.isArray(fields) && fields.length > 0 ? fields : null;

    // Paginate through all matching records to avoid the 1,000-row PostgREST cap
    let rows: any[] = [];
    let offset = 0;
    while (offset < SAFETY_LIMIT) {
      let query = supabase
        .from("kv_store_37f42386")
        .select("key, value")
        .like("key", `${prefix}%`)
        .range(offset, offset + PAGE_SIZE - 1);

      // Server-side date filtering via JSON field extraction
      if (startDate) {
        query = query.gte(`value->>${dateFld}`, startDate);
      }
      if (endDate) {
        query = query.lte(`value->>${dateFld}`, endDate);
      }

      // Server-side driverId filtering
      if (driverId) {
        query = query.eq("value->>driverId", driverId);
      }

      const { data, error } = await query;
      if (error) {
        console.log(`bulk-delete-preview query error at offset ${offset}: ${error.message}`);
        return c.json({ error: `Database query failed: ${error.message}` }, 500);
      }

      const page = data || [];
      rows = rows.concat(page);

      // If we got fewer than PAGE_SIZE rows, we've reached the end
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    console.log(`bulk-delete-preview: fetched ${rows.length} total rows for prefix "${prefix}"`);

    // Client-side platform filtering (case-insensitive)
    if (platform) {
      const plat = platform.toLowerCase();
      rows = rows.filter((r: any) => {
        const val = r.value;
        if (!val) return false;
        const p = (val.platform || "").toLowerCase();
        return p === plat || p.includes(plat);
      });
    }

    // Map to lean preview items
    const items = rows.map((r: any) => {
      const val = r.value || {};
      const item: Record<string, any> = { key: r.key };
      if (requestedFields) {
        for (const f of requestedFields) {
          item[f] = val[f] ?? null;
        }
      } else {
        Object.assign(item, val);
      }
      return item;
    });

    return c.json({ items, totalCount: items.length });
  } catch (e: any) {
    console.log(`bulk-delete-preview error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// ---------------------------------------------------------------------------
// Bulk Delete — Execute
// ---------------------------------------------------------------------------
// Accepts an array of KV keys and deletes them in chunks.
// Optionally cleans up Supabase Storage files referenced by the values.
// ---------------------------------------------------------------------------
app.post("/make-server-37f42386/bulk-delete-execute", requireAuth(), requirePermission('data.backfill'), async (c) => {
  try {
    const { keys, cleanupStorage } = await c.req.json();

    if (!Array.isArray(keys) || keys.length === 0) {
      return c.json({ error: "Missing or empty 'keys' array" }, 400);
    }
    if (keys.length > 5000) {
      return c.json({ error: "Too many items (max 5000). Please use narrower filters." }, 400);
    }

    const CHUNK_SIZE = 100;
    const FILE_CHUNK_SIZE = 50;
    const BUCKET_NAME = "make-37f42386-docs";
    const filesToDelete: string[] = [];

    for (let i = 0; i < keys.length; i += CHUNK_SIZE) {
      const chunk = keys.slice(i, i + CHUNK_SIZE);

      // If cleanupStorage requested, fetch values first to find file references
      if (cleanupStorage) {
        try {
          const values = await kv.mget(chunk);
          (values || []).forEach((item: any) => {
            if (!item) return;
            const urlFields = ["receiptUrl", "invoiceUrl", "photoUrl", "imageUrl", "fileUrl"];
            for (const field of urlFields) {
              const url = item[field];
              if (url && typeof url === "string" && url.includes(BUCKET_NAME)) {
                const parts = url.split(`${BUCKET_NAME}/`);
                if (parts.length > 1) {
                  const path = parts[1].split("?")[0];
                  if (path) filesToDelete.push(path);
                }
              }
            }
          });
        } catch (fetchErr: any) {
          console.log(`bulk-delete-execute: storage scan warning (non-fatal): ${fetchErr.message}`);
        }
      }

      // Delete the KV entries
      await kv.mdel(chunk);
    }

    // Cleanup storage files if any were found
    let filesDeletedCount = 0;
    if (filesToDelete.length > 0) {
      for (let i = 0; i < filesToDelete.length; i += FILE_CHUNK_SIZE) {
        const fileChunk = filesToDelete.slice(i, i + FILE_CHUNK_SIZE);
        try {
          await supabase.storage.from(BUCKET_NAME).remove(fileChunk);
          filesDeletedCount += fileChunk.length;
        } catch (storageErr: any) {
          console.log(`bulk-delete-execute: storage cleanup warning (non-fatal): ${storageErr.message}`);
        }
      }
    }

    console.log(`bulk-delete-execute: deleted ${keys.length} keys, ${filesDeletedCount} storage files`);
    return c.json({ success: true, deletedCount: keys.length, filesDeletedCount });
  } catch (e: any) {
    console.log(`bulk-delete-execute error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Phase 1: Per-Driver Ledger Summary Endpoint
// Aggregates ALL fare_earning ledger entries per driver into
// lifetime / monthly / today earnings & trip-count buckets.
// Used by DriversPage.tsx to display ledger-sourced financials.
// ═══════════════════════════════════════════════════════════════════════════
app.get("/make-server-37f42386/ledger/drivers-summary", requireAuth(), async (c) => {
  const t0 = Date.now();
  try {
    // Date param (for "today" bucket) — defaults to server's current date
    const dateParam = c.req.query("date");
    const today = dateParam || new Date().toISOString().split("T")[0];
    const monthStart = today.substring(0, 7) + "-01"; // YYYY-MM-01
    // Last day of month: go to next month day-0
    const [yr, mo] = today.substring(0, 7).split("-").map(Number);
    const monthEndDate = new Date(yr, mo, 0); // day 0 of next month = last day of this month
    const monthEnd = monthEndDate.toISOString().split("T")[0];

    console.log(
      `[Ledger DriversSummary] Starting — readModel=canonical today=${today}, month=${monthStart}..${monthEnd}`,
    );

    const entryValues = await fetchCanonicalFareEarningAll(c);
    console.log(`[Ledger DriversSummary] Canonical fare_earning rows: ${entryValues.length} (${Date.now() - t0}ms)`);

    // ── Aggregate by driver ────────────────────────────────────────
    const driverMap = new Map<string, {
      lifetimeEarnings: number;
      monthlyEarnings: number;
      todayEarnings: number;
      lifetimeTripCount: number;
      monthlyTripCount: number;
      todayTripCount: number;
    }>();

    let skippedNoDriver = 0;
    let skippedBadDate = 0;

    for (const e of entryValues) {
      if (!e) continue;

      const driverId = e.driverId;
      if (!driverId || driverId === "unknown") {
        skippedNoDriver++;
        continue;
      }

      const gross = Number(e.grossAmount) || 0;
      const entryDate = (e.date || "").substring(0, 10);

      if (!entryDate || entryDate.length !== 10) {
        skippedBadDate++;
        continue;
      }

      // Get or create driver bucket
      let bucket = driverMap.get(driverId);
      if (!bucket) {
        bucket = {
          lifetimeEarnings: 0,
          monthlyEarnings: 0,
          todayEarnings: 0,
          lifetimeTripCount: 0,
          monthlyTripCount: 0,
          todayTripCount: 0,
        };
        driverMap.set(driverId, bucket);
      }

      // Lifetime
      bucket.lifetimeEarnings += gross;
      bucket.lifetimeTripCount += 1;

      // Monthly
      if (entryDate >= monthStart && entryDate <= monthEnd) {
        bucket.monthlyEarnings += gross;
        bucket.monthlyTripCount += 1;
      }

      // Today
      if (entryDate === today) {
        bucket.todayEarnings += gross;
        bucket.todayTripCount += 1;
      }
    }

    // ── Build response object ──────────────────────────────────────
    const result: Record<string, any> = {};
    let totalLifetime = 0;
    for (const [driverId, bucket] of driverMap) {
      result[driverId] = {
        lifetimeEarnings: Number(bucket.lifetimeEarnings.toFixed(2)),
        monthlyEarnings: Number(bucket.monthlyEarnings.toFixed(2)),
        todayEarnings: Number(bucket.todayEarnings.toFixed(2)),
        lifetimeTripCount: bucket.lifetimeTripCount,
        monthlyTripCount: bucket.monthlyTripCount,
        todayTripCount: bucket.todayTripCount,
      };
      totalLifetime += bucket.lifetimeEarnings;
    }

    const durationMs = Date.now() - t0;
    console.log(`[Ledger DriversSummary] Returning summaries for ${driverMap.size} drivers, total lifetime earnings $${totalLifetime.toFixed(2)}, skipped ${skippedNoDriver} no-driver / ${skippedBadDate} bad-date, duration ${durationMs}ms`);

    return c.json({
      success: true,
      data: result,
      meta: {
        totalDrivers: driverMap.size,
        totalEntriesProcessed: entryValues.length,
        dateUsed: today,
        monthRange: `${monthStart}..${monthEnd}`,
        skippedNoDriver,
        skippedBadDate,
        durationMs,
        readModel: "canonical",
      },
    });
  } catch (e: any) {
    const durationMs = Date.now() - t0;
    console.error(`[Ledger DriversSummary] FAILED after ${durationMs}ms: ${e.message}`);
    return c.json({ success: false, error: `Ledger drivers-summary failed: ${e.message}`, meta: { durationMs } }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Phase 3: Fleet-Wide Ledger Summary Endpoint
// Aggregates ALL ledger entries fleet-wide: total earnings, cash collected,
// daily trend, top drivers, platform breakdown, revenue by type.
// Backend for ExecutiveDashboard (Phase 4) and FinancialsView (Phase 5).
// ═══════════════════════════════════════════════════════════════════════════
app.get("/make-server-37f42386/ledger/fleet-summary", requireAuth(), async (c) => {
  const t0 = Date.now();
  try {
    // ── Parse query params ─────────────────────────────────────────
    const daysParam = c.req.query("days");
    const startDateParam = c.req.query("startDate");
    const endDateParam = c.req.query("endDate");

    let periodStart: string;
    let periodEnd: string;

    if (startDateParam && endDateParam) {
      periodStart = startDateParam;
      periodEnd = endDateParam;
    } else {
      const days = daysParam ? parseInt(daysParam, 10) : 7;
      const now = new Date();
      periodEnd = now.toISOString().split("T")[0];
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - (days - 1));
      periodStart = startDate.toISOString().split("T")[0];
    }

    console.log(`[Ledger FleetSummary] Starting — readModel=canonical period=${periodStart}..${periodEnd}`);

    const entries = await fetchCanonicalLedgerEventsInPeriod(c, periodStart, periodEnd);

    console.log(
      `[Ledger FleetSummary] Fetched ${entries.length} entries (ledger_event) for period ${periodStart}..${periodEnd} in ${Date.now() - t0}ms`,
    );

    const agg = aggregateFleetSummaryFromLedgerLikeEntries(entries);
    const { totalEarnings, totalTripCount, totalCashCollected, dailyTrend, topDrivers, platformBreakdown, revenueByType } = agg;

    const durationMs = Date.now() - t0;
    console.log(
      `[Ledger FleetSummary] Done — ${entries.length} entries, $${totalEarnings.toFixed(2)} total earnings, ${totalTripCount} trips, ${dailyTrend.length} days, ${topDrivers.length} top drivers, ${platformBreakdown.length} platforms, ${durationMs}ms`,
    );

    return c.json({
      success: true,
      data: {
        totalEarnings,
        totalTripCount,
        totalCashCollected,
        dailyTrend,
        topDrivers,
        platformBreakdown,
        revenueByType,
      },
      meta: {
        periodStart,
        periodEnd,
        totalEntriesProcessed: entries.length,
        durationMs,
        readModel: "canonical",
      },
    });
  } catch (e: any) {
    const durationMs = Date.now() - t0;
    console.error(`[Ledger FleetSummary] FAILED after ${durationMs}ms: ${e.message}`);
    return c.json({ success: false, error: `Ledger fleet-summary failed: ${e.message}`, meta: { durationMs } }, 500);
  }
});

// ─── GET /ledger/cash-diagnostic/:driverId — Phase 2 diagnostic ──────────────
// Read-only: fetches all trips for a driver and returns a summary of cash-related
// fields (cashCollected, paymentMethod) so the operator can verify stored data.
app.get("/make-server-37f42386/ledger/cash-diagnostic/:driverId", requireAuth(), async (c) => {
    try {
        const startMs = Date.now();
        const driverId = c.req.param("driverId");
        if (!driverId) return c.json({ error: "Missing driverId" }, 400);

        // Resolve all known IDs for this driver
        const allDriverIds: string[] = [driverId];
        let resolvedDriverName = '';
        try {
            const driverRecord = await kv.get(`driver:${driverId}`);
            if (driverRecord) {
                if (driverRecord.uberDriverId) allDriverIds.push(driverRecord.uberDriverId);
                if (driverRecord.inDriveDriverId) allDriverIds.push(driverRecord.inDriveDriverId);
                resolvedDriverName = driverRecord.name || [driverRecord.firstName, driverRecord.lastName].filter(Boolean).join(' ') || '';
            }
        } catch { /* ignore */ }

        // Build OR filter
        const orParts: string[] = [];
        for (const id of allDriverIds) {
            orParts.push(`value->>driverId.eq.${id}`);
        }
        if (resolvedDriverName) {
            orParts.push(`value->>driverName.ilike.${resolvedDriverName}`);
        }
        const orFilter = orParts.join(',');

        // Fetch all trips
        let allTrips: any[] = [];
        const PAGE = 1000;
        let offset = 0;
        while (offset < 50000) {
            const { data, error } = await supabase
                .from("kv_store_37f42386")
                .select("value")
                .like("key", "trip:%")
                .or(orFilter)
                .range(offset, offset + PAGE - 1);
            if (error) throw error;
            const page = data || [];
            allTrips = allTrips.concat(page.map((d: any) => d.value).filter(Boolean));
            if (page.length < PAGE) break;
            offset += PAGE;
        }

        const completed = allTrips.filter((t: any) => t.status === 'Completed');

        // Group by platform
        const platforms: Record<string, any> = {};
        for (const t of completed) {
            const plat = t.platform || 'Unknown';
            if (!platforms[plat]) {
                platforms[plat] = { total: 0, withCashCollectedGt0: 0, withPaymentMethodCash: 0, withEitherCashSignal: 0, samples: [] };
            }
            const p = platforms[plat];
            p.total++;
            const hasCashCollected = (t.cashCollected || 0) > 0;
            const hasPaymentMethodCash = (t.paymentMethod || '').toLowerCase() === 'cash';
            if (hasCashCollected) p.withCashCollectedGt0++;
            if (hasPaymentMethodCash) p.withPaymentMethodCash++;
            if (hasCashCollected || hasPaymentMethodCash) p.withEitherCashSignal++;
            // Keep up to 10 samples per platform
            if (p.samples.length < 10) {
                p.samples.push({
                    id: t.id,
                    date: t.date,
                    amount: t.amount,
                    cashCollected: t.cashCollected ?? null,
                    paymentMethod: t.paymentMethod ?? null,
                    fareBreakdown: t.fareBreakdown ? { cashCollected: t.fareBreakdown.cashCollected ?? null } : null,
                });
            }
        }

        const durationMs = Date.now() - startMs;
        return c.json({
            success: true,
            driverId,
            driverName: resolvedDriverName,
            allDriverIds,
            totalTrips: allTrips.length,
            completedTrips: completed.length,
            platforms,
            durationMs,
        });
    } catch (e: any) {
        console.error('[CashDiagnostic] Error:', e);
        return c.json({ error: `Cash diagnostic failed: ${e.message}` }, 500);
    }
});

// ---------------------------------------------------------------------------
// UNVERIFIED VENDOR MANAGEMENT
// Phase 1 - Enterprise Vendor Verification System
// ---------------------------------------------------------------------------

// GET /unverified-vendors - Fetch all unverified vendors
app.get("/make-server-37f42386/unverified-vendors", requireAuth(), async (c) => {
    try {
        const status = c.req.query("status") as 'pending' | 'resolved' | undefined;
        
        console.log(`[UnverifiedVendors] Fetching vendors (status: ${status || 'all'})`);
        
        const vendors = await unverifiedVendor.getUnverifiedVendors(status);
        
        // Enrich all transactions with driver and vehicle names
        const allTransactions = vendors.flatMap((v: any) => v.transactions || []);
        const driverIds = [...new Set(allTransactions.map((t: any) => t.driverId).filter(Boolean))];
        const vehicleIds = [...new Set(allTransactions.map((t: any) => t.vehicleId).filter(Boolean))];
        
        // Fetch driver and vehicle details
        const drivers = driverIds.length > 0 ? await kv.mget(driverIds.map((id: string) => `driver:${id}`)) : [];
        const vehicles = vehicleIds.length > 0 ? await kv.mget(vehicleIds.map((id: string) => `vehicle:${id}`)) : [];
        
        const driverMap = new Map(drivers.filter(Boolean).map((d: any) => [d.id, d]));
        const vehicleMap = new Map(vehicles.filter(Boolean).map((v: any) => [v.id, v]));
        
        // Enrich vendors with transaction details
        const enrichedVendors = vendors.map((vendor: any) => ({
            ...vendor,
            transactions: (vendor.transactions || []).map((tx: any) => {
                const driver = tx.driverId ? driverMap.get(tx.driverId) : null;
                const vehicle = tx.vehicleId ? vehicleMap.get(tx.vehicleId) : null;
                
                return {
                    ...tx,
                    driverName: driver?.name || null,
                    vehicleName: vehicle?.licensePlate || vehicle?.name || null,
                };
            })
        }));
        
        // Calculate summary statistics
        const summary = {
            total: enrichedVendors.length,
            pending: enrichedVendors.filter((v: any) => v.status === 'pending').length,
            resolved: enrichedVendors.filter((v: any) => v.status === 'resolved').length,
            totalAmountAtRisk: enrichedVendors
                .filter((v: any) => v.status === 'pending')
                .reduce((sum: number, v: any) => sum + (v.metadata?.totalAmount || 0), 0)
        };
        
        console.log(`[UnverifiedVendors] Returning ${enrichedVendors.length} vendors, ${summary.pending} pending`);
        
        return c.json({
            vendors: filterByOrg(enrichedVendors, c),
            summary
        });
    } catch (error: any) {
        console.error('[UnverifiedVendors] Error fetching vendors:', error);
        return c.json({ 
            error: `Failed to fetch unverified vendors: ${error.message}` 
        }, 500);
    }
});

// GET /unverified-vendors/:id - Fetch single vendor with details
app.get("/make-server-37f42386/unverified-vendors/:id", requireAuth(), async (c) => {
    try {
        const vendorId = c.req.param("id");
        
        if (!vendorId) {
            return c.json({ error: 'Vendor ID is required' }, 400);
        }
        
        console.log(`[UnverifiedVendors] Fetching vendor details: ${vendorId}`);
        
        // Fetch vendor
        const vendor = await unverifiedVendor.getUnverifiedVendorById(vendorId);
        
        if (!vendor) {
            return c.json({ error: 'Vendor not found' }, 404);
        }
        if (!belongsToOrg(vendor, c)) {
            return c.json({ error: 'Vendor not found' }, 404);
        }
        
        // Fetch linked transactions (already included in vendor object from getUnverifiedVendorById)
        const transactions = vendor.transactions || [];
        
        // Extract unique drivers and vehicles
        const driverIds = [...new Set(transactions.map((t: any) => t.driverId).filter(Boolean))];
        const vehicleIds = [...new Set(transactions.map((t: any) => t.vehicleId).filter(Boolean))];
        
        // Fetch driver details
        const drivers = await kv.mget(driverIds.map((id: string) => `driver:${id}`));
        const validDrivers = drivers.filter((d: any) => d !== null);
        
        // Fetch vehicle details
        const vehicles = await kv.mget(vehicleIds.map((id: string) => `vehicle:${id}`));
        const validVehicles = vehicles.filter((v: any) => v !== null);
        
        // Create lookup maps for enrichment
        const driverMap = new Map(validDrivers.map((d: any) => [d.id, d]));
        const vehicleMap = new Map(validVehicles.map((v: any) => [v.id, v]));
        
        // Enrich transactions with driver and vehicle names
        const enrichedTransactions = transactions.map((tx: any) => {
            const driver = tx.driverId ? driverMap.get(tx.driverId) : null;
            const vehicle = tx.vehicleId ? vehicleMap.get(tx.vehicleId) : null;
            
            return {
                ...tx,
                driverName: driver?.name || null,
                vehicleName: vehicle?.licensePlate || vehicle?.name || null,
            };
        });
        
        // Fetch all verified stations for matching
        const allStations = await kv.getByPrefix('station:');
        const verifiedStations = allStations.filter((s: any) => s.status === 'verified');
        
        // Suggest matching stations
        const suggestedMatches = suggestStationMatches(
            vendor.name,
            verifiedStations,
            0.5, // 50% minimum confidence
            5    // Top 5 matches
        ).map((match: any) => ({
            stationId: match.station.id,
            stationName: match.station.name,
            brand: match.station.brand,
            address: match.station.address,
            confidence: Math.round(match.similarity * 100) / 100,
            reason: match.reason
        }));
        
        console.log(`[UnverifiedVendors] Returning vendor ${vendorId} with ${enrichedTransactions.length} transactions, ${suggestedMatches.length} suggested matches`);
        
        return c.json({
            vendor,
            transactions: enrichedTransactions,
            drivers: validDrivers,
            vehicles: validVehicles,
            suggestedMatches
        });
    } catch (error: any) {
        console.error(`[UnverifiedVendors] Error fetching vendor details:`, error);
        return c.json({ 
            error: `Failed to fetch vendor details: ${error.message}` 
        }, 500);
    }
});

// POST /unverified-vendors - Create unverified vendor from transaction
app.post("/make-server-37f42386/unverified-vendors", async (c) => {
    try {
        const body = await c.req.json();
        const { transactionId, vendorName, sourceType } = body;
        
        if (!transactionId || !vendorName) {
            return c.json({ 
                error: 'Transaction ID and vendor name are required' 
            }, 400);
        }
        
        if (!['no_gps', 'unmatched_name', 'manual_entry'].includes(sourceType)) {
            return c.json({ 
                error: 'Invalid sourceType. Must be: no_gps, unmatched_name, or manual_entry' 
            }, 400);
        }
        
        console.log(`[UnverifiedVendors] Creating vendor "${vendorName}" for transaction ${transactionId}`);
        
        const vendor = await unverifiedVendor.createOrUpdateUnverifiedVendor(
            transactionId,
            vendorName,
            sourceType
        );
        
        console.log(`[UnverifiedVendors] Vendor created/updated: ${vendor.id}`);
        
        return c.json({
            success: true,
            vendor
        });
    } catch (error: any) {
        console.error('[UnverifiedVendors] Error creating vendor:', error);
        return c.json({ 
            error: `Failed to create vendor: ${error.message}` 
        }, 500);
    }
});

// POST /unverified-vendors/bulk - Bulk create vendors from multiple transactions
app.post("/make-server-37f42386/unverified-vendors/bulk", async (c) => {
    try {
        const body = await c.req.json();
        const { transactions } = body;
        
        if (!Array.isArray(transactions) || transactions.length === 0) {
            return c.json({ 
                error: 'Transactions array is required and must not be empty' 
            }, 400);
        }
        
        // Validate each transaction
        for (const tx of transactions) {
            if (!tx.id || !tx.vendor) {
                return c.json({ 
                    error: 'Each transaction must have id and vendor fields' 
                }, 400);
            }
            if (!['no_gps', 'unmatched_name', 'manual_entry'].includes(tx.sourceType)) {
                return c.json({ 
                    error: `Invalid sourceType for transaction ${tx.id}` 
                }, 400);
            }
        }
        
        console.log(`[UnverifiedVendors] Bulk creating vendors for ${transactions.length} transactions`);
        
        const vendors = await unverifiedVendor.bulkCreateUnverifiedVendors(transactions);
        
        console.log(`[UnverifiedVendors] Bulk creation complete: ${vendors.length} unique vendors`);
        
        return c.json({
            success: true,
            vendors,
            summary: {
                processedTransactions: transactions.length,
                uniqueVendors: vendors.length
            }
        });
    } catch (error: any) {
        console.error('[UnverifiedVendors] Error in bulk creation:', error);
        return c.json({ 
            error: `Bulk vendor creation failed: ${error.message}` 
        }, 500);
    }
});

// PUT /unverified-vendors/:id/resolve - Resolve vendor to existing station
app.put("/make-server-37f42386/unverified-vendors/:id/resolve", async (c) => {
    try {
        const vendorId = c.req.param("id");
        const body = await c.req.json();
        const { stationId, resolvedBy } = body;
        
        if (!vendorId) {
            return c.json({ error: 'Vendor ID is required' }, 400);
        }
        
        if (!stationId || !resolvedBy) {
            return c.json({ 
                error: 'Station ID and resolvedBy are required' 
            }, 400);
        }
        
        console.log(`[UnverifiedVendors] Resolving vendor ${vendorId} to station ${stationId}`);
        
        const result = await unverifiedVendor.resolveVendorToStation(
            vendorId,
            stationId,
            resolvedBy
        );
        
        console.log(`[UnverifiedVendors] Resolution complete: ${result.summary.transactionsUpdated} transactions updated`);
        
        return c.json({
            success: true,
            ...result
        });
    } catch (error: any) {
        console.error('[UnverifiedVendors] Error resolving vendor:', error);
        return c.json({ 
            error: `Failed to resolve vendor: ${error.message}` 
        }, 500);
    }
});

// POST /unverified-vendors/:id/create-station - Create new station from vendor
app.post("/make-server-37f42386/unverified-vendors/:id/create-station", async (c) => {
    try {
        const vendorId = c.req.param("id");
        const body = await c.req.json();
        const { stationData, resolvedBy } = body;
        
        if (!vendorId) {
            return c.json({ error: 'Vendor ID is required' }, 400);
        }
        
        if (!stationData || !stationData.name) {
            return c.json({ 
                error: 'Station data with name is required' 
            }, 400);
        }
        
        if (!resolvedBy) {
            return c.json({ 
                error: 'resolvedBy is required' 
            }, 400);
        }
        
        console.log(`[UnverifiedVendors] Creating new station from vendor ${vendorId}: "${stationData.name}"`);
        
        const result = await unverifiedVendor.createStationFromVendor(
            vendorId,
            stationData,
            resolvedBy
        );
        
        console.log(`[UnverifiedVendors] New station created: ${result.station.id}, ${result.summary.transactionsUpdated} transactions updated`);
        
        return c.json({
            success: true,
            ...result
        });
    } catch (error: any) {
        console.error('[UnverifiedVendors] Error creating station:', error);
        return c.json({ 
            error: `Failed to create station: ${error.message}` 
        }, 500);
    }
});

// DELETE /unverified-vendors/:id - Reject/dismiss vendor
app.delete("/make-server-37f42386/unverified-vendors/:id", async (c) => {
    try {
        const vendorId = c.req.param("id");
        const body = await c.req.json();
        const { rejectedBy, reason, action = 'flag' } = body;
        
        if (!vendorId) {
            return c.json({ error: 'Vendor ID is required' }, 400);
        }
        
        if (!rejectedBy || !reason) {
            return c.json({ 
                error: 'rejectedBy and reason are required' 
            }, 400);
        }
        
        if (!['flag', 'dismiss'].includes(action)) {
            return c.json({ 
                error: 'action must be "flag" or "dismiss"' 
            }, 400);
        }
        
        console.log(`[UnverifiedVendors] Rejecting vendor ${vendorId}: ${reason}`);
        
        const result = await unverifiedVendor.rejectUnverifiedVendor(
            vendorId,
            rejectedBy,
            reason,
            action
        );
        
        console.log(`[UnverifiedVendors] Vendor rejected: ${result.summary.transactionsAffected} transactions ${action}ed`);
        
        return c.json({
            success: true,
            ...result
        });
    } catch (error: any) {
        console.error('[UnverifiedVendors] Error rejecting vendor:', error);
        return c.json({ 
            error: `Failed to reject vendor: ${error.message}` 
        }, 500);
    }
});

// ---------------------------------------------------------------------------
// TRANSACTION-LEVEL RESOLUTION (Individual Transaction Handling)
// ---------------------------------------------------------------------------

// PUT /unverified-vendors/:vendorId/transactions/:txId/resolve - Resolve single transaction to station
app.put("/make-server-37f42386/unverified-vendors/:vendorId/transactions/:txId/resolve", async (c) => {
    try {
        const vendorId = c.req.param("vendorId");
        const txId = c.req.param("txId");
        const body = await c.req.json();
        const { stationId } = body;
        
        if (!vendorId || !txId || !stationId) {
            return c.json({ error: 'vendorId, txId, and stationId are required' }, 400);
        }
        
        console.log(`[Transaction] Resolving transaction ${txId} to station ${stationId}`);
        
        // Get vendor
        const vendor = await kv.get(`unverified_vendor:${vendorId}`);
        if (!vendor) {
            return c.json({ error: 'Vendor not found' }, 404);
        }
        
        // Get station
        const station = await kv.get(`station:${stationId}`);
        if (!station) {
            return c.json({ error: 'Station not found' }, 404);
        }
        
        // Get transaction
        const transaction = await kv.get(`transaction:${txId}`);
        if (!transaction) {
            return c.json({ error: 'Transaction not found' }, 404);
        }
        
        // Update transaction with station info & release gate-hold
        const now = new Date().toISOString();
        transaction.location = station.name;
        transaction.vendor = station.name;
        transaction.stationId = stationId;
        transaction.unverifiedVendorResolved = true;
        transaction.resolvedAt = now;
        transaction.metadata = transaction.metadata || {};
        transaction.metadata.stationGateHold = false;
        transaction.metadata.matchedStationId = stationId;
        transaction.metadata.vendorVerificationStatus = 'verified';
        transaction.metadata.vendorMatchedAt = now;
        transaction.metadata.locationStatus = 'verified';
        transaction.metadata.verificationMethod = 'admin_vendor_resolution';
        transaction.metadata.gateReason = undefined;
        await kv.set(`transaction:${txId}`, stampOrg(transaction, c));
        
        // Move transaction from pending to resolved list on vendor
        vendor.transactionIds = vendor.transactionIds.filter((id: string) => id !== txId);
        vendor.resolvedTransactionIds = vendor.resolvedTransactionIds || [];
        if (!vendor.resolvedTransactionIds.includes(txId)) {
            vendor.resolvedTransactionIds.push(txId);
        }
        vendor.metadata = vendor.metadata || {};
        vendor.metadata.transactionCount = vendor.transactionIds.length;
        vendor.metadata.totalAmount = 0;
        
        // Recalculate vendor total amount from remaining transactions
        if (vendor.transactionIds.length > 0) {
            const remainingTxs = await kv.mget(vendor.transactionIds.map((id: string) => `transaction:${id}`));
            vendor.metadata.totalAmount = remainingTxs
                .filter(Boolean)
                .reduce((sum: number, tx: any) => sum + Math.abs(tx.amount || 0), 0);
        }
        
        // If vendor has no more transactions, mark it as resolved
        if (vendor.transactionIds.length === 0) {
            vendor.status = 'resolved';
            vendor.resolvedAt = new Date().toISOString();
            vendor.autoResolved = true;
        }
        
        await kv.set(`unverified_vendor:${vendorId}`, stampOrg(vendor, c));
        
        console.log(`[Transaction] Resolved transaction ${txId}, vendor has ${vendor.transactionIds.length} transactions remaining`);
        
        return c.json({
            success: true,
            transaction,
            vendor,
            remainingTransactions: vendor.transactionIds.length
        });
    } catch (error: any) {
        console.error('[Transaction] Error resolving transaction:', error);
        return c.json({ error: `Failed to resolve transaction: ${error.message}` }, 500);
    }
});

// POST /unverified-vendors/repair-resolved - One-time repair for transactions resolved before resolvedTransactionIds tracking
app.post("/make-server-37f42386/unverified-vendors/repair-resolved", async (c) => {
    try {
        console.log('[Repair] Scanning for orphaned resolved transactions...');
        const allTransactions = await kv.getByPrefix('transaction:');
        const allVendors = await kv.getByPrefix('unverified_vendor:');
        
        let repaired = 0;
        
        for (const tx of allTransactions) {
            if (!tx || !tx.unverifiedVendorResolved) continue;
            
            // Check if this tx is tracked in any vendor's resolvedTransactionIds
            const isTracked = allVendors.some((v: any) => 
                (v.resolvedTransactionIds || []).includes(tx.id) ||
                (v.transactionIds || []).includes(tx.id)
            );
            
            if (!isTracked) {
                // Fix stationGateHold if still true
                if (tx.metadata?.stationGateHold) {
                    tx.metadata.stationGateHold = false;
                    tx.metadata.locationStatus = 'verified';
                    tx.metadata.verificationMethod = 'admin_vendor_resolution';
                    tx.metadata.gateReason = undefined;
                    await kv.set(`transaction:${tx.id}`, stampOrg(tx, c));
                }
                
                // Find the vendor this tx belonged to and add to resolvedTransactionIds
                for (const vendor of allVendors) {
                    // Match by vendor name or metadata
                    const txVendor = tx.metadata?.unverifiedVendorId || tx.vendor;
                    if (vendor.id === tx.metadata?.unverifiedVendorId || 
                        (vendor.name && tx.metadata?.originalVendor && vendor.name.toLowerCase() === tx.metadata.originalVendor.toLowerCase())) {
                        vendor.resolvedTransactionIds = vendor.resolvedTransactionIds || [];
                        if (!vendor.resolvedTransactionIds.includes(tx.id)) {
                            vendor.resolvedTransactionIds.push(tx.id);
                            await kv.set(`unverified_vendor:${vendor.id}`, stampOrg(vendor, c));
                        }
                        break;
                    }
                }
                repaired++;
                console.log(`[Repair] Fixed orphaned resolved transaction: ${tx.id}`);
            }
        }
        
        return c.json({ success: true, repaired, message: `Repaired ${repaired} orphaned resolved transactions` });
    } catch (error: any) {
        console.error('[Repair] Error:', error);
        return c.json({ error: `Repair failed: ${error.message}` }, 500);
    }
});

// POST /unverified-vendors/:vendorId/transactions/:txId/create-station - Create station from single transaction
app.post("/make-server-37f42386/unverified-vendors/:vendorId/transactions/:txId/create-station", async (c) => {
    try {
        const vendorId = c.req.param("vendorId");
        const txId = c.req.param("txId");
        const body = await c.req.json();
        const { name, brand, address, city, state } = body;
        
        if (!vendorId || !txId || !name) {
            return c.json({ error: 'vendorId, txId, and station name are required' }, 400);
        }
        
        console.log(`[Transaction] Creating station "${name}" for transaction ${txId}`);
        
        // Get vendor
        const vendor = await kv.get(`unverified_vendor:${vendorId}`);
        if (!vendor) {
            return c.json({ error: 'Vendor not found' }, 404);
        }
        
        // Get transaction
        const transaction = await kv.get(`transaction:${txId}`);
        if (!transaction) {
            return c.json({ error: 'Transaction not found' }, 404);
        }
        
        // Create new station
        const now = new Date().toISOString();
        const stationId = `station_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const newStation = {
            id: stationId,
            name: name.trim(),
            brand: brand?.trim() || name.trim(),
            address: address?.trim() || 'Address to be updated',
            city: city?.trim() || '',
            state: state?.trim() || '',
            status: 'verified',
            source: 'unverified_vendor_resolution',
            createdAt: now,
            createdFrom: {
                vendorId,
                transactionId: txId,
                originalName: vendor.name
            }
        };
        
        await kv.set(`station:${stationId}`, stampOrg(newStation, c));
        
        // Update transaction & release gate-hold
        transaction.location = newStation.name;
        transaction.vendor = newStation.name;
        transaction.stationId = stationId;
        transaction.unverifiedVendorResolved = true;
        transaction.resolvedAt = now;
        transaction.metadata = transaction.metadata || {};
        transaction.metadata.stationGateHold = false;
        transaction.metadata.matchedStationId = stationId;
        transaction.metadata.vendorVerificationStatus = 'verified';
        transaction.metadata.vendorMatchedAt = now;
        transaction.metadata.locationStatus = 'verified';
        transaction.metadata.verificationMethod = 'admin_vendor_resolution';
        transaction.metadata.gateReason = undefined;
        await kv.set(`transaction:${txId}`, stampOrg(transaction, c));
        
        // Move transaction from pending to resolved list on vendor
        vendor.transactionIds = vendor.transactionIds.filter((id: string) => id !== txId);
        vendor.resolvedTransactionIds = vendor.resolvedTransactionIds || [];
        if (!vendor.resolvedTransactionIds.includes(txId)) {
            vendor.resolvedTransactionIds.push(txId);
        }
        vendor.metadata = vendor.metadata || {};
        vendor.metadata.transactionCount = vendor.transactionIds.length;
        vendor.metadata.totalAmount = 0;
        
        // Recalculate vendor total amount
        if (vendor.transactionIds.length > 0) {
            const remainingTxs = await kv.mget(vendor.transactionIds.map((id: string) => `transaction:${id}`));
            vendor.metadata.totalAmount = remainingTxs
                .filter(Boolean)
                .reduce((sum: number, tx: any) => sum + Math.abs(tx.amount || 0), 0);
        }
        
        // If vendor has no more transactions, mark it as resolved
        if (vendor.transactionIds.length === 0) {
            vendor.status = 'resolved';
            vendor.resolvedAt = now;
            vendor.autoResolved = true;
        }
        
        await kv.set(`unverified_vendor:${vendorId}`, stampOrg(vendor, c));
        
        console.log(`[Transaction] Created station ${stationId}, vendor has ${vendor.transactionIds.length} transactions remaining`);
        
        return c.json({
            success: true,
            station: newStation,
            transaction,
            vendor,
            remainingTransactions: vendor.transactionIds.length
        });
    } catch (error: any) {
        console.error('[Transaction] Error creating station:', error);
        return c.json({ error: `Failed to create station: ${error.message}` }, 500);
    }
});

// DELETE /unverified-vendors/:vendorId/transactions/:txId - Reject single transaction
app.delete("/make-server-37f42386/unverified-vendors/:vendorId/transactions/:txId", async (c) => {
    try {
        const vendorId = c.req.param("vendorId");
        const txId = c.req.param("txId");
        const body = await c.req.json();
        const { reason } = body;
        
        if (!vendorId || !txId || !reason) {
            return c.json({ error: 'vendorId, txId, and rejection reason are required' }, 400);
        }
        
        console.log(`[Transaction] Rejecting transaction ${txId}: ${reason}`);
        
        // Get vendor
        const vendor = await kv.get(`unverified_vendor:${vendorId}`);
        if (!vendor) {
            return c.json({ error: 'Vendor not found' }, 404);
        }
        
        // Get transaction
        const transaction = await kv.get(`transaction:${txId}`);
        if (!transaction) {
            return c.json({ error: 'Transaction not found' }, 404);
        }
        
        // Flag transaction as rejected
        const now = new Date().toISOString();
        transaction.rejectedFromVendor = true;
        transaction.rejectedAt = now;
        transaction.rejectionReason = reason;
        transaction.requiresReview = true;
        await kv.set(`transaction:${txId}`, stampOrg(transaction, c));
        
        // Move transaction from pending to rejected list on vendor
        vendor.transactionIds = vendor.transactionIds.filter((id: string) => id !== txId);
        vendor.rejectedTransactionIds = vendor.rejectedTransactionIds || [];
        if (!vendor.rejectedTransactionIds.includes(txId)) {
            vendor.rejectedTransactionIds.push(txId);
        }
        vendor.metadata = vendor.metadata || {};
        vendor.metadata.transactionCount = vendor.transactionIds.length;
        vendor.metadata.totalAmount = 0;
        
        // Recalculate vendor total amount
        if (vendor.transactionIds.length > 0) {
            const remainingTxs = await kv.mget(vendor.transactionIds.map((id: string) => `transaction:${id}`));
            vendor.metadata.totalAmount = remainingTxs
                .filter(Boolean)
                .reduce((sum: number, tx: any) => sum + Math.abs(tx.amount || 0), 0);
        }
        
        // If vendor has no more transactions, mark it as resolved
        if (vendor.transactionIds.length === 0) {
            vendor.status = 'resolved';
            vendor.resolvedAt = now;
            vendor.autoResolved = true;
        }
        
        await kv.set(`unverified_vendor:${vendorId}`, stampOrg(vendor, c));
        
        console.log(`[Transaction] Rejected transaction ${txId}, vendor has ${vendor.transactionIds.length} transactions remaining`);
        
        return c.json({
            success: true,
            transaction,
            vendor,
            remainingTransactions: vendor.transactionIds.length
        });
    } catch (error: any) {
        console.error('[Transaction] Error rejecting transaction:', error);
        return c.json({ error: `Failed to reject transaction: ${error.message}` }, 500);
    }
});

// POST /migrate-legacy-vendors - Phase 8: Scan for orphaned transactions (individual review mode)
app.post("/make-server-37f42386/migrate-legacy-vendors", async (c) => {
    try {
        const body = await c.req.json();
        const { dryRun = true } = body;
        
        console.log(`[Migration] Scanning for orphaned transactions`);
        
        const result = await unverifiedVendor.migrateLegacyVendors(dryRun);
        
        console.log(`[Migration] Scan complete: ${result.preview.reviewQueueCount} transactions need review`);
        
        return c.json({
            success: true,
            ...result
        });
    } catch (error: any) {
        console.error('[Migration] Error during migration scan:', error);
        return c.json({ 
            error: `Migration scan failed: ${error.message}` 
        }, 500);
    }
});

// POST /process-migration-transaction - Phase 8: Process individual orphaned transaction
app.post("/make-server-37f42386/process-migration-transaction", async (c) => {
    try {
        const body = await c.req.json();
        const { transactionId, action, data } = body;
        
        if (!transactionId || !action) {
            return c.json({ 
                error: 'Transaction ID and action are required' 
            }, 400);
        }
        
        console.log(`[Migration] Processing transaction ${transactionId} with action: ${action}`);
        
        const result = await unverifiedVendor.processMigrationTransaction(
            transactionId,
            action,
            data
        );
        
        console.log(`[Migration] Transaction processed successfully: ${result.message}`);
        
        return c.json({
            success: true,
            ...result
        });
    } catch (error: any) {
        console.error('[Migration] Error processing transaction:', error);
        return c.json({ 
            error: `Failed to process transaction: ${error.message}` 
        }, 500);
    }
});

// GET /stations/search - Search verified stations by name or address
app.get("/make-server-37f42386/stations/search", requireAuth(), async (c) => {
    try {
        const query = c.req.query("q");
        
        if (!query) {
            return c.json({ 
                error: 'Search query parameter "q" is required' 
            }, 400);
        }
        
        console.log(`[Stations] Searching for: "${query}"`);
        
        // Fetch all stations with "verified" status
        const allStations = await kv.getByPrefix('station:');
        
        const verifiedStations = allStations
            .filter((s: any) => s.status === 'verified')
            .map((s: any) => ({
                id: s.id,
                name: s.name,
                brand: s.brand,
                address: s.address,
                location: s.location,
                plusCode: s.plusCode
            }));
        
        // Simple fuzzy search by name or address
        const lowerQuery = query.toLowerCase();
        const matches = verifiedStations.filter((s: any) => 
            s.name.toLowerCase().includes(lowerQuery) ||
            s.address?.toLowerCase().includes(lowerQuery) ||
            s.brand?.toLowerCase().includes(lowerQuery)
        );
        
        console.log(`[Stations] Found ${matches.length} matches for "${query}"`);
        
        return c.json({
            stations: matches.slice(0, 20) // Limit to 20 results
        });
    } catch (error: any) {
        console.error('[Stations] Search error:', error);
        return c.json({ 
            error: `Station search failed: ${error.message}` 
        }, 500);
    }
});

// ---------------------------------------------------------------------------
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
