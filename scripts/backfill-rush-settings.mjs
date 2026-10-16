#!/usr/bin/env node
/**
 * Phase 3A: backfill rush_config from env emergency overrides (and optional notes for KV).
 * SQL-readable stores are handled by supabase/migrations/20261015220000_rush_config_backfill.sql.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-rush-settings.mjs [--dry]
 *
 * Env vars that map to registry keys (only inserted when present in the process env):
 *   COURIER_DISPATCH_RADIUS_KM          → courier.dispatch.radius_km
 *   COURIER_DISPATCH_MAX_OFFERS         → courier.dispatch.max_offers
 *   COURIER_DISPATCH_OFFER_TTL_MS       → courier.dispatch.offer_ttl_seconds (ms→s if ≥1000)
 *   RUSH_H3_DISPATCH_ENABLED            → courier.dispatch.h3_matching
 *   DASH_ALLOW_CASH_ORDERS              → customer.payment.cash_on_delivery
 *   DELIVERY_CUSTOMER_ORDERS_ENABLED    → customer.ordering.enabled
 *   DELIVERY_REMITTANCE_OFF             → courier.cash.remittance_enabled (inverted)
 *   DASH_STUCK_ORDER_MINUTES            → partner.orders.stuck_alert_minutes
 *   DASH_AUTO_DISPUTE_MAX_REFUND_JMD    → customer.refunds.auto_max_jmd
 *   RUSH_AUTO_DISPUTE_RESOLUTION        → customer.refunds.auto_resolution
 *   IN_HOUSE_ENABLED                    → customer.in_house.enabled (env override of flag)
 *   PAYMENTS_INTENTS_ENABLED            → customer.payment.card
 *
 * KV platform:settings:dash / :courier cannot be reliably mapped here (loose JSON, mostly unread).
 * Skip KV unless a future admin export is provided; registry defaults already match live behaviour.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const dryRun = process.argv.includes("--dry");
const PLATFORM_SCOPE = "00000000-0000-0000-0000-000000000000";
const sb = createClient(url, key, { db: { schema: "rush_config" } });

function parseBool(raw, { invertOff = false } = {}) {
  const t = String(raw).trim().toLowerCase();
  const truthy = ["1", "true", "yes", "on"].includes(t);
  const falsy = ["0", "false", "no", "off"].includes(t);
  if (!truthy && !falsy) return undefined;
  const bool = truthy;
  return invertOff ? !bool : bool;
}

function parseNumber(raw, { ttlMs = false } = {}) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  if (ttlMs && n >= 1000) return Math.round(n / 1000);
  return n;
}

/** @type {Array<{ env: string, key: string, parse: (raw: string) => unknown }>} */
const MAPPINGS = [
  { env: "COURIER_DISPATCH_RADIUS_KM", key: "courier.dispatch.radius_km", parse: (r) => parseNumber(r) },
  { env: "COURIER_DISPATCH_MAX_OFFERS", key: "courier.dispatch.max_offers", parse: (r) => parseNumber(r) },
  {
    env: "COURIER_DISPATCH_OFFER_TTL_MS",
    key: "courier.dispatch.offer_ttl_seconds",
    parse: (r) => parseNumber(r, { ttlMs: true }),
  },
  { env: "RUSH_H3_DISPATCH_ENABLED", key: "courier.dispatch.h3_matching", parse: (r) => parseBool(r) },
  { env: "DASH_ALLOW_CASH_ORDERS", key: "customer.payment.cash_on_delivery", parse: (r) => parseBool(r) },
  { env: "DELIVERY_CUSTOMER_ORDERS_ENABLED", key: "customer.ordering.enabled", parse: (r) => parseBool(r) },
  {
    env: "DELIVERY_REMITTANCE_OFF",
    key: "courier.cash.remittance_enabled",
    parse: (r) => parseBool(r, { invertOff: true }),
  },
  { env: "DASH_STUCK_ORDER_MINUTES", key: "partner.orders.stuck_alert_minutes", parse: (r) => parseNumber(r) },
  { env: "DASH_AUTO_DISPUTE_MAX_REFUND_JMD", key: "customer.refunds.auto_max_jmd", parse: (r) => parseNumber(r) },
  { env: "RUSH_AUTO_DISPUTE_RESOLUTION", key: "customer.refunds.auto_resolution", parse: (r) => parseBool(r) },
  { env: "IN_HOUSE_ENABLED", key: "customer.in_house.enabled", parse: (r) => parseBool(r) },
  { env: "PAYMENTS_INTENTS_ENABLED", key: "customer.payment.card", parse: (r) => parseBool(r) },
];

async function resolveActor() {
  // Prefer a platform_owner from RBAC when readable; else nil system actor (matches SQL).
  try {
    const publicSb = createClient(url, key);
    const { data } = await publicSb
      .schema("platform")
      .from("user_roles")
      .select("user_id, roles!inner(name)")
      .in("roles.name", ["platform_owner", "superadmin"])
      .limit(1)
      .maybeSingle();
    if (data?.user_id) return data.user_id;
  } catch {
    /* fall through */
  }
  return PLATFORM_SCOPE;
}

async function upsertSetting(actor, settingKey, value, reason) {
  const { data: existing } = await sb
    .from("setting_values")
    .select("key")
    .eq("key", settingKey)
    .eq("scope", "platform")
    .eq("scope_id", PLATFORM_SCOPE)
    .maybeSingle();

  if (existing) {
    console.log(`skip (already set): ${settingKey}`);
    return;
  }

  console.log(`${dryRun ? "[dry] " : ""}insert ${settingKey} = ${JSON.stringify(value)}`);
  if (dryRun) return;

  const { error: insErr } = await sb.from("setting_values").insert({
    key: settingKey,
    scope: "platform",
    scope_id: PLATFORM_SCOPE,
    value,
    version: 1,
    updated_by: actor,
  });
  if (insErr) {
    console.error(`failed setting_values ${settingKey}:`, insErr.message);
    return;
  }

  const { error: histErr } = await sb.from("setting_changes").insert({
    key: settingKey,
    scope: "platform",
    scope_id: null,
    old_value: null,
    new_value: value,
    reason,
    changed_by: actor,
  });
  if (histErr) console.error(`failed setting_changes ${settingKey}:`, histErr.message);
}

async function main() {
  const actor = await resolveActor();
  console.log("Actor:", actor);
  console.log("Note: KV platform:settings:dash/:courier skipped (unread / not typed).");

  let present = 0;
  for (const m of MAPPINGS) {
    const raw = process.env[m.env];
    if (raw == null || raw === "") {
      console.log(`env unset: ${m.env}`);
      continue;
    }
    const value = m.parse(raw);
    if (value === undefined) {
      console.warn(`could not parse ${m.env}=${raw}`);
      continue;
    }
    present += 1;
    await upsertSetting(actor, m.key, value, `Migrated from env ${m.env}`);
  }

  if (present === 0) {
    console.log("No mapped env vars present — nothing to insert. Registry defaults remain in force.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
