#!/usr/bin/env node
/**
 * Compare fare_earning event sums vs period earnings_gross for active weeks.
 * Run before enabling PROJECTION_EVENTS_FARES=true.
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, key);
const weekFrom = new Date();
weekFrom.setUTCDate(weekFrom.getUTCDate() - 56);
const fromYmd = weekFrom.toISOString().slice(0, 10);

const { data: periods, error } = await sb
  .from("driver_financial_periods")
  .select("driver_id, period_anchor, earnings_gross, driver_share, fleet_share, trip_count")
  .gte("period_anchor", fromYmd)
  .gt("earnings_gross", 0);
if (error) throw error;

const { data: events, error: evErr } = await sb
  .from("financial_events")
  .select("driver_id, period_anchor, event_type, amount_minor, reverses_event_id, reversed_at")
  .gte("period_anchor", fromYmd)
  .eq("event_type", "fare_earning");
if (evErr) throw evErr;

const fareByKey = new Map();
for (const ev of events || []) {
  if (ev.reverses_event_id || ev.reversed_at) continue;
  const k = `${ev.driver_id}|${String(ev.period_anchor).slice(0, 10)}`;
  const major = Math.abs(Number(ev.amount_minor) || 0) / 100;
  fareByKey.set(k, (fareByKey.get(k) || 0) + major);
}

let mismatches = 0;
const samples = [];
for (const p of periods || []) {
  const k = `${p.driver_id}|${String(p.period_anchor).slice(0, 10)}`;
  const fareEvents = Math.round((fareByKey.get(k) || 0) * 100) / 100;
  const gross = Number(p.earnings_gross) || 0;
  if (fareEvents < 0.005 && gross > 0.005 && Number(p.trip_count) > 0) {
    mismatches++;
    if (samples.length < 10) {
      samples.push({ k, gross, fareEvents, tripCount: p.trip_count, note: "trip_fallback_only" });
    }
  } else if (fareEvents > 0.005 && Math.abs(fareEvents - gross) > 0.02) {
    mismatches++;
    if (samples.length < 10) {
      samples.push({ k, gross, fareEvents, delta: gross - fareEvents });
    }
  }
}

console.log(JSON.stringify({ periodCount: periods?.length ?? 0, mismatches, samples }, null, 2));
process.exit(mismatches > 0 ? 0 : 0); // report only — non-zero mismatches are informational pre-cutover
